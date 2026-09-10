import type { Db } from '@/lib/advisors'
import type { SessionRow } from '@/lib/database.types'
import type { Session, SessionSummary } from '@/lib/quorum/types'
import { initials } from '@/lib/quorum/text'
import { outcomeOf, stageOf } from '@/lib/quorum/session'
import { fromPostgrestError } from '@/lib/api-errors'
import { ApiError } from '@/lib/errors'

/**
 * Board sessions — persistence only. The stages are run by
 * lib/board/convene.ts; the state machine is lib/quorum/session.ts.
 */

export async function createSession(db: Db, personId: string, question: string): Promise<SessionRow> {
  const { data, error } = await db.from('sessions').insert({ person_id: personId, question: question.trim() }).select('*').maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) throw new ApiError('The session was not created.', 500)
  return data
}

export async function getSessionRow(db: Db, id: string): Promise<SessionRow> {
  const { data, error } = await db.from('sessions').select('*').eq('id', id).maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) throw new ApiError('That session is not on the record.', 404)
  return data
}

/** The whole record: the row plus every contribution, in the order they landed. */
export async function loadSession(db: Db, id: string): Promise<Session> {
  const row = await getSessionRow(db, id)
  const [views, challenges, votes, person] = await Promise.all([
    db.from('session_views').select('*').eq('session_id', id).order('created_at'),
    db.from('session_challenges').select('*').eq('session_id', id).order('created_at'),
    db.from('session_votes').select('*').eq('session_id', id).order('created_at'),
    db.from('people').select('name').eq('id', row.person_id).maybeSingle(),
  ])
  for (const r of [views, challenges, votes]) if (r.error) throw fromPostgrestError(r.error)
  const session: Session = {
    id: row.id,
    question: row.question,
    status: row.status,
    stage: 1,
    recommendation: row.recommendation,
    error: row.error,
    convenedBy: person.data?.name ?? 'Someone on the roster',
    personId: row.person_id,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    views: (views.data ?? []).map((v) => ({ advisorId: v.advisor_id, name: v.advisor_name, initials: initials(v.advisor_name), role: v.advisor_role, view: v.view })),
    challenges: (challenges.data ?? []).map((c) => ({ fromId: c.from_advisor_id, toId: c.to_advisor_id, from: c.from_name, fi: initials(c.from_name), to: c.to_name, text: c.challenge })),
    votes: (votes.data ?? []).map((v) => ({ advisorId: v.advisor_id, name: v.advisor_name, initials: initials(v.advisor_name), vote: v.vote, statement: v.statement })),
  }
  session.stage = stageOf(session.status, { views: session.views.length, challenges: session.challenges.length, recommendation: Boolean(session.recommendation) })
  return session
}

/** The Sessions table: newest first, with the outcome derived from the votes. */
export async function listSessions(db: Db, limit = 100): Promise<SessionSummary[]> {
  const { data, error } = await db.from('sessions').select('id, question, status, created_at').order('created_at', { ascending: false }).limit(limit)
  if (error) throw fromPostgrestError(error)
  const rows = data ?? []
  const { data: votes, error: vError } = await db.from('session_votes').select('session_id, vote').in('session_id', rows.map((r) => r.id))
  if (vError) throw fromPostgrestError(vError)
  return rows.map((r) => {
    const mine = (votes ?? []).filter((v) => v.session_id === r.id).map((v) => ({ advisorId: '', name: '', initials: '', vote: v.vote, statement: '' }))
    const { outcome, tone } = outcomeOf({ status: r.status, votes: mine, createdAt: r.created_at })
    return { id: r.id, question: r.question, status: r.status, createdAt: r.created_at, outcome, tone }
  })
}

export async function updateSessionRow(db: Db, id: string, patch: Partial<Pick<SessionRow, 'status' | 'recommendation' | 'synthesis_model' | 'error' | 'completed_at'>>): Promise<void> {
  const { data, error } = await db.from('sessions').update(patch).eq('id', id).select('id').maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) throw new ApiError('Only the person who convened the board drives its session.', 403)
}
