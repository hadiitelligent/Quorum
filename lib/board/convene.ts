import 'server-only'

import { z } from 'zod'
import type { Db } from '@/lib/advisors'
import { getAdvisor } from '@/lib/advisors'
import type { PersonRow, SessionRow } from '@/lib/database.types'
import type { Session } from '@/lib/quorum/types'
import { rosterFor, statusFor } from '@/lib/quorum/session'
import { advisorModel, synthesisModel } from '@/lib/env'
import { loadSession, updateSessionRow } from '@/lib/sessions'
import { fromPostgrestError } from '@/lib/api-errors'
import { ApiError } from '@/lib/errors'
import { activeRoster, boardContext, personaSystem } from './context'
import { SYNTHESIS_SYSTEM, challengePrompt, synthesisPrompt, viewPrompt, votePrompt } from './prompts'
import { callJson, callText } from './model'

/**
 * The convene orchestration (spec §3), one stage per function. The client
 * drives them in order (lib/quorum/session.ts nextSteps), so each is a
 * bounded request on the Worker and the record grows row by row:
 *
 *   view       parallel, one per advisor — nobody sees the others' yet
 *   challenge  parallel, one per advisor — each sees every view, picks one
 *   synthesis  one call — the secretary writes the recommendation
 *   vote       parallel, one per advisor — agree / conditional / disagree,
 *              with a statement that IS the recorded dissent, verbatim
 *   complete   marks the session done once every vote is in
 *
 * Every function is idempotent: a contribution that already exists is
 * returned, not regenerated, so a reload or a second tab never doubles a row.
 * The database refuses a duplicate by primary key even if two requests race.
 */

type Ctx = { db: Db; person: PersonRow }

async function refreshStatus(db: Db, session: Session, rosterSize: number): Promise<Session> {
  const next = statusFor({ rosterSize, views: session.views.length, challenges: session.challenges.length, recommendation: Boolean(session.recommendation), votes: session.votes.length })
  if (next !== session.status && session.status !== 'done' && session.status !== 'failed') {
    await updateSessionRow(db, session.id, { status: next, ...(next === 'done' ? { completed_at: new Date().toISOString() } : {}) })
    return loadSession(db, session.id)
  }
  return session
}

function assertDriver(session: SessionRow | Session, person: PersonRow, row: SessionRow) {
  if (row.person_id !== person.id) throw new ApiError('Only the person who convened the board drives its session.', 403)
  if (session.status === 'done') throw new ApiError('That session is complete.', 409)
  if (session.status === 'failed') throw new ApiError('That session stopped before synthesis. Convene again.', 409)
}

/** Who is in the room for this session. */
async function sessionRoster(db: Db, session: Session) {
  return rosterFor(session, await activeRoster(db))
}

async function rowOf(db: Db, id: string): Promise<SessionRow> {
  const { data, error } = await db.from('sessions').select('*').eq('id', id).maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) throw new ApiError('That session is not on the record.', 404)
  return data
}

/** Marks where a run stopped, in words, and rethrows. */
async function failing<T>(db: Db, sessionId: string, stage: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // A duplicate is not a failure: the row landed from another request.
    if (e instanceof ApiError && e.status === 409) throw e
    await updateSessionRow(db, sessionId, { status: 'failed', error: `Stopped at ${stage}: ${message}` }).catch(() => {})
    throw e
  }
}

export async function runView({ db, person }: Ctx, sessionId: string, advisorId: string): Promise<Session> {
  const row = await rowOf(db, sessionId)
  let session = await loadSession(db, sessionId)
  assertDriver(session, person, row)
  const roster = await sessionRoster(db, session)
  if (!roster.some((a) => a.id === advisorId)) throw new ApiError('That advisor is not in this session.', 409)
  const existing = session.views.find((v) => v.advisorId === advisorId)
  if (!existing) {
    const advisor = await getAdvisor(db, advisorId)
    const system = await personaSystem(db, advisor, boardContext(person, roster))
    const out = await failing(db, sessionId, 'independent views', () =>
      callText({ model: advisorModel(), system, messages: [{ role: 'user', content: viewPrompt(session.question, session.brief) }], effort: 'medium' }),
    )
    const { error } = await db.from('session_views').insert({ session_id: sessionId, advisor_id: advisorId, advisor_name: advisor.name, advisor_role: advisor.role, view: out.text, model: out.model })
    if (error && error.code !== '23505') throw fromPostgrestError(error)
    session = await loadSession(db, sessionId)
  }
  return refreshStatus(db, session, roster.length)
}

