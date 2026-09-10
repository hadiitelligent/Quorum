import 'server-only'

import { InsightSchema, type Insight } from '@/lib/quorum/insight'
import { advisorModel } from '@/lib/env'
import { callJson } from './model'

/**
 * From the standing brief to the insight: one structured-output call. The
 * model reads the brief the client pasted and fills the snapshot; anything
 * the brief does not say stays null and is listed under `unknowns`.
 */

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
].join('\n')

export async function extractInsight(brief: string): Promise<{ insight: Insight; model: string }> {
  const out = await callJson(
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
