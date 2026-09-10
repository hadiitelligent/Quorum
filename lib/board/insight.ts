import 'server-only'

import { InsightSchema, type Insight } from '@/lib/quorum/insight'
import { advisorModel } from '@/lib/env'
import { callJsonLoose } from './model'

/**
 * From the standing brief to the insight: one structured-output call. The
 * model reads the brief the client pasted and fills the snapshot; anything
 * the brief does not say stays null and is listed under `unknowns`.
 */

/** The shape, spelled out for the model: an example with every key. */
const EXAMPLE: Insight = {
  company: { name: 'Acme', oneLiner: 'what it is, in one line', overview: 'two to four sentences', stage: 'e.g. Seed', currency: 'USD', asOf: '2026-09-10' },
  revenue: { arr: 4200000, annualRevenue: null, growthMonthlyPct: 8, grossMarginPct: 74, headcount: 31 },
  assets: { total: null, items: [{ name: 'Cash', value: 5100000, basis: 'bank, Sep 2026' }] },
  liabilities: { total: null, items: [{ name: 'Deferred revenue', value: 1400000, terms: 'annual prepayments' }] },
  cash: { cash: 5100000, monthlyNet: -360000, runwayMonths: 14 },
  overheads: { monthlyTotal: 520000, items: [{ name: 'Payroll', monthly: 410000 }] },
  targets: [{ metric: 'ARR', target: '$6.5M', current: '$4.2M', by: 'Dec 2026', progressPct: 65 }],
  pipeline: [{ name: 'Northwind', kind: 'sale', value: 480000, stage: 'Legal', expectedClose: 'Q2 2027', probabilityPct: 60, blocker: 'indemnity clause', owner: 'VP Sales' }],
  valuation: { estimate: 32000000, low: null, high: null, basis: 'seed post-money, Jan 2025' },
  unknowns: ['CAC payback'],
}

const SYSTEM = [
  'You extract a structured snapshot of a business from a written brief, for a board dashboard.',
  '',
  'Rules:',
  '- Only what the brief says. A figure the brief does not give is null; never estimate, never fill a gap from general knowledge. List what a board would want but the brief omits under "unknowns" (short phrases).',
  '- Money as plain numbers in the brief\'s own currency (dollars, not cents; "$4.2M" → 4200000). Set company.currency to the ISO code the brief uses (default USD when it only writes "$").',
  '- Percentages as 0–100. Monthly figures as monthly; annualise nothing, monthlyise nothing — if the brief gives an annual overhead, put it in the item name ("Rent (annual)") and leave monthly null.',
  '- cash.monthlyNet is negative for burn, positive for free cash flow. cash.runwayMonths only if the brief states it or gives both cash and burn (then cash ÷ burn, rounded to one decimal).',
  '- valuation: only if the brief states a valuation, a last-round price, or an explicit basis; otherwise all null and basis "not stated". Never value the company yourself.',
  '- targets: every explicit target with its horizon ("by" as written); progressPct only where the brief gives current and target in comparable terms.',
  '- pipeline: every deal named — sales, partnerships, financing, acquisitions, hires — with what the brief gives; kind is one word.',
  '- company.overview: two to four plain sentences in your own words: what it is, how it makes money, where it stands. No marketing language.',
  '- company.asOf: the date the brief speaks from if it says one (ISO yyyy-mm-dd), else null.',
  '',
  'Answer with ONE JSON object and nothing else — no prose, no code fence — exactly this shape (every key present; null where unknown; arrays may be empty):',
  JSON.stringify(EXAMPLE, null, 1),
].join('\n')


export async function extractInsight(brief: string): Promise<{ insight: Insight; model: string }> {
  const out = await callJsonLoose(
    {
      model: advisorModel(),
      system: [{ text: SYSTEM, cache: true }],
      messages: [{ role: 'user', content: `THE BRIEF:\n\n${brief.trim()}\n\nExtract the snapshot.` }],
      effort: 'medium',
      maxTokens: 8_000,
    },
    InsightSchema,
  )
  return { insight: out.data, model: out.model }
}
