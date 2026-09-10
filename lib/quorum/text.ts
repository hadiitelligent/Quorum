/**
 * Pure text helpers the prototype derived on the fly. No React, no database.
 */

/** "Dr. Amara Osei" → "AO"; honorifics are skipped so initials are a name. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w && !/^(dr|mr|mrs|ms|prof|sir|dame)\.?$/i.test(w))
  const letters = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')[0] ?? '').filter(Boolean)
  return (letters.length ? letters.slice(0, 2).join('') : name.trim()[0] ?? '?').toUpperCase() || '?'
}

/** The first non-honorific word: "Dr. Amara Osei" → "Amara". */
export function firstName(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w && !/^(dr|mr|mrs|ms|prof|sir|dame)\.?$/i.test(w))
  return words[0] ?? name.trim()
}

const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']

/** "Five advisors, on call." — a word up to ten, digits after. */
export function countWord(n: number): string {
  return WORDS[n] ?? String(n)
}

/** "Security & Infrastructure" → "Security": the first segment of a domain, for a new persona's default strength. */
export function primarySegment(domain: string): string {
  return domain.trim().split(/\s*&\s*|\s*,\s*|\s*\/\s*/)[0]?.trim() || domain.trim()
}

/** "84 docs · board memos, S-1s" — the grounding line on a library card. */
export function sourcesLine(docCount: number, categories: string[]): string {
  const docs = `${docCount} ${docCount === 1 ? 'doc' : 'docs'}`
  if (docCount === 0) return `${docs} · not yet grounded`
  const kinds = [...new Set(categories.map((c) => c.trim()).filter(Boolean))]
  return kinds.length ? `${docs} · ${kinds.join(', ')}` : docs
}

/** "Sep 2", or "Just now" inside the last minute. Dates in the browser's zone. */
export function editedLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  if (now.getTime() - at.getTime() < 60_000) return 'Just now'
  const sameYear = at.getFullYear() === now.getFullYear()
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** "Today", "Aug 28", … — the Convened column. */
export function convenedLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const sameDay = at.toDateString() === now.toDateString()
  if (sameDay) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (at.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return editedLabel(iso, now)
}

/** Strengths as the prototype validated them: up to three rows, 1–5, non-empty subjects. */
export function normalizeStrengths(rows: { s: string; lv: number }[]): { s: string; lv: number }[] {
  return rows
    .map((r) => ({ s: r.s.trim(), lv: Math.min(5, Math.max(1, Math.round(Number(r.lv) || 0))) }))
    .filter((r) => r.s.length > 0)
    .slice(0, 3)
}
