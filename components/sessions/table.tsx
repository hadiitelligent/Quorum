'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { SessionSummary } from '@/lib/quorum/types'
import { convenedLabel } from '@/lib/quorum/text'
import { api } from '@/lib/client-api'
import { useHref } from '@/components/shell/context'

/** Screen 4 — every decision, on the record. */
export function SessionsTable() {
  const href = useHref()
  const [rows, setRows] = useState<SessionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.sessions.list().then((r) => {
      if (!alive) return
      if (r.ok) setRows(r.data.sessions)
      else setError(r.message)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="page sessions">
      <div>
        <div className="kicker">Sessions</div>
        <h2 className="h2">Every decision, on the record.</h2>
      </div>
      {error && <div className="msg warn">{error}</div>}
      {rows && rows.length === 0 && <div className="empty">No sessions yet. Convene the board from the Board view.</div>}
      {rows && rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Question</th>
              <th>Convened</th>
              <th>Outcome</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{s.question}</td>
                <td>{convenedLabel(s.createdAt)}</td>
                <td>
                  <span className={`tag ${s.tone === 'accent' ? 'tag-accent' : 'tag-neutral'}`}>{s.outcome}</span>
                </td>
                <td>
                  <Link href={href(`/sessions/${s.id}`)}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