export async function runChallenge({ db, person }: Ctx, sessionId: string, advisorId: string): Promise<Session> {
  const row = await rowOf(db, sessionId)
  let session = await loadSession(db, sessionId)
  assertDriver(session, person, row)
  const roster = await sessionRoster(db, session)
  const self = session.views.find((v) => v.advisorId === advisorId)
  if (!self) throw new ApiError('That advisor has not given a view yet.', 409)
  const others = session.views.filter((v) => v.advisorId !== advisorId)
  if (others.length === 0) throw new ApiError('Nobody to challenge on a board of one.', 409)
  if (!session.challenges.some((c) => c.fromId === advisorId)) {
    const advisor = await getAdvisor(db, advisorId)
    const system = await personaSystem(db, advisor, boardContext(person, roster))
    const schema = z.object({
      to: z.enum(others.map((o) => o.advisorId) as [string, ...string[]]),
      challenge: z.string().min(1),
    })
    const out = await failing(db, sessionId, 'the challenge round', () =>
      callJson({ model: advisorModel(), system, messages: [{ role: 'user', content: challengePrompt(session.question, self, session.views, session.brief) }], effort: 'medium' }, schema),
    )
    const target = others.find((o) => o.advisorId === out.data.to)!
    const { error } = await db.from('session_challenges').insert({
      session_id: sessionId,
      from_advisor_id: advisorId,
      to_advisor_id: target.advisorId,
      from_name: advisor.name,
      to_name: target.name,
      challenge: out.data.challenge.trim(),
      model: out.model,
    })
    if (error && error.code !== '23505') throw fromPostgrestError(error)
    session = await loadSession(db, sessionId)
  }
  return refreshStatus(db, session, roster.length)
}

export async function runSynthesis({ db, person }: Ctx, sessionId: string): Promise<Session> {
  const row = await rowOf(db, sessionId)
  let session = await loadSession(db, sessionId)
  assertDriver(session, person, row)
  const roster = await sessionRoster(db, session)
  if (session.views.length < roster.length) throw new ApiError('The board has not finished its independent views.', 409)
  if (!session.recommendation) {
    const schema = z.object({ recommendation: z.string().min(1) })
    const out = await failing(db, sessionId, 'the synthesis', () =>
      callJson(
        {
          model: synthesisModel(),
          system: [{ text: SYNTHESIS_SYSTEM, cache: true }],
          messages: [{ role: 'user', content: synthesisPrompt(session.question, session.views, session.challenges, session.brief) }],
          effort: 'high',
        },
        schema,
      ),
    )
    await updateSessionRow(db, sessionId, { recommendation: out.data.recommendation.trim(), synthesis_model: out.model, status: 'votes' })
    session = await loadSession(db, sessionId)
  }
  return refreshStatus(db, session, roster.length)
}

const VOTE = z.object({
  vote: z.enum(['agree', 'conditional', 'disagree']),
  statement: z.string().min(1),
})

export async function runVote({ db, person }: Ctx, sessionId: string, advisorId: string): Promise<Session> {
  const row = await rowOf(db, sessionId)
  let session = await loadSession(db, sessionId)
  assertDriver(session, person, row)
  const roster = await sessionRoster(db, session)
  if (!session.recommendation) throw new ApiError('The synthesis has not been written yet.', 409)
  const self = session.views.find((v) => v.advisorId === advisorId)
  if (!self) throw new ApiError('That advisor has not given a view yet.', 409)
  if (!session.votes.some((v) => v.advisorId === advisorId)) {
    const advisor = await getAdvisor(db, advisorId)
    const system = await personaSystem(db, advisor, boardContext(person, roster))
    const out = await failing(db, sessionId, 'the vote', () =>
      callJson({ model: advisorModel(), system, messages: [{ role: 'user', content: votePrompt(session.question, session.recommendation, session.challenges, self, session.brief) }], effort: 'medium' }, VOTE),
    )
    const { error } = await db.from('session_votes').insert({
      session_id: sessionId,
      advisor_id: advisorId,
      advisor_name: advisor.name,
      vote: out.data.vote,
      // Verbatim. This string is the recorded dissent when the vote is not "agree".
      statement: out.data.statement.trim(),
      model: out.model,
    })
    if (error && error.code !== '23505') throw fromPostgrestError(error)
    session = await loadSession(db, sessionId)
  }
  return refreshStatus(db, session, roster.length)
}

export async function complete({ db, person }: Ctx, sessionId: string): Promise<Session> {
  const row = await rowOf(db, sessionId)
  const session = await loadSession(db, sessionId)
  if (session.status === 'done') return session
  assertDriver(session, person, row)
  const roster = await sessionRoster(db, session)
  const voted = new Set(session.votes.map((v) => v.advisorId))
  if (!roster.every((a) => voted.has(a.id))) throw new ApiError('Not every advisor has voted yet.', 409)
  return refreshStatus(db, session, roster.length)
}
