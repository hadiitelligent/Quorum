/**
 * Turns the "GC — Virtual Board Member" v2 build (a folder with the rule
 * library JSON, the constitution and the evidence base) into the grounding
 * documents for seed/advisors/06-grant-cardone.json: one document per rule
 * domain, one for how to read the library, the constitution and the evidence
 * base verbatim, and the source ledger. Re-run when the build changes.
 *
 *   npm run import:gc -- "/path/to/Grant Cardone Combined Persona"
 *
 * Output: seed/documents/06-grant-cardone/*.md + _documents.json (the
 * manifest `npm run seed -- --advisors` reads).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type Rule = {
  id: string
  domain: string
  title: string
  rule: string
  operational_interpretation: string
  counterweight: string
  basis: 'SAYS' | 'DOES' | 'BOTH' | 'GOV'
  evidence_level: 'A' | 'B' | 'C'
  fixed: boolean
  dial: { '5'?: string; '8'?: string; '10'?: string } | null
  sources: string[]
}
type Library = {
  name: string
  version: string
  built: string
  unofficial: boolean
  identity_statement: string
  config: Record<string, unknown>
  scorecard: { gates_before_scoring: string[]; dimensions: Record<string, { weight: number; question: string }>; thresholds: Record<string, number> }
  aggression_dial: Record<string, string>
  evidence_levels: Record<string, string>
  basis_tags: Record<string, string>
  improvement_procedure: string[]
  changelog: { version: string; date: string; notes: string }[]
  rule_count: number
  rules: Rule[]
  sources: Record<string, { title: string; publisher: string; date: string; url: string; type?: string; used?: string }>
}

const folder = process.argv[2]
if (!folder) {
  console.error('Usage: npm run import:gc -- "/path/to/the persona folder"')
  process.exit(1)
}
const find = (pattern: RegExp) => {
  const hit = readdirSync(folder).find((f) => pattern.test(f))
  if (!hit) {
    console.error(`No file matching ${pattern} in ${folder}`)
    process.exit(1)
  }
  return join(folder, hit)
}
const lib = JSON.parse(readFileSync(find(/Rule_Library.*\.json$/), 'utf8')) as Library
const constitution = readFileSync(find(/Board-Member-Persona.*\.md$/), 'utf8')
const evidence = readFileSync(find(/Evidence-Base.*\.md$/), 'utf8')

const outDir = join('seed', 'documents', '06-grant-cardone')
if (existsSync(outDir)) rmSync(outDir, { recursive: true })
mkdirSync(outDir, { recursive: true })

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const manifest: { file: string; title: string; category: string }[] = []
const put = (file: string, title: string, category: string, body: string) => {
  writeFileSync(join(outDir, file), body.endsWith('\n') ? body : body + '\n')
  manifest.push({ file, title, category })
}

// 1. How to read the library: identity, settings, scorecard, legend.
const cfg = lib.config as { aggression: number; dissent: boolean; objective_weights: Record<string, number>; domain_adapter: string; voice: string; profanity: boolean; honesty_layer: string }
put(
  '00-how-to-read.md',
  'How to read the GC rule library',
  'rule library',
  [
    `# ${lib.name} — how to read this library (v${lib.version}, built ${lib.built})`,
    '',
    lib.identity_statement,
    '',
    `${lib.rule_count} rules · ${new Set(lib.rules.map((r) => r.domain)).size} domains · ${lib.rules.filter((r) => r.fixed).length} fixed guardrails · ${Object.keys(lib.sources).length} sources.`,
    '',
    '## Current configuration',
    '',
    `- Aggression ${cfg.aggression}/10 — ${lib.aggression_dial[String(cfg.aggression)] ?? ''}`,
    `- Dissent: ${cfg.dissent ? 'on — vote first, reason second, never a buried No' : 'off'}`,
    `- Objective weights: ${Object.entries(cfg.objective_weights).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ')}`,
    `- Domain adapter: ${cfg.domain_adapter} (business-agnostic core; adapters in the constitution §7)`,
    `- Voice: ${cfg.voice}; profanity ${cfg.profanity ? 'on' : 'off'}; honesty layer ${cfg.honesty_layer}`,
    '',
    '## The aggression dial',
    '',
    lib.aggression_dial.description,
    '',
    ...Object.entries(lib.aggression_dial).filter(([k]) => k !== 'description').map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## Decision scorecard (every material item)',
    '',
    'Gates before scoring (cannot be outscored):',
    ...lib.scorecard.gates_before_scoring.map((g) => `- ${g}`),
    '',
    'Dimensions:',
    ...Object.entries(lib.scorecard.dimensions).map(([k, d]) => `- ${k.replace(/_/g, ' ')} (${d.weight}) — ${d.question}`),
    '',
    'Thresholds:',
    ...Object.entries(lib.scorecard.thresholds).map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${v}`),
    '',
    '## Legend',
    '',
    'Basis tags:',
    ...Object.entries(lib.basis_tags).map(([k, v]) => `- ${k} — ${v}`),
    '',
    'Evidence levels:',
    ...Object.entries(lib.evidence_levels).map(([k, v]) => `- ${k} — ${v}`),
    '',
    'Fixed — a guardrail; cannot be overridden by any aggression setting or scorecard result. Dial 5 / 8 / 10 — how the rule reads at that aggression setting; absent means the rule is constant.',
    '',
    '## How the persona improves',
    '',
    ...lib.improvement_procedure.map((s, i) => `${i + 1}. ${s}`),
    '',
    '## Changelog',
    '',
    ...lib.changelog.map((c) => `- v${c.version} (${c.date}): ${c.notes}`),
    '',
  ].join('\n'),
)

// 2. One document per domain, rules in library order.
const domains = [...new Set(lib.rules.map((r) => r.domain))]
domains.forEach((domain, i) => {
  const rows = lib.rules.filter((r) => r.domain === domain)
  const body = [
    `# ${domain} — ${rows.length} rules`,
    '',
    ...rows.flatMap((r) => [
      `## ${r.id} — ${r.title}${r.fixed ? ' [FIXED GUARDRAIL]' : ''}`,
      '',
      `Rule: ${r.rule}`,
      '',
      `In practice: ${r.operational_interpretation}`,
      '',
      `Counterweight: ${r.counterweight}`,
      '',
      ...(r.dial && (r.dial['5'] || r.dial['8'] || r.dial['10'])
        ? [`Dial — 5: ${r.dial['5'] ?? 'as written'} · 8: ${r.dial['8'] ?? 'as written'} · 10: ${r.dial['10'] ?? 'as written'}`, '']
        : []),
      `Basis ${r.basis} · evidence ${r.evidence_level} · sources ${r.sources.join(', ')}`,
      '',
    ]),
  ].join('\n')
  const file = `${String(i + 1).padStart(2, '0')}-${slug(domain.replace(/^[A-Z]\.\s*/, ''))}.md`
  put(file, `GC rules — ${domain}`, 'rule library', body)
})

// 3. The constitution and the evidence base, verbatim.
put('90-constitution.md', 'GC constitution — posture, mental model, playbooks, voice, guardrails, scenarios', 'constitution', constitution)
put('91-evidence-base.md', 'GC evidence base — timeline, contradictions, behavioural patterns 2016–2026', 'evidence base', evidence)

// 4. Sources.
put(
  '99-sources.md',
  'Sources behind the GC rule library',
  'source list',
  [
    '# Sources behind the GC rule library',
    '',
    'S-series: teaching and primary sources. E-series: evidence of documented behaviour (filings, court records, reporting).',
    '',
    ...Object.entries(lib.sources).map(([k, s]) => `- **${k}**${s.type ? ` (${s.type})` : ''} — ${s.title}. ${s.publisher}, ${s.date}. ${s.url}${s.used ? ` — used for: ${s.used}` : ''}`),
    '',
  ].join('\n'),
)

writeFileSync(join(outDir, '_documents.json'), JSON.stringify(manifest, null, 2) + '\n')
const total = manifest.reduce((n, m) => n + readFileSync(join(outDir, m.file), 'utf8').length, 0)
console.log(`${manifest.length} documents, ${total.toLocaleString()} characters → ${outDir}`)
