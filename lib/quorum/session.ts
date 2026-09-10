import type { SessionStatus, Vote } from '@/lib/database.types'
import type { Session, SessionSummary, SessionVote } from './types'

/**
 * The session state machine, pure. The database keeps the rows; this decides
 * what the rows mean: which stage the tracker lights, what is still to run,
 * what the Sessions table calls the outcome, and which votes are dissent.
 */

export const STATUS_ORDER: SessionStatus[] = ['views', 'questions', 'challenges', 'synthesis', 'votes', 'done', 'failed']

export const STAGE_LABELS = [
  { n: '01', label: 'Independent views' },
  { n: '02', label: 'Challenge round' },
  { n: '03', label: 'Synthesis' },
] as const

/** Which of the three tracker steps has been reached. */
export function stageOf(status: SessionStatus, counts: { views: number; challenges: number; recommendation: boolean }): 0 | 1 | 2 | 3 {
  if (counts.recommendation || status === 'synthesis' || status === 'votes' || status === 'done') return 3
  if (status === 'challenges' || counts.challenges > 0) return 2
  if (status === 'questions') return 1
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
  /** The board is waiting on the client: nothing to run until they answer or proceed. */
  | { kind: 'answer' }
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

  // Questions asked and not yet closed: the client's move.
  if (session.questions.length > 0 && !session.questionsClosed) return [{ kind: 'answer' }]

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
export function statusFor(counts: { rosterSize: number; views: number; questionsOpen?: boolean; challenges: number; recommendation: boolean; votes: number }): SessionStatus {
  if (counts.recommendation && counts.votes >= counts.rosterSize) return 'done'
  if (counts.recommendation) return 'votes'
  const challengesDone = counts.rosterSize <= 1 || counts.challenges >= counts.rosterSize
  if (counts.views >= counts.rosterSize && challengesDone) return 'synthesis'
  if (counts.views >= counts.rosterSize && counts.questionsOpen) return 'questions'
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
    questions: byKey([...(a.questionsClosed ? a.questions : b.questionsClosed ? b.questions : [...a.questions, ...b.questions])], (q) => q.advisorId),
    questionsClosed: a.questionsClosed || b.questionsClosed,
    challenges: byKey([...a.challenges, ...b.challenges], (c) => c.fromId),
    votes: byKey([...a.votes, ...b.votes], (v) => v.advisorId),
  }
  merged.stage = stageOf(merged.status, { views: merged.views.length, challenges: merged.challenges.length, recommendation: Boolean(merged.recommendation) })
  return merged
}

/** The standing brief: the client's comprehensive summary of the business. Long enough for a real one; the cap keeps the record readable. */
export const BRIEF_CHAR_CAP = 60_000

/**
 * The prompt a client copies into their own Claude (claude.ai, the app, or
 * Claude Code with their files) to produce the standing brief. Their Claude
 * already knows their business; the board does not. Written so the answer is
 * comprehensive, structured, dated and honest about unknowns — what a board
 * needs to decide, not a pitch.
 */
export function briefPrompt(clientName?: string): string {
  return [
    `I keep an AI board of advisors that decides on questions I put to it. It knows nothing about my business except what I give it. Write the comprehensive brief it needs: my business, where it stands today, what we own and owe, our goals and targets, and every deal in the pipeline. Use everything you know about me${clientName ? ` (${clientName})` : ''} from our conversations, projects and files. Before you write, ask me for anything material you do not have — numbers especially — then write the brief in full.`,
    '',
    'Structure it as these sections, with plain headings, facts first:',
    '',
    '1. The business — what we sell, to whom, how we make money, the model and pricing, how big we are (revenue or ARR, growth rate, gross margin, headcount), stage, funding history, ownership.',
    '2. Where we stand today — the last quarter in numbers and events; what is working; what is not; what changed since the last brief.',
    '3. Assets — what we own and what it is worth: cash and equivalents, property and equipment, inventory, intellectual property, investments, key contracts and licences, the brand and audience. Dated valuations, with the basis.',
    '4. Liabilities and obligations — debt and its terms, leases, guarantees, deferred revenue, legal exposure, covenants and the headroom on them.',
    '5. Cash and runway — cash, burn or free cash flow, months of runway, capital in motion.',
    '6. Goals and targets — the numbers we are aiming at for the next 12 months and the next 3 years, what management calls the plan, and how we are tracking against it.',
    '7. Pipeline — every deal that matters (sales, partnerships, financing, acquisitions, hires): the counterparty, the value, the stage, the expected close date, the probability, the blocker, who owns it.',
    '8. Customers and market — concentration, retention and churn, the accounts that matter, the competitors and what they did lately.',
    '9. Team — who leads what, gaps, anyone at risk, hiring in progress.',
    '10. Product and roadmap — what ships when, and what it changes for the business.',
    '11. Risks and open questions — legal, regulatory, competitive, technical, key-person; what I am worried about.',
    '12. Constraints — what is fixed: deadlines, commitments, non-negotiables, what I will not do.',
    '',
    'Rules: every figure with a date and a basis; mark estimates as estimates and unknowns as unknown rather than filling gaps; no marketing language; write for a director who has never met me; under 3,000 words. When you are done, ask me whether anything is wrong, and correct it.',
  ].join('\n')
}

/**
 * The prompt for every later session: their Claude gets the current brief
 * back and revises it, so the board always reads one whole, current document
 * rather than a stack of updates.
 */
export function updatePrompt(currentBrief: string, updatedAt: string | null, clientName?: string): string {
  const when = updatedAt ? new Date(updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'the last time'
  return [
    `I am about to convene my AI board of advisors. Below is the standing brief on my business that you wrote for it, last updated ${when}. Bring it up to date. Use everything you know about me${clientName ? ` (${clientName})` : ''} from our conversations, projects and files since then; ask me for anything material you do not have — new numbers, deals that moved, anything that changed — then rewrite the brief in full.`,
    '',
    'Keep the same twelve sections and the same rules (every figure dated with its basis; estimates marked; unknowns left unknown; no marketing language; under 3,000 words). Add one section at the top, "What changed since the last brief", listing the material changes in a few lines each: numbers that moved, deals that advanced, closed or died, new risks, decisions taken. Then ask me whether anything is wrong, and correct it.',
    '',
    '--- CURRENT BRIEF ---',
    currentBrief.trim(),
    '--- END ---',
  ].join('\n')
}

/** Days since the brief was last saved; null when there is none. */
export function briefAgeDays(updatedAt: string | null, now: Date = new Date()): number | null {
  if (!updatedAt) return null
  const at = new Date(updatedAt).getTime()
  if (Number.isNaN(at)) return null
  return Math.max(0, Math.floor((now.getTime() - at) / 86_400_000))
}

/** The advisors in the room: the invited ones still on the board, or everyone active when nobody was named. */
export function rosterFor<T extends { id: string }>(session: Pick<Session, 'advisorIds'>, active: T[]): T[] {
  if (session.advisorIds.length === 0) return active
  const invited = new Set(session.advisorIds)
  return active.filter((a) => invited.has(a.id))
}
