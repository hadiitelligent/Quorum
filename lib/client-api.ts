import type { Advisor, AdvisorDocument, ChatMessage, Session, SessionSummary } from '@/lib/quorum/types'
import type { NextStep } from '@/lib/quorum/session'
import type { Insight } from '@/lib/quorum/insight'

/**
 * The browser's side of the API. Every call returns `{ ok, message }` so the
 * screen can show the server's own wording; nothing here retries or guesses.
 */

export type Result<T> = { ok: true; data: T } | { ok: false; message: string }

async function call<T>(url: string, method: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as T & { message?: string }
    if (!res.ok) return { ok: false, message: data.message || `Not saved (${res.status}).` }
    return { ok: true, data }
  } catch {
    return { ok: false, message: 'No connection — try again.' }
  }
}

export type StandingBrief = { content: string; updatedAt: string | null; insight: Insight | null; insightError: string }

export type AdvisorBody = {
  name: string
  role: string
  bio?: string
  temperament?: string
  strengths?: { s: string; lv: number }[]
  instructions?: string
}

export const api = {
  advisors: {
    list: () => call<{ advisors: Advisor[] }>('/api/advisors', 'GET'),
    get: (id: string) => call<{ advisor: Advisor; documents: AdvisorDocument[] }>(`/api/advisors/${id}`, 'GET'),
    create: (body: AdvisorBody) => call<{ advisor: Advisor }>('/api/advisors', 'POST', body),
    update: (id: string, body: Partial<AdvisorBody>) => call<{ advisor: Advisor }>(`/api/advisors/${id}`, 'PATCH', body),
    remove: (id: string) => call<{ ok: true }>(`/api/advisors/${id}`, 'DELETE'),
  },
  documents: {
    add: (advisorId: string, body: { title: string; category: string; content: string }) =>
      call<{ document: AdvisorDocument }>(`/api/advisors/${advisorId}/documents`, 'POST', body),
    remove: (advisorId: string, docId: string) => call<{ ok: true }>(`/api/advisors/${advisorId}/documents/${docId}`, 'DELETE'),
  },
  brief: {
    get: () => call<{ brief: StandingBrief }>('/api/brief', 'GET'),
    save: (content: string) => call<{ brief: StandingBrief }>('/api/brief', 'PUT', { content }),
  },
  chat: {
    get: (advisorId: string) => call<{ advisor: Advisor; messages: ChatMessage[] }>(`/api/advisors/${advisorId}/chat`, 'GET'),
    send: (advisorId: string, message: string) => call<{ messages: ChatMessage[]; model: string }>(`/api/advisors/${advisorId}/chat`, 'POST', { message }),
  },
  sessions: {
    list: () => call<{ sessions: SessionSummary[] }>('/api/sessions', 'GET'),
    create: (question: string, brief = '', advisorIds?: string[]) => call<{ session: Session }>('/api/sessions', 'POST', { question, brief, advisorIds }),
    get: (id: string) => call<{ session: Session }>(`/api/sessions/${id}`, 'GET'),
    step: (id: string, step: NextStep) => {
      switch (step.kind) {
        case 'view':
          return call<{ session: Session }>(`/api/sessions/${id}/views/${step.advisorId}`, 'POST')
        case 'challenge':
          return call<{ session: Session }>(`/api/sessions/${id}/challenges/${step.advisorId}`, 'POST')
        case 'synthesis':
          return call<{ session: Session }>(`/api/sessions/${id}/synthesis`, 'POST')
        case 'vote':
          return call<{ session: Session }>(`/api/sessions/${id}/votes/${step.advisorId}`, 'POST')
        case 'complete':
          return call<{ session: Session }>(`/api/sessions/${id}/complete`, 'POST')
        default:
          return Promise.resolve<Result<{ session: Session }>>({ ok: false, message: 'Nothing to run.' })
      }
    },
  },
}
