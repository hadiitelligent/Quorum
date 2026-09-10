import { DemoStore } from './script'
import type { NextStep } from '@/lib/quorum/session'

/**
 * Answers /api/* from the scripted store by patching window.fetch, so the
 * real screens run unchanged with no database and no model. Installed once,
 * at module load, by components/demo/boot.tsx. Development only.
 */

declare global {
  interface Window {
    __quorumDemo?: DemoStore
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export function installDemo(): DemoStore {
  if (typeof window === 'undefined') throw new Error('demo runs in the browser')
  if (window.__quorumDemo) return window.__quorumDemo
  const speed = Number(new URLSearchParams(window.location.search).get('speed') ?? '1') || 1
  const store = new DemoStore(speed)
  window.__quorumDemo = store
  const realFetch = window.fetch.bind(window)

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const path = url.startsWith('/') ? url : new URL(url).pathname
    if (!path.startsWith('/api/')) return realFetch(input, init)
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    let m: RegExpMatchArray | null

    if (path === '/api/advisors' && method === 'GET') return json({ advisors: store.advisors })
    if (path === '/api/advisors' && method === 'POST') return json({ advisor: store.createAdvisor(body as { name: string; role: string; bio?: string }) }, 201)
    if ((m = path.match(/^\/api\/advisors\/([^/]+)$/))) {
      const id = m[1]
      const a = store.advisors.find((x) => x.id === id)
      if (!a) return json({ message: 'That advisor is not on the board.' }, 404)
      if (method === 'GET') return json({ advisor: a, documents: store.documents[id] ?? [] })
      if (method === 'PATCH') return json({ advisor: store.updateAdvisor(id, body as never) })
      if (method === 'DELETE') {
        store.removeAdvisor(id)
        return json({ ok: true })
      }
    }
    if ((m = path.match(/^\/api\/advisors\/([^/]+)\/documents$/)) && method === 'POST') {
      const id = m[1]
      const b = body as { title: string; category: string; content: string }
      const docs = (store.documents[id] ??= []).filter((d) => d.title !== b.title)
      const doc = { id: `d-${Date.now()}`, advisorId: id, title: b.title, category: b.category, chars: b.content.length, createdAt: new Date().toISOString() }
      store.documents[id] = [...docs, doc]
      store.refreshSources(id)
      return json({ document: doc }, 201)
    }
    if ((m = path.match(/^\/api\/advisors\/([^/]+)\/documents\/([^/]+)$/)) && method === 'DELETE') {
      store.documents[m[1]] = (store.documents[m[1]] ?? []).filter((d) => d.id !== m![2])
      store.refreshSources(m[1])
      return json({ ok: true })
    }
    if ((m = path.match(/^\/api\/advisors\/([^/]+)\/chat$/))) {
      const id = m[1]
      const a = store.advisors.find((x) => x.id === id)
      if (!a) return json({ message: 'That advisor is not on the board.' }, 404)
      if (method === 'GET') return json({ advisor: a, messages: store.chats[id] ?? [] })
      if (method === 'POST') return json({ messages: await store.reply(id, String(body.message ?? '')), model: 'scripted' })
    }
    if (path === '/api/sessions' && method === 'GET') return json({ sessions: store.summaries() })
    if (path === '/api/sessions' && method === 'POST') return json({ session: store.createSession(String(body.question ?? ''), String(body.brief ?? ''), Array.isArray(body.advisorIds) ? (body.advisorIds as string[]) : []) }, 201)
    if ((m = path.match(/^\/api\/sessions\/([^/]+)$/)) && method === 'GET') {
      const s = store.sessions.find((x) => x.id === m![1])
      return s ? json({ session: s }) : json({ message: 'That session is not on the record.' }, 404)
    }
    if ((m = path.match(/^\/api\/sessions\/([^/]+)\/(views|challenges|votes)\/([^/]+)$/)) && method === 'POST') {
      const kind = ({ views: 'view', challenges: 'challenge', votes: 'vote' } as const)[m[2] as 'views' | 'challenges' | 'votes']
      return json({ session: await store.step(m[1], { kind, advisorId: m[3] } as NextStep) })
    }
    if ((m = path.match(/^\/api\/sessions\/([^/]+)\/(synthesis|complete)$/)) && method === 'POST') {
      return json({ session: await store.step(m[1], { kind: m[2] as 'synthesis' | 'complete' }) })
    }
    return json({ message: `Demo: no handler for ${method} ${path}` }, 404)
  }
  return store
}
