'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChatCircle, UsersThree } from '@phosphor-icons/react'
import type { Advisor } from '@/lib/quorum/types'
import { countWord } from '@/lib/quorum/text'
import { DEFAULT_QUESTION } from '@/lib/quorum/session'
import { api } from '@/lib/client-api'
import { useHref } from '@/components/shell/context'
import { Avatar } from '@/components/ui/avatar'
import { Meter } from '@/components/ui/meter'

/** Screen 1 — the board: the convene panel and the advisor grid. */
export function Board() {
  const router = useRouter()
  const href = useHref()
  const [roster, setRoster] = useState<Advisor[] | null>(null)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.advisors.list().then((r) => {
      if (!alive) return
      if (r.ok) setRoster(r.data.advisors)
      else setError(r.message)
    })
    return () => {
      alive = false
    }
  }, [])

  async function convene() {
    if (busy) return
    setBusy(true)
    setError(null)
    const r = await api.sessions.create(question.trim() || DEFAULT_QUESTION)
    if (!r.ok) {
      setError(r.message)
      setBusy(false)
      return
    }
    router.push(href(`/sessions/${r.data.session.id}`))
  }

  const count = roster?.length ?? 0

  return (
    <div className="page board">
      <div>
        <div className="kicker">Your board</div>
        <h2 className="h2">{roster ? `${countWord(count)} advisors, on call.` : 'Your advisors, on call.'}</h2>
      </div>

      <div className="card elev-sm convene">
        <div className="kicker muted">Convene the board</div>
        <textarea
          className="input"
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={DEFAULT_QUESTION}
          aria-label="The decision to put to the board"
        />
        <div className="convene-foot">
          <div className="help">Each advisor forms an independent view before seeing the others&rsquo; — then they challenge, then synthesize.</div>
          <button className="btn btn-primary" onClick={convene} disabled={busy || count === 0}>
            <UsersThree size={16} />
            {busy ? 'Convening…' : 'Convene board'}
          </button>
        </div>
        {error && <div className="msg warn">{error}</div>}
      </div>

      {roster && roster.length === 0 && <div className="empty">Nobody is on the board yet. An admin adds personas in the Persona library.</div>}

      <div className="advisor-grid">
        {roster?.map((a) => (
          <div className="card elev-sm advisor-card" key={a.id}>
            <div className="card-head">
              <Avatar initials={a.initials} size={36} />
              <div>
                <div className="card-title">{a.name}</div>
                <div className="card-role">{a.role}</div>
              </div>
            </div>
            <p className="card-body">{a.bio || 'Newly added advisor — persona not yet configured.'}</p>
            <Meter strengths={a.strengths} />
            <div>
              <Link href={href(`/chat/${a.id}`)} className="btn btn-ghost btn-sm">
                <ChatCircle size={15} />
                Ask privately
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
