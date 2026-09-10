'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CaretDown, CaretUp, ChatCircle, Check, Copy, UsersThree } from '@phosphor-icons/react'
import type { Advisor } from '@/lib/quorum/types'
import { countWord } from '@/lib/quorum/text'
import { BRIEF_CHAR_CAP, DEFAULT_QUESTION, briefPrompt } from '@/lib/quorum/session'
import { api } from '@/lib/client-api'
import { useHref, useShell } from '@/components/shell/context'
import { useStored, writeStored } from '@/components/shell/stored'
import { Avatar } from '@/components/ui/avatar'
import { Meter } from '@/components/ui/meter'

const BRIEF_KEY = 'quorum.brief'

/** Screen 1 — the board: the convene panel (question + brief) and the advisor grid. */
export function Board() {
  const router = useRouter()
  const href = useHref()
  const { person } = useShell()
  const [roster, setRoster] = useState<Advisor[] | null>(null)
  const [question, setQuestion] = useState('')
  // The brief is remembered per browser, so the next session starts from the
  // last one and the client edits rather than rewrites.
  const brief = useStored(BRIEF_KEY) ?? ''
  const [briefOpenOverride, setBriefOpen] = useState<boolean | null>(null)
  const briefOpen = briefOpenOverride ?? brief.trim().length > 0
  const [copied, setCopied] = useState(false)
  // Who is in the room: everyone until the client unticks someone.
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const invited = (roster ?? []).filter((a) => !excluded.has(a.id))
  function toggle(id: string) {
    setExcluded((ex) => {
      const next = new Set(ex)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateBrief(text: string) {
    writeStored(BRIEF_KEY, text.trim() ? text : null)
  }
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(briefPrompt(person.name))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not reach the clipboard — select the prompt text below and copy it.')
      setBriefOpen(true)
    }
  }

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
    if (invited.length === 0) {
      setError('Pick at least one advisor for the session.')
      return
    }
    const r = await api.sessions.create(question.trim() || DEFAULT_QUESTION, brief.trim(), invited.map((a) => a.id))
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
                {invited.length === roster.length ? 'The whole board' : `${invited.length} of ${roster.length}`}
                {excluded.size > 0 && (
                  <>
                    {' · '}
                    <button type="button" className="linkish" onClick={() => setExcluded(new Set())}>
                      everyone
                    </button>
                  </>
                )}
              </span>
            </div>
            <div className="room-chips" role="group" aria-label="Advisors in the session">
              {roster.map((a) => {
                const on = !excluded.has(a.id)
                return (
                  <button type="button" key={a.id} className={`room-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(a.id)} title={a.role}>
                    <Avatar initials={a.initials} size={20} tone={on ? 'accent' : 'neutral'} />
                    <span>{a.name}</span>
                    {on && <Check size={12} />}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="brief">
          <button type="button" className="brief-toggle" onClick={() => setBriefOpen(!briefOpen)} aria-expanded={briefOpen}>
            {briefOpen ? <CaretUp size={13} /> : <CaretDown size={13} />}
            <span className="kicker muted">Brief the board</span>
            <span className="help">{brief.trim() ? `${brief.trim().length.toLocaleString()} characters attached` : 'Optional — but the board only knows what you tell it'}</span>
          </button>
          {briefOpen && (
            <div className="brief-body">
              <div className="help">
                Before each session, ask Claude to summarize your business and where it stands right now, then paste the answer here. Every
                advisor reads it at every stage, and it stays on the record with the session. The prompt below gets a brief a board can act on.
              </div>
              <div className="brief-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={copyPrompt}>
                  <Copy size={14} />
                  {copied ? 'Copied' : 'Copy the prompt for Claude'}
                </button>
                <a className="btn btn-ghost btn-sm" href="https://claude.ai/new" target="_blank" rel="noreferrer">
                  Open Claude
                </a>
              </div>
              <details className="brief-prompt">
                <summary className="help">See the prompt</summary>
                <pre>{briefPrompt(person.name)}</pre>
              </details>
              <textarea
                className="input"
                rows={6}
                value={brief}
                onChange={(e) => updateBrief(e.target.value)}
                maxLength={BRIEF_CHAR_CAP}
                placeholder="Paste Claude's brief here — the business, where it stands, cash and runway, customers, team, roadmap, risks, constraints."
                aria-label="The brief"
              />
            </div>
          )}
        </div>
        <div className="convene-foot">
          <div className="help">Each advisor forms an independent view before seeing the others&rsquo; — then they challenge, then synthesize.</div>
          <button className="btn btn-primary" onClick={convene} disabled={busy || invited.length === 0}>
            <UsersThree size={16} />
            {busy ? 'Convening…' : invited.length === count ? 'Convene board' : `Convene ${invited.length} of ${count}`}
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
