'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, CircleNotch, Copy, UsersThree } from '@phosphor-icons/react'
import type { Insight } from '@/lib/quorum/insight'
import { money, months, pct, totalOf, weightedPipeline } from '@/lib/quorum/insight'
import { BRIEF_CHAR_CAP, briefAgeDays, briefPrompt, updatePrompt } from '@/lib/quorum/session'
import { api, type StandingBrief } from '@/lib/client-api'
import { useHref, useShell } from '@/components/shell/context'

/**
 * The Business page. First visit: the setup — run the prompt in your own
 * Claude, paste the brief, and the page turns it into the insight. Later
 * visits: the insight, and the update prompt to keep it current.
 */
export function Business() {
  const href = useHref()
  const { person } = useShell()
  const [brief, setBrief] = useState<StandingBrief | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.brief.get().then((r) => {
      if (!alive) return
      if (r.ok) {
        setBrief(r.data.brief)
        setDraft(r.data.brief.content)
      } else setError(r.message)
    })
    return () => {
      alive = false
    }
  }, [])

  const hasBrief = Boolean(brief?.content.trim())
  const promptText = hasBrief && brief ? updatePrompt(brief.content, brief.updatedAt, person.name) : briefPrompt(person.name)

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(promptText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not reach the clipboard — open "See the prompt" and copy it by hand.')
    }
  }

  async function save() {
    if (busy || !draft.trim()) return
    setBusy(true)
    setError(null)
    const r = await api.brief.save(draft)
    setBusy(false)
    if (!r.ok) {
      setError(r.message)
      return
    }
    setBrief(r.data.brief)
    setEditing(false)
    if (r.data.brief.insightError) setError(`The brief is saved, but the insight could not be read from it: ${r.data.brief.insightError}`)
  }

  if (!brief) {
    return (
      <div className="page business">
        {error ? <div className="msg warn">{error}</div> : <div className="status-line"><CircleNotch size={15} className="pulse" />Opening…</div>}
      </div>
    )
  }

  const showSetup = !hasBrief || editing
  const age = briefAgeDays(brief.updatedAt)
  const ageLabel = age === null ? '' : age === 0 ? 'updated today' : age === 1 ? 'updated yesterday' : `updated ${age} days ago`

  return (
    <div className="page business">
      <div className="library-head">
        <div>
          <div className="kicker">{hasBrief ? 'Your business' : 'Set up your board'}</div>
          <h2 className="h2">{hasBrief && brief.insight ? brief.insight.company.name : hasBrief ? 'Your brief is in.' : 'Tell the board about your business.'}</h2>
        </div>
        {hasBrief && !editing && (
          <div className="actions">
            <button className="btn btn-secondary" onClick={() => setEditing(true)}>
              Update the brief
            </button>
            <Link href={href('/')} className="btn btn-primary">
              <UsersThree size={16} />
              Convene the board
            </Link>
          </div>
        )}
      </div>

      {showSetup && (
        <div className="card elev-sm setup">
          <div className="setup-steps">
            <div className="setup-step">
              <i>1</i>
              <div>
                <div className="setup-title">{hasBrief ? 'Copy the update prompt' : 'Copy the prompt'}</div>
                <div className="help">
                  {hasBrief
                    ? 'It carries your current brief. Your Claude will ask what changed, then rewrite the brief in full with a "what changed" section on top.'
                    : 'Your own Claude knows your business; the board does not. The prompt asks it for a complete brief: the business, where it stands, what you own and owe, cash flow, goals and targets for the year, and every deal in the pipeline.'}
                </div>
                <div className="brief-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={copyPrompt}>
                    <Copy size={14} />
                    {copied ? 'Copied' : hasBrief ? 'Copy the update prompt' : 'Copy the prompt for Claude'}
                  </button>
                  <a className="btn btn-ghost btn-sm" href="https://claude.ai/new" target="_blank" rel="noreferrer">
                    Open Claude
                  </a>
                </div>
                <details className="brief-prompt">
                  <summary className="help">See the prompt</summary>
                  <pre>{promptText}</pre>
                </details>
              </div>
            </div>
            <div className="setup-step">
              <i>2</i>
              <div>
                <div className="setup-title">Run it in your Claude</div>
                <div className="help">Answer what it asks for — numbers especially. It writes the brief; read it and correct anything wrong.</div>
              </div>
            </div>
            <div className="setup-step">
              <i>3</i>
              <div>
                <div className="setup-title">Paste the brief here</div>
                <textarea
                  className="input"
                  rows={12}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={BRIEF_CHAR_CAP}
                  placeholder="Paste the brief your Claude wrote."
                  aria-label="The brief"
                />
                <div className="brief-actions">
                  <button className="btn btn-primary" onClick={save} disabled={busy || !draft.trim()}>
                    {busy ? (
                      <>
                        <CircleNotch size={15} className="pulse" />
                        Reading your business…
                      </>
                    ) : hasBrief ? (
                      'Save the update'
                    ) : (
                      'Save and see your business'
                    )}
                  </button>
                  {hasBrief && (
                    <button className="btn btn-secondary" onClick={() => { setEditing(false); setDraft(brief.content) }} disabled={busy}>
                      Cancel
                    </button>
                  )}
                  {!hasBrief && (
                    <Link href={href('/')} className="btn btn-ghost btn-sm">
                      Skip for now <ArrowRight size={13} />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <div className="msg warn">{error}</div>}

      {hasBrief && !editing && (brief.insight ? <InsightView insight={brief.insight} ageLabel={ageLabel} /> : <div className="empty">The brief is saved ({ageLabel}), but no insight could be read from it yet. Update the brief to try again.</div>)}
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card elev-sm tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  )
}

function InsightView({ insight, ageLabel }: { insight: Insight; ageLabel: string }) {
  const c = insight.company.currency
  const assets = totalOf(insight.assets.total, insight.assets.items)
  const liabilities = totalOf(insight.liabilities.total, insight.liabilities.items)
  const overheads = totalOf(insight.overheads.monthlyTotal, insight.overheads.items)
  const pipe = weightedPipeline(insight.pipeline)
  const burn = insight.cash.monthlyNet
  const runway = insight.cash.runwayMonths ?? (burn !== null && burn < 0 && insight.cash.cash !== null ? Math.round((insight.cash.cash / -burn) * 10) / 10 : null)
  const worth = insight.valuation.estimate ?? (insight.valuation.low !== null && insight.valuation.high !== null ? (insight.valuation.low + insight.valuation.high) / 2 : null)

  return (
    <>
      <div className="overview">
        <div className="help">
          {insight.company.oneLiner}
          {insight.company.stage ? ` · ${insight.company.stage}` : ''}
          {insight.company.asOf ? ` · as of ${insight.company.asOf}` : ''}
          {ageLabel ? ` · brief ${ageLabel}` : ''}
        </div>
        <p className="overview-text">{insight.company.overview}</p>
      </div>

      <div className="tiles">
        <Tile label="Business worth" value={money(worth, c)} sub={insight.valuation.basis || undefined} />
        <Tile label="Assets held" value={money(assets, c)} sub={liabilities !== null ? `less ${money(liabilities, c)} owed` : undefined} />
        <Tile label="Cash" value={money(insight.cash.cash, c)} sub={burn !== null ? (burn < 0 ? `burning ${money(-burn, c)} a month` : `${money(burn, c)} a month free cash flow`) : undefined} />
        <Tile label="Runway" value={months(runway)} />
        <Tile label="Monthly overheads" value={money(overheads, c)} />
        <Tile label={insight.revenue.arr !== null ? 'ARR' : 'Annual revenue'} value={money(insight.revenue.arr ?? insight.revenue.annualRevenue, c)} sub={[insight.revenue.growthMonthlyPct !== null ? `${pct(insight.revenue.growthMonthlyPct)} MoM` : null, insight.revenue.grossMarginPct !== null ? `${pct(insight.revenue.grossMarginPct)} gross margin` : null, insight.revenue.headcount !== null ? `${insight.revenue.headcount} people` : null].filter(Boolean).join(' · ') || undefined} />
      </div>

      <div className="two-col">
        <section className="card elev-sm">
          <div className="kicker muted">Targets for the year</div>
          {insight.targets.length === 0 ? (
            <div className="help">The brief names no targets.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Target</th>
                  <th>Now</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {insight.targets.map((t, i) => (
                  <tr key={i}>
                    <td>{t.metric}</td>
                    <td>{t.target}</td>
                    <td>{t.current ?? '—'}{t.progressPct !== null ? ` (${pct(t.progressPct)})` : ''}</td>
                    <td>{t.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card elev-sm">
          <div className="kicker muted">Pipeline{pipe.count ? ` · ${pipe.count} deal${pipe.count === 1 ? '' : 's'}${pipe.total !== null ? ` · ${money(pipe.total, c)}` : ''}${pipe.weighted !== null ? ` · ${money(pipe.weighted, c)} weighted` : ''}` : ''}</div>
          {insight.pipeline.length === 0 ? (
            <div className="help">The brief names no deals.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Deal</th>
                  <th>Value</th>
                  <th>Stage</th>
                  <th>Close</th>
                </tr>
              </thead>
              <tbody>
                {insight.pipeline.map((d, i) => (
                  <tr key={i} title={d.blocker ? `Blocker: ${d.blocker}` : undefined}>
                    <td>{d.name}<span className="help"> · {d.kind}</span></td>
                    <td>{money(d.value, c)}{d.probabilityPct !== null ? ` · ${pct(d.probabilityPct)}` : ''}</td>
                    <td>{d.stage}</td>
                    <td>{d.expectedClose ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className="two-col">
        <section className="card elev-sm">
          <div className="kicker muted">Assets</div>
          {insight.assets.items.length === 0 ? <div className="help">The brief lists no assets.</div> : (
            <div className="rows">
              {insight.assets.items.map((a, i) => (
                <div className="row" key={i}>
                  <span>{a.name}{a.basis ? <span className="help"> · {a.basis}</span> : null}</span>
                  <b>{money(a.value, c)}</b>
                </div>
              ))}
            </div>
          )}
          {insight.liabilities.items.length > 0 && (
            <>
              <div className="kicker muted" style={{ marginTop: 'var(--space-3)' }}>Owed</div>
              <div className="rows">
                {insight.liabilities.items.map((l, i) => (
                  <div className="row" key={i}>
                    <span>{l.name}{l.terms ? <span className="help"> · {l.terms}</span> : null}</span>
                    <b>{money(l.value, c)}</b>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
        <section className="card elev-sm">
          <div className="kicker muted">Overheads, monthly</div>
          {insight.overheads.items.length === 0 ? <div className="help">The brief does not break overheads down.</div> : (
            <div className="rows">
              {insight.overheads.items.map((o, i) => (
                <div className="row" key={i}>
                  <span>{o.name}</span>
                  <b>{money(o.monthly, c)}</b>
                </div>
              ))}
            </div>
          )}
          {insight.unknowns.length > 0 && (
            <>
              <div className="kicker muted" style={{ marginTop: 'var(--space-3)' }}>The brief does not say</div>
              <div className="help">{insight.unknowns.join(' · ')}</div>
            </>
          )}
        </section>
      </div>
    </>
  )
}
