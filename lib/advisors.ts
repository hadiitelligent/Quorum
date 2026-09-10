import type { SupabaseClient } from '@supabase/supabase-js'
import type { AdvisorRow, Database, Strength } from '@/lib/database.types'
import type { Advisor } from '@/lib/quorum/types'
import { editedLabel, firstName, initials, normalizeStrengths, sourcesLine } from '@/lib/quorum/text'
import { fromPostgrestError } from '@/lib/api-errors'
import { ApiError } from '@/lib/errors'

/**
 * The personas — the seam between Postgres rows and the Advisor shape the
 * screens use. Everything runs through the caller's own session, so RLS
 * decides what an admin can do and a founder cannot.
 */

export type Db = SupabaseClient<Database>

type DocMeta = { advisor_id: string; category: string }

export function toAdvisor(row: AdvisorRow, docs: DocMeta[], now: Date = new Date()): Advisor {
  const mine = docs.filter((d) => d.advisor_id === row.id)
  return {
    id: row.id,
    name: row.name,
    firstName: firstName(row.name),
    initials: initials(row.name),
    role: row.role,
    bio: row.bio,
    temperament: row.temperament,
    strengths: normalizeStrengths(row.strengths ?? []),
    instructions: row.instructions,
    active: row.active,
    sources: sourcesLine(mine.length, mine.map((d) => d.category)),
    docCount: mine.length,
    edited: editedLabel(row.updated_at, now),
    updatedAt: row.updated_at,
  }
}

/** The active roster, in board order. */
export async function listAdvisors(db: Db, opts: { includeRemoved?: boolean } = {}): Promise<Advisor[]> {
  let query = db.from('advisors').select('*').order('sort_order').order('created_at')
  if (!opts.includeRemoved) query = query.eq('active', true)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  const rows = data ?? []
  const { data: docs, error: docError } = await db.from('advisor_documents').select('advisor_id, category').in('advisor_id', rows.map((r) => r.id))
  if (docError) throw fromPostgrestError(docError)
  return rows.map((r) => toAdvisor(r, docs ?? []))
}

export async function getAdvisor(db: Db, id: string, opts: { includeRemoved?: boolean } = {}): Promise<Advisor> {
  const { data, error } = await db.from('advisors').select('*').eq('id', id).maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data || (!opts.includeRemoved && !data.active)) throw new ApiError('That advisor is not on the board.', 404)
  const { data: docs, error: docError } = await db.from('advisor_documents').select('advisor_id, category').eq('advisor_id', id)
  if (docError) throw fromPostgrestError(docError)
  return toAdvisor(data, docs ?? [])
}

export type AdvisorInput = {
  name: string
  role: string
  bio?: string
  temperament?: string
  strengths?: Strength[]
  instructions?: string
}

export async function createAdvisor(db: Db, input: AdvisorInput, by: string): Promise<Advisor> {
  const { data: last } = await db.from('advisors').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await db
    .from('advisors')
    .insert({
      name: input.name.trim(),
      role: input.role.trim(),
      bio: (input.bio ?? '').trim(),
      temperament: (input.temperament ?? '').trim(),
      strengths: normalizeStrengths(input.strengths ?? []),
      instructions: (input.instructions ?? '').trim(),
      sort_order: (last?.sort_order ?? 0) + 1,
      created_by: by,
      updated_by: by,
    })
    .select('*')
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) throw new ApiError('The persona was not created.', 500)
  return toAdvisor(data, [])
}

export async function updateAdvisor(db: Db, id: string, patch: Partial<AdvisorInput>, by: string): Promise<Advisor> {
  const update: Database['public']['Tables']['advisors']['Update'] = { updated_by: by }
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.role !== undefined) update.role = patch.role.trim()
  if (patch.bio !== undefined) update.bio = patch.bio.trim()
  if (patch.temperament !== undefined) update.temperament = patch.temperament.trim()
  if (patch.instructions !== undefined) update.instructions = patch.instructions.trim()
  if (patch.strengths !== undefined) update.strengths = normalizeStrengths(patch.strengths)
  const { data, error } = await db.from('advisors').update(update).eq('id', id).eq('active', true).select('*').maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) throw new ApiError('That advisor is not on the board, or you may not edit it.', 404)
  return getAdvisor(db, data.id)
}

/** "Remove": the persona leaves the board; its chats and contributions stay. */
export async function removeAdvisor(db: Db, id: string, by: string): Promise<void> {
  const { data, error } = await db.from('advisors').update({ active: false, updated_by: by }).eq('id', id).eq('active', true).select('id').maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) throw new ApiError('That advisor is not on the board, or you may not remove it.', 404)
}
