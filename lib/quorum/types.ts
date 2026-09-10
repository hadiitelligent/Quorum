import type { SessionStatus, Strength, Vote } from '@/lib/database.types'

/**
 * The shapes the screens and the orchestration work with — camelCase, with
 * the derived fields the prototype kept on its advisor objects (initials,
 * firstName). lib/advisors.ts and lib/sessions.ts map rows to these; nothing
 * above them knows there is a database.
 */

export type Advisor = {
  id: string
  name: string
  firstName: string
  initials: string
  role: string
  bio: string
  temperament: string
  strengths: Strength[]
  instructions: string
  active: boolean
  /** "84 docs · board memos, S-1s" or "0 docs · not yet grounded" */
  sources: string
  docCount: number
  /** "Sep 2" — the last edit, formatted */
  edited: string
  updatedAt: string
}

export type AdvisorDocument = {
  id: string
  advisorId: string
  title: string
  category: string
  chars: number
  createdAt: string
}

export type ChatMessage = {
  id: string
  from: 'user' | 'adv'
  text: string
  createdAt: string
}

export type SessionView = { advisorId: string; name: string; initials: string; role: string; view: string }
export type SessionChallenge = { fromId: string; toId: string; from: string; fi: string; to: string; text: string }
export type SessionVote = { advisorId: string; name: string; initials: string; vote: Vote; statement: string }

export type Session = {
  id: string
  question: string
  status: SessionStatus
  /** 0 before any view, 1 independent views, 2 challenge round, 3 synthesis */
  stage: 0 | 1 | 2 | 3
  recommendation: string
  error: string
  convenedBy: string
  /** Who convened it — only they drive the stages. */
  personId: string
  createdAt: string
  completedAt: string | null
  views: SessionView[]
  challenges: SessionChallenge[]
  votes: SessionVote[]
}

export type SessionSummary = {
  id: string
  question: string
  status: SessionStatus
  createdAt: string
  outcome: string
  /** 'accent' for a fresh synthesis, 'neutral' otherwise — the tag style in the table */
  tone: 'accent' | 'neutral'
}
