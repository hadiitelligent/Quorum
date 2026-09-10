'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CircleNotch, DownloadSimple, SealCheck } from '@phosphor-icons/react'
import type { Advisor, Session } from '@/lib/quorum/types'
import { STAGE_LABELS, VOTE_LABELS, dissentOf, mergeSession, nextSteps, rosterFor } from '@/lib/quorum/session'
import { memoFilename, sessionMemo } from '@/lib/quorum/memo'
import { convenedLabel } from '@/lib/quorum/text'
import { api } from '@/lib/client-api'
import { useHref, useShell } from '@/components/shell/context'
import { Avatar } from '@/components/ui/avatar'

/**
 * Screen 3 — a board session. The record is read from the API; while it is
 * live and mine, this component drives the stages (lib/quorum/session.ts
 * nextSteps): every step that can run in parallel is fired together, each
 * result is merged in as it lands, and the cards appear as they arrive.
 */
export function SessionView({ id }: { id: string }) {
  const href = useHref()
  const { person } = useShell()
  const [session, setSession] = useState<Session | null>(null)
  const [active, setActive] = useState<Advisor[] | null>(null)
  const roster = session && active ? rosterFor(session, active) : null
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)

  useEffect(() => {
    let alive = true
    Promise.all([api.sessions.get(id), api.advisors.list()]).then(([s, a]) => {
      if (!alive) return
      if (s.ok) setSession(s.data.session)
      else setError(s.message)
      if (a.ok) setActive(a.data.advisors)
    })
    return () => {
      alive = false
    }
  }, [id])

  const merge = useCallback((next: Session) => setSession((cur) => (cur ? mergeSession(cur, next) : next)), [])

  // The driver. Runs only for the person who convened the session.
  useEffect(() => {
    if (!session || !roster || running.current) return
    if (session.personId !== person.id) return
    const steps = nextSteps(session, roster)
    if (steps.length === 0 || steps[0].kind === 'nothing') return
    running.current = true
    let cancelled = false
    ;(async () => {
      const results = await Promise.all(steps.map((step) => api.sessions.step(id, step)))
      if (cancelled) return
      let failed: string | null = null
      for (const r of results) {
        if (r.ok) merge(r.data.session)
        else failed ??= r.message
      }
      if (failed) {
        // Re-read the record: the server may have marked where it stopped.
        const s = await api.sessions.get(id)
        if (!cancelled && s.ok) merge(s.data.session)
        if (!cancelled) setError(failed)
      }
      running.current = false
    })()
    return () => {
      cancelled = true
      running.current = false
    }
  }, [session, roster, person.id, id, merge])

  const live = session && session.status !== 'done' && session.status !== 'failed'
  const rosterSize = roster?.length ?? 0
  const formingViews = live && session.views.length < rosterSize
  const debating = live && session.stage === 2 && rosterSize > 1 && session.challenges.length < rosterSize
  const writing = live && session.status === 'synthesis' && !session.recommendation
  const voting = live && Boolean(session?.recommendation) && (session?.votes.length ?? 0) < rosterSize

  function exportMemo() {
    if (!session) return
    const blob = new Blob([sessionMemo(session, { boardName: 'Quorum' })], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = memoFilename(session.question, session.createdAt)
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (!session) {
    return (
      <div className="page session">
        {error ? <div className="msg warn">{error}</div> : <div className="status-line"><CircleNotch size={15} className="pulse" />Opening the session…</div>}
      </div>
    )
  }

  const dissent = dissentOf(session.votes)

  return (
    <div className="page session">
      <div className="session-head">
        <Link href={href('/')} className="btn btn-icon btn-secondary" aria-label="Back to board" style={{ flex: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <div>
          <div className="kicker">Board session · {live ? 'Live' : convenedLabel(session.createdAt)}</div>
          <h3>{session.question}</h3>
        </div>
      </div>

      {session.brief && (
        <details className="card elev-sm brief-record">
          <summary>
            <span className="kicker muted">The brief</span>
            <span className="help">{session.brief.length.toLocaleString()} characters · what the board was told</span>
          </summary>
          <pre>{session.brief}</pre>
        </details>
      )}

      <div className="steps" aria-label="Stages">
        {STAGE_LABELS.map((st, i) => (
          <div className={`step${session.stage >= i + 1 ? ' on' : ''}`} key={st.n}>
            <i>{st.n}</i>
            {st.label}
          </div>
        ))}
      </div>

      <div className="views-grid">
        {session.views.map((v) => (
          <div className="card elev-sm view-card fade-up-45" key={v.advisorId}>
            <div className="view-head">
              <Avatar initials={v.initials} size={26} />
              <div className="view-name">{v.name}</div>
              <span className="view-role">{v.role}</span>
            </div>
            <p className="view-text">{v.view}</p>
          </div>
        ))}
      </div>
      {formingViews && (
        <div className="status-line">
          <CircleNotch size={15} className="pulse" />
          Advisors are forming independent views — none can see the others&rsquo; yet.
        </div>
      )}

      {(session.challenges.length > 0 || debating) && (
        <div className="round">
          <div className="kicker muted">Challenge round</div>
          {session.challenges.map((x) => (
            <div className="exchange fade-up-45" key={x.fromId}>
              <Avatar initials={x.fi} size={26} tone="neutral" />
              <div>
                <div className="exchange-who">
                  {x.from} <ArrowRight size={10} /> {x.to}
                </div>
                <div className="exchange-text">{x.text}</div>
              </div>
            </div>
          ))}
          {debating && (
            <div className="status-line">
              <CircleNotch size={15} className="pulse" />
              Advisors are pressure-testing each other&rsquo;s views…
            </div>
          )}
        </div>
      )}

      {writing && (
        <div className="status-line">
          <CircleNotch size={15} className="pulse" />
          The board is writing its synthesis…
        </div>
      )}

      {session.recommendation && (
        <div className="card elev-md synth fade-up-50">
          <div className="synth-head">
            <SealCheck size={17} color="var(--color-accent)" />
            <span className="kicker">Board synthesis</span>
          </div>
          <p className="synth-text">{session.recommendation}</p>
          <div className="align" aria-label="Alignment">
            {session.votes.map((v) => (
              <div className="align-chip fade-up" key={v.advisorId} title={v.statement}>
                <Avatar initials={v.initials} size={20} tone="neutral" />
                {VOTE_LABELS[v.vote]}
              </div>
            ))}
          </div>
          {voting && (
            <div className="status-line">
              <CircleNotch size={15} className="pulse" />
              Advisors are voting on the synthesis…
            </div>
          )}
          {dissent.length > 0 && (
            <div className="dissent">
              <div className="dissent-tag">
                <span className="tag tag-accent">Recorded dissent</span>
              </div>
              {dissent.map((v) => (
                <p key={v.advisorId}>
                  {v.name} ({VOTE_LABELS[v.vote].toLowerCase()}): {v.statement}
                </p>
              ))}
            </div>
          )}
          <div className="synth-actions">
            <button className="btn btn-primary" onClick={exportMemo}>
              <DownloadSimple size={15} />
              Export memo
            </button>
            <Link href={href('/')} className="btn btn-secondary">
              Back to board
            </Link>
          </div>
        </div>
      )}

      {session.status === 'failed' && (
        <div className="card elev-sm" style={{ gap: 'var(--space-3)' }}>
          <div className="msg warn">{session.error || 'The session stopped before synthesis.'}</div>
          <div className="actions">
            <Link href={href('/')} className="btn btn-primary">
              Convene again
            </Link>
          </div>
        </div>
      )}
      {error && session.status !== 'failed' && <div className="msg warn">{error}</div>}
      {live && session.personId !== person.id && (
        <div className="status-line">
          <CircleNotch size={15} className="pulse" />
          {session.convenedBy} convened this session; it continues from their screen.
        </div>
      )}
    </div>
  )
}
