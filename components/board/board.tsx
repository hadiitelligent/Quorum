'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChatCircle, Check, UsersThree, X } from '@phosphor-icons/react'
import type { Advisor } from '@/lib/quorum/types'
import { countWord } from '@/lib/quorum/text'
import { DEFAULT_QUESTION, briefAgeDays } from '@/lib/quorum/session'
import { api } from '@/lib/client-api'
import { useHref } from '@/components/shell/context'
import { Avatar } from '@/components/ui/avatar'
import { Meter } from '@/components/ui/meter'

/** Screen 1 — the board: the convene panel (question + brief) and the advisor grid. */
export function Board() {
  const router = useRouter()
  const href = useHref()
  const [roster, setRoster] = useState<Advisor[] | null>(null)
  const [question, setQuestion] = useState('')
  // The standing brief lives on the Business page; the board only says how fresh it is.
  const [brief, setBrief] = useState<{ has: boolean; updatedAt: string | null } | null>(null)
  // Who is in the room: nobody until the client clicks advisors in, in the
  // order they were clicked. Clicking a card again, or its chip, takes them out.
  const [selected, setSelected] = useState<string[]>([])
  const invited = selected.map((id) => roster?.find((a) => a.id === id)).filter((a): a is Advisor => Boolean(a))
  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.advisors.list().then((r) => {
      if (!alive) return
      if (r.ok) setRoster(r.data.advisors)
      else setError(r.message)
    })
    api.brief.get().then((r) => {
      if (!alive) return
      if (r.ok) setBrief({ has: r.data.brief.content.trim().length > 0, updatedAt: r.data.brief.updatedAt })
    })
    return () => {
      alive = false
    }
  }, [])

  async function convene() {
    if (busy) return
    if (invited.length === 0) {
      setError('Add at least one advisor to the room — click their card below.')
      return
    }
    setBusy(true)
    setError(null)
    const r = await api.sessions.create(question.trim() || DEFAULT_QUESTION, '', invited.map((a) => a.id))
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
        {roster && roster.length > 0 && (
          <div className="room">
            <div className="room-head">
              <span className="kicker muted">In the room</span>
              <span className="help">
                {invited.length === 0 ? 'Nobody yet' : invited.length === roster.length ? 'The whole board' : `${invited.length} of ${roster.length}`}
                {invited.length < roster.length && (
                  <>
                    {' · '}
                    <button type="button" className="linkish" onClick={() => setSelected(roster.map((a) => a.id))}>
                      add everyone
                    </button>
                  </>
                )}
                {invited.length > 0 && (
                  <>
                    {' · '}
                    <button type="button" className="linkish" onClick={() => setSelected([])}>
                      clear
                    </button>
                  </>
                )}
              </span>
            </div>
            <div className="room-chips" role="group" aria-label="Advisors in the session">
              {invited.length === 0 && <div className="help">Click an advisor below to add them to the session.</div>}
              {invited.map((a) => (
                <button type="button" key={a.id} className="room-chip on" onClick={() => toggle(a.id)} title={`Remove ${a.name} from the room`} aria-label={`Remove ${a.name} from the room`}>
                  <Avatar initials={a.initials} size={20} tone="accent" />
                  <span>{a.name}</span>
                  <X size={12} />
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="brief">
          <div className="brief-toggle" style={{ cursor: 'default' }}>
            <span className="kicker muted">The brief</span>
            <span className="help">
              {brief === null
                ? '…'
                : brief.has
                  ? (() => {
                      const age = briefAgeDays(brief.updatedAt)
                      const label = age === null ? 'your standing brief' : age === 0 ? 'updated today' : age === 1 ? 'updated yesterday' : `${age} days old`
                      return (
                        <>
                          Your standing brief, {label}
                          {age !== null && age >= 14 ? ' — get an update before convening' : ''} ·{' '}
                          <Link href={href('/business')}>{age !== null && age >= 14 ? 'Update it' : 'Business'}</Link>
                        </>
                      )
                    })()
                  : (
                      <>
                        None yet — the board only knows what you tell it · <Link href={href('/business')}>Brief the board</Link>
                      </>
                    )}
            </span>
          </div>
        </div>
        <div className="convene-foot">
          <div className="help">Each advisor forms an independent view before seeing the others&rsquo; — then they challenge, then synthesize.</div>
          <button className="btn btn-primary" onClick={convene} disabled={busy || invited.length === 0}>
            <UsersThree size={16} />
            {busy ? 'Convening…' : invited.length === 0 ? 'Convene board' : invited.length === count ? 'Convene the whole board' : `Convene ${invited.length} ${invited.length === 1 ? 'advisor' : 'advisors'}`}
          </button>
        </div>
        {error && <div className="msg warn">{error}</div>}
      </div>

      {roster && roster.length === 0 && <div className="empty">Nobody is on the board yet. An admin adds personas in the Persona library.</div>}

      <div className="advisor-grid">
        {roster?.map((a) => {
          const on = selected.includes(a.id)
          return (
          <div
            className={`card elev-sm advisor-card selectable${on ? ' selected' : ''}`}
            key={a.id}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            onClick={() => toggle(a.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggle(a.id)
              }
            }}
          >
            <div className="card-head">
              <Avatar initials={a.initials} size={36} />
              <div className="who">
                <div className="card-title">{a.name}</div>
                <div className="card-role">{a.role}</div>
              </div>
              <span className="pick" aria-hidden="true">{on ? <Check size={12} /> : null}</span>
            </div>
            <p className="card-body">{a.bio || 'Newly added advisor — persona not yet configured.'}</p>
            <Meter strengths={a.strengths} />
            <div className="card-foot">
              <Link href={href(`/chat/${a.id}`)} className="btn btn-ghost btn-sm" onClick={(e) => e.stopPropagation()}>
                <ChatCircle size={15} />
                Ask privately
              </Link>
              <span className="help">{on ? 'In the room' : 'Click to add'}</span>
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}
