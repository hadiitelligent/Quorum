/**
 * Turns the 10X Strategic Director decision library (the JSON export) into
 * the grounding documents for the persona in seed/advisors/06-10x-strategic-director.json:
 * one markdown document per decision domain, one for the sources, one for
 * how to read the library. Re-run when the library changes.
 *
 *   npm run import:10x -- "/path/to/10X_Strategic_Director_Decision_Library_v1.json"
 *
 * Output: seed/documents/06-10x-strategic-director/*.md + _documents.json
 * (the manifest `npm run seed -- --advisors` reads).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type Principle = {
  id: string
  domain: string
  title: string
  rule: string
  operational_interpretation: string
  evidence_level: 'A' | 'B' | 'C'
  aggression: number
  counterweight: string
  sources: string[]
}
type Library = {
  name: string
  version: string
  aggression: number
  unofficial: boolean
  principle_count: number
  evidence_levels: Record<string, string>
  principles: Principle[]
  sources: Record<string, { title: string; publisher: string; date: string; url: string; used: string }>
}

const input = process.argv[2]
if (!input) {
  console.error('Usage: npm run import:10x -- /path/to/library.json')
  process.exit(1)
}
const lib = JSON.parse(readFileSync(input, 'utf8')) as Library
const outDir = join('seed', 'documents', '06-10x-strategic-director')
mkdirSync(outDir, { recursive: true })

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const manifest: { file: string; title: string; category: string }[] = []

// 1. How to read the library.
const about = [
  `# ${lib.name} — how to read this library (v${lib.version})`,
  '',
  `${lib.principle_count} business-agnostic decision principles reconstructed from Grant Cardone's public material and documented operating behaviour. Unofficial: this library powers a Grant Cardone-inspired virtual board member; it does not impersonate him and must not claim he personally endorses any recommendation.`,
  '',
  `Default aggression: ${lib.aggression}/10.`,
  '',
  '## Evidence levels',
  '',
  ...Object.entries(lib.evidence_levels).map(([k, v]) => `- **${k}** — ${v}`),
  '',
  'Use A-level principles as core derived principles; B-level confidently but labelled as inferred where attribution matters; C-level as part of the operating system, never as a quote or a personal claim.',
  '',
  '## Key finding: rhetoric versus institutional behaviour',
  '',
  'The public rhetoric is often intentionally extreme, while the institutional operating behaviour is materially more structured: filings disclose acquisition criteria, leverage ranges, occupancy thresholds, property-quality preferences, long hold periods and risk factors. The correct synthesis: move with unusual speed and commitment once decision-critical uncertainty is bounded, but apply stronger underwriting as exposure becomes larger, more leveraged or less reversible.',
  '',
  '## Domains',
  '',
  ...[...new Set(lib.principles.map((p) => p.domain))].map((d) => `- ${d} (${lib.principles.filter((p) => p.domain === d).length})`),
  '',
].join('\n')
writeFileSync(join(outDir, '00-how-to-read.md'), about)
manifest.push({ file: '00-how-to-read.md', title: 'How to read the 10X decision library', category: 'decision library' })

// 2. One document per domain.
const domains = [...new Set(lib.principles.map((p) => p.domain))]
domains.forEach((domain, i) => {
  const rows = lib.principles.filter((p) => p.domain === domain)
  const body = [
    `# ${domain} — ${rows.length} principles`,
    '',
    ...rows.flatMap((p) => [
      `## ${p.id} — ${p.title}`,
      '',
      `Rule: ${p.rule}`,
      '',
      `In practice: ${p.operational_interpretation}`,
      '',
      `Counterweight: ${p.counterweight}`,
      '',
      `Evidence ${p.evidence_level} · aggression ${p.aggression}/10 · sources ${p.sources.join(', ')}`,
      '',
    ]),
  ].join('\n')
  const file = `${String(i + 1).padStart(2, '0')}-${slug(domain)}.md`
  writeFileSync(join(outDir, file), body)
  manifest.push({ file, title: `10X principles — ${domain}`, category: 'decision library' })
})

// 3. Sources.
const sources = [
  '# Sources behind the 10X decision library',
  '',
  ...Object.entries(lib.sources).map(([k, s]) => `- **${k}** — ${s.title}. ${s.publisher}, ${s.date}. ${s.url}${s.used ? ` — used for: ${s.used}` : ''}`),
  '',
].join('\n')
writeFileSync(join(outDir, '99-sources.md'), sources)
manifest.push({ file: '99-sources.md', title: 'Sources behind the 10X decision library', category: 'source list' })

writeFileSync(join(outDir, '_documents.json'), JSON.stringify(manifest, null, 2) + '\n')
const total = manifest.reduce((n, m) => n + readFileSync(join(outDir, m.file), 'utf8').length, 0)
console.log(`${manifest.length} documents, ${total.toLocaleString()} characters → ${outDir}`)
