import type { Session } from './types'
import { VOTE_LABELS, dissentOf } from './session'

/**
 * The "Export memo" button: the session as a Markdown document, the record
 * as it stands. Dissent is copied verbatim from the votes table.
 */
export function sessionMemo(session: Session, opts: { boardName?: string; now?: Date } = {}): string {
  const now = opts.now ?? new Date()
  const lines: string[] = []
  lines.push(`# Board memo — ${session.question}`)
  lines.push('')
  lines.push(`Convened by ${session.convenedBy} on ${new Date(session.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`)
  lines.push(`Exported ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}${opts.boardName ? ` from ${opts.boardName}` : ''}.`)
  lines.push('')
  if (session.recommendation) {
    lines.push('## Board synthesis')
    lines.push('')
    lines.push(session.recommendation)
    lines.push('')
    if (session.votes.length) {
      lines.push('### Alignment')
      lines.push('')
      for (const v of session.votes) lines.push(`- **${v.name}** — ${VOTE_LABELS[v.vote]}`)
      lines.push('')
    }
    const dissent = dissentOf(session.votes)
    if (dissent.length) {
      lines.push('### Recorded dissent')
      lines.push('')
      for (const v of dissent) {
        lines.push(`**${v.name}** (${VOTE_LABELS[v.vote]}):`)
        lines.push('')
        lines.push(`> ${v.statement.replace(/\n/g, '\n> ')}`)
        lines.push('')
      }
    }
  } else {
    lines.push(`_The board has not reached a synthesis (status: ${session.status}).${session.error ? ` ${session.error}` : ''}_`)
    lines.push('')
  }
  if (session.views.length) {
    lines.push('## Independent views')
    lines.push('')
    for (const v of session.views) {
      lines.push(`### ${v.name} — ${v.role}`)
      lines.push('')
      lines.push(v.view)
      lines.push('')
    }
  }
  if (session.challenges.length) {
    lines.push('## Challenge round')
    lines.push('')
    for (const c of session.challenges) {
      lines.push(`**${c.from} → ${c.to}:** ${c.text}`)
      lines.push('')
    }
  }
  return lines.join('\n').trimEnd() + '\n'
}

/** A filename for the download: the question, slugged. */
export function memoFilename(question: string, createdAt: string): string {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const day = createdAt.slice(0, 10)
  return `quorum-memo-${day}-${slug || 'session'}.md`
}
