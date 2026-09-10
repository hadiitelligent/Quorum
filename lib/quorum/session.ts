import type { SessionStatus, Vote } from '@/lib/database.types'
import type { Session, SessionSummary, SessionVote } from './types'

/**
 * The session state machine, pure. The database keeps the rows; this decides
 * what the rows mean: which stage the tracker lights, what is still to run,
 * what the Sessions table calls the outcome, and which votes are dissent.
 */

export const STATUS_ORDER: SessionStatus[] = ['views', 'challenges', 'synthesis', 'votes', 'done', 'failed']

export const STAGE_LABELS = [
  { n: '01', label: 'Independent views' },
  { n: '02', label: 'Challenge round' },
  { n: '03', label: 'Synthesis' },
] as const

/** Which of the three tracker steps has been reached. */
export function stageOf(status: SessionStatus, counts: { views: number; challenges: number; recommendation: boolean }): 0 | 1 | 2 | 3 {
  if (counts.recommendation || status === 'synthesis' || status === 'votes' || status === 'done') return 3
  if (status === 'challenges' || counts.challenges > 0) return 2
  if (status === 'views' || status === 'failed') return counts.views > 0 || status === 'views' ? 1 : 0
  return 1
}

/** A vote that is not "agree" is dissent, in the advisor's own words. */
export function dissentOf(votes: SessionVote[]): SessionVote[] {
  return votes.filter((v) => v.vote !== 'agree')
}

export const VOTE_LABELS: Record<Vote, string> = { agree: 'Agree', conditional: 'Conditional', disagree: 'Disagree' }

/** The Outcome tag in the Sessions table, and its tone. */
export function outcomeOf(
  session: Pick<Session, 'status' | 'votes' | 'createdAt'>,
  now: Date = new Date(),
): Pick<SessionSummary, 'outcome' | 'tone'> {
  if (session.status === 'failed') return { outcome: 'Stopped before synthesis', tone: 'neutral' }
  if (session.status !== 'done') return { outcome: 'In session', tone: 'accent' }
  const dissent = dissentOf(session.votes).length
  const fresh = now.getTime() - new Date(session.createdAt).getTime() < 24 * 3600 * 1000
  if (dissent === 0) return { outcome: 'Unanimous', tone: fresh ? 'accent' : 'neutral' }
  return { outcome: `Synthesis · ${dissent} dissent${dissent === 1 ? '' : 's'}`, tone: fresh ? 'accent' : 'neutral' }
}

/**
 * What the client still has to run, given the rows so far. Each step is an
 * idempotent POST; the server refuses duplicates by primary key, so two tabs
 * driving the same session cannot double a contribution.
 */
export type NextStep =
  | { kind: 'view'; advisorId: string }
  | { kind: 'challenge'; advisorId: string }
  | { kind: 'synthesis' }
  | { kind: 'vote'; advisorId: string }
  | { kind: 'complete' }
  | { kind: 'nothing' }

export function nextSteps(session: Session, roster: { id: string }[]): NextStep[] {
  if (session.status === 'done' || session.status === 'failed') return [{ kind: 'nothing' }]
  const ids = roster.map((a) => a.id)
  const viewed = new Set(session.views.map((v) => v.advisorId))
  const missingViews = ids.filter((id) => !viewed.has(id))
  if (missingViews.length) return missingViews.map((advisorId) => ({ kind: 'view', advisorId }))

  // With one advisor there is nobody to challenge; the round is skipped.
  if (ids.length > 1) {
    const challenged = new Set(session.challenges.map((c) => c.fromId))
    const missingChallenges = ids.filter((id) => !challenged.has(id))
    if (missingChallenges.length) return missingChallenges.map((advisorId) => ({ kind: 'challenge', advisorId }))
  }

  if (!session.recommendation) return [{ kind: 'synthesis' }]

  const voted = new Set(session.votes.map((v) => v.advisorId))
  const missingVotes = ids.filter((id) => !voted.has(id))
  if (missingVotes.length) return missingVotes.map((advisorId) => ({ kind: 'vote', advisorId }))

  return [{ kind: 'complete' }]
}

/** The status a session should carry once these rows exist — used by the routes after each write. */
export function statusFor(counts: { rosterSize: number; views: number; challenges: number; recommendation: boolean; votes: number }): SessionStatus {
  if (counts.recommendation && counts.votes >= counts.rosterSize) return 'done'
  if (counts.recommendation) return 'votes'
  const challengesDone = counts.rosterSize <= 1 || counts.challenges >= counts.rosterSize
  if (counts.views >= counts.rosterSize && challengesDone) return 'synthesis'
  if (counts.views >= counts.rosterSize) return 'challenges'
  return 'views'
}

/** The order the challenge round is shown in: as the rows landed. */
export function sortChallenges<T extends { text: string }>(rows: T[]): T[] {
  return rows
}

/** The prototype's placeholder question; what "Convene board" asks when the textarea is empty. */
export const DEFAULT_QUESTION = 'Should we raise our Series B now, or extend runway and raise in 12 months?'

/**
 * Two snapshots of the same session, merged: parallel stage requests each
 * return the whole record, and the one that lands last is not always the one
 * that knows most. Rows are unioned by advisor; the status is the furthest.
 */
export function mergeSession(a: Session, b: Session): Session {
  const byKey = <T>(rows: T[], key: (r: T) => string): T[] => {
    const seen = new Map<string, T>()
    for (const r of rows) if (!seen.has(key(r))) seen.set(key(r), r)
    return [...seen.values()]
  }
  const rank = (s: SessionStatus) => (s === 'failed' ? 99 : STATUS_ORDER.indexOf(s))
  const furthest = rank(a.status) >= rank(b.status) ? a : b
  const merged: Session = {
    ...furthest,
    recommendation: a.recommendation || b.recommendation,
    error: a.error || b.error,
    completedAt: a.completedAt ?? b.completedAt,
    views: byKey([...a.views, ...b.views], (v) => v.advisorId),
    challenges: byKey([...a.challenges, ...b.challenges], (c) => c.fromId),
    votes: byKey([...a.votes, ...b.votes], (v) => v.advisorId),
  }
  merged.stage = stageOf(merged.status, { views: merged.views.length, challenges: merged.challenges.length, recommendation: Boolean(merged.recommendation) })
  return merged
}
