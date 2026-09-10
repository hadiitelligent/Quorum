/**
 * Hand-written to match supabase/migrations/*.sql. Small enough to keep
 * honest; regenerate with `npx supabase gen types typescript` if it grows.
 *
 * NB: every shape is a `type`, never an `interface` — an interface has no
 * implicit index signature and postgrest-js degrades the query types to
 * `never` silently.
 */

type Timestamptz = string

export type SessionStatus = 'views' | 'challenges' | 'synthesis' | 'votes' | 'done' | 'failed'
export type Vote = 'agree' | 'conditional' | 'disagree'
export type Strength = { s: string; lv: number }

export type PersonRow = {
  id: string
  email: string
  name: string
  title: string
  is_admin: boolean
  active: boolean
  created_at: Timestamptz
}

export type AdvisorRow = {
  id: string
  name: string
  role: string
  bio: string
  temperament: string
  strengths: Strength[]
  instructions: string
  active: boolean
  sort_order: number
  created_by: string
  updated_by: string
  created_at: Timestamptz
  updated_at: Timestamptz
}

export type AdvisorDocumentRow = {
  id: string
  advisor_id: string
  title: string
  category: string
  content: string
  uploaded_by: string
  created_at: Timestamptz
}

export type ChatMessageRow = {
  id: string
  person_id: string
  advisor_id: string
  role: 'user' | 'advisor'
  content: string
  model: string | null
  created_at: Timestamptz
}

export type BriefRow = {
  person_id: string
  content: string
  insight: Record<string, unknown>
  insight_model: string | null
  insight_error: string
  updated_at: Timestamptz
}

export type SessionRow = {
  id: string
  person_id: string
  question: string
  brief: string
  advisor_ids: string[]
  status: SessionStatus
  recommendation: string
  synthesis_model: string | null
  error: string
  created_at: Timestamptz
  updated_at: Timestamptz
  completed_at: Timestamptz | null
}

export type SessionViewRow = {
  session_id: string
  advisor_id: string
  advisor_name: string
  advisor_role: string
  view: string
  model: string | null
  created_at: Timestamptz
}

export type SessionChallengeRow = {
  session_id: string
  from_advisor_id: string
  to_advisor_id: string
  from_name: string
  to_name: string
  challenge: string
  model: string | null
  created_at: Timestamptz
}

export type SessionVoteRow = {
  session_id: string
  advisor_id: string
  advisor_name: string
  vote: Vote
  statement: string
  model: string | null
  created_at: Timestamptz
}

type Table<Row, Insert, Update = Partial<Insert>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] }

export type Database = {
  public: {
    Tables: {
      people: Table<PersonRow, Omit<PersonRow, 'created_at' | 'title' | 'is_admin' | 'active'> & Partial<Pick<PersonRow, 'title' | 'is_admin' | 'active'>>>
      advisors: Table<
        AdvisorRow,
        Pick<AdvisorRow, 'name' | 'role'> & Partial<Omit<AdvisorRow, 'name' | 'role' | 'created_at' | 'updated_at'>>
      >
      advisor_documents: Table<
        AdvisorDocumentRow,
        Pick<AdvisorDocumentRow, 'advisor_id' | 'title' | 'content'> & Partial<Pick<AdvisorDocumentRow, 'id' | 'category' | 'uploaded_by'>>
      >
      chat_messages: Table<
        ChatMessageRow,
        Pick<ChatMessageRow, 'person_id' | 'advisor_id' | 'role' | 'content'> & Partial<Pick<ChatMessageRow, 'id' | 'model'>>
      >
      briefs: Table<BriefRow, Pick<BriefRow, 'person_id' | 'content'> & Partial<Pick<BriefRow, 'insight' | 'insight_model' | 'insight_error'>>>
      sessions: Table<
        SessionRow,
        Pick<SessionRow, 'person_id' | 'question'> & Partial<Omit<SessionRow, 'person_id' | 'question' | 'created_at' | 'updated_at'>>
      >
      session_views: Table<SessionViewRow, Omit<SessionViewRow, 'created_at' | 'model'> & Partial<Pick<SessionViewRow, 'model'>>>
      session_challenges: Table<SessionChallengeRow, Omit<SessionChallengeRow, 'created_at' | 'model'> & Partial<Pick<SessionChallengeRow, 'model'>>>
      session_votes: Table<SessionVoteRow, Omit<SessionVoteRow, 'created_at' | 'model'> & Partial<Pick<SessionVoteRow, 'model'>>>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
