import type { Db } from '@/lib/advisors'
import type { AdvisorDocument } from '@/lib/quorum/types'
import type { Grounding } from '@/lib/board/prompts'
import { fromPostgrestError } from '@/lib/api-errors'
import { ApiError } from '@/lib/errors'

/**
 * A persona's knowledge base. Text documents only in this version: markdown,
 * plain text, pasted notes. The content is read straight into the persona's
 * system prompt (lib/board/prompts.ts groundingBlock), so uploads are capped.
 */

export const DOCUMENT_CHAR_CAP = 200_000

export async function listDocuments(db: Db, advisorId: string): Promise<AdvisorDocument[]> {
  const { data, error } = await db
    .from('advisor_documents')
    .select('id, advisor_id, title, category, created_at, content')
    .eq('advisor_id', advisorId)
    .order('created_at')
  if (error) throw fromPostgrestError(error)
  return (data ?? []).map((d) => ({ id: d.id, advisorId: d.advisor_id, title: d.title, category: d.category, chars: d.content.length, createdAt: d.created_at }))
}

/** The documents as the prompt builder wants them, oldest first. */
export async function groundingFor(db: Db, advisorId: string): Promise<Grounding[]> {
  const { data, error } = await db.from('advisor_documents').select('title, category, content').eq('advisor_id', advisorId).order('created_at')
  if (error) throw fromPostgrestError(error)
  return data ?? []
}

/** Uploading the same title again replaces it — one row per (advisor, title). */
export async function addDocument(db: Db, advisorId: string, input: { title: string; category: string; content: string }, by: string): Promise<AdvisorDocument> {
  const title = input.title.trim()
  if (!title) throw new ApiError('Give the document a title.', 422)
  if (input.content.length > DOCUMENT_CHAR_CAP) throw new ApiError(`That document is over ${DOCUMENT_CHAR_CAP.toLocaleString()} characters. Split it.`, 422)
  if (!input.content.trim()) throw new ApiError('That document is empty.', 422)
  const { error: delError } = await db.from('advisor_documents').delete().eq('advisor_id', advisorId).eq('title', title)
  if (delError) throw fromPostgrestError(delError)
  const { data, error } = await db
    .from('advisor_documents')
    .insert({ advisor_id: advisorId, title, category: input.category.trim(), content: input.content, uploaded_by: by })
    .select('id, advisor_id, title, category, created_at, content')
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) throw new ApiError('The document was not saved.', 500)
  return { id: data.id, advisorId: data.advisor_id, title: data.title, category: data.category, chars: data.content.length, createdAt: data.created_at }
}

export async function removeDocument(db: Db, advisorId: string, docId: string): Promise<void> {
  const { data, error } = await db.from('advisor_documents').delete().eq('advisor_id', advisorId).eq('id', docId).select('id')
  if (error) throw fromPostgrestError(error)
  if (!data?.length) throw new ApiError('That document is not there, or you may not remove it.', 404)
}
