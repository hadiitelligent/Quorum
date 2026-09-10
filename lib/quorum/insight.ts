import { z } from 'zod'

/**
 * The insight: a structured snapshot of the business, extracted from the
 * standing brief by the model (lib/board/insight.ts) and rendered by the
 * Business page. Every figure is optional — the brief may not say — and the
 * extraction is told never to invent one.
 *
 * Numbers are in the brief's own currency, as plain units (dollars, not
 * cents). Percentages are 0–100.
 */

const amount = z.number().nullable()
const text = z.string()

export const InsightSchema = z.object({
  company: z.object({
    name: text,
    oneLiner: text,
    /** Two to four sentences: what it is, how it makes money, where it stands. */
    overview: text,
    stage: text,
    /** ISO 4217, e.g. USD, CAD. */
    currency: text,
    /** The date the brief speaks from, ISO yyyy-mm-dd, or null. */
    asOf: z.string().nullable(),
  }),
  revenue: z.object({
    arr: amount,
    annualRevenue: amount,
    growthMonthlyPct: z.number().nullable(),
    grossMarginPct: z.number().nullable(),
    headcount: z.number().nullable(),
  }),
  assets: z.object({
    total: amount,
    items: z.array(z.object({ name: text, value: amount, basis: text })),
  }),
  liabilities: z.object({
    total: amount,
    items: z.array(z.object({ name: text, value: amount, terms: text })),
  }),
  cash: z.object({
    cash: amount,
    /** Net monthly cash movement: negative is burn, positive is free cash flow. */
    monthlyNet: amount,
    runwayMonths: z.number().nullable(),
  }),
  overheads: z.object({
    monthlyTotal: amount,
    items: z.array(z.object({ name: text, monthly: amount })),
  }),
  targets: z.array(
    z.object({
      metric: text,
      /** As written: "$6M ARR", "40 customers". */
      target: text,
      current: z.string().nullable(),
      by: text,
      /** 0–100 where the brief lets you judge it; else null. */
      progressPct: z.number().nullable(),
    }),
  ),
  pipeline: z.array(
    z.object({
      name: text,
      kind: text,
      value: amount,
      stage: text,
      expectedClose: z.string().nullable(),
      probabilityPct: z.number().nullable(),
      blocker: z.string().nullable(),
      owner: z.string().nullable(),
    }),
  ),
  valuation: z.object({
    estimate: amount,
    low: amount,
    high: amount,
    basis: text,
  }),
  /** What a board would want that the brief does not say. */
  unknowns: z.array(text),
})

export type Insight = z.infer<typeof InsightSchema>

export function isInsight(value: unknown): value is Insight {
  return InsightSchema.safeParse(value).success
}

/** "$4.2M", "$360k", "$1,250", "—" for null. */
export function money(value: number | null | undefined, currency = 'USD'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const sign = value < 0 ? '−' : ''
  const abs = Math.abs(value)
  const symbol = currencySymbol(currency)
  if (abs >= 1e9) return `${sign}${symbol}${trim(abs / 1e9)}B`
  if (abs >= 1e6) return `${sign}${symbol}${trim(abs / 1e6)}M`
  if (abs >= 1e4) return `${sign}${symbol}${trim(abs / 1e3)}k`
  return `${sign}${symbol}${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function trim(n: number): string {
  const s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)
  return s.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')
}

export function currencySymbol(currency: string): string {
  const c = currency.toUpperCase()
  if (c === 'USD') return '$'
  if (c === 'CAD') return 'C$'
  if (c === 'EUR') return '€'
  if (c === 'GBP') return '£'
  if (c === 'AUD') return 'A$'
  return `${c} `
}

/** "12 mo", "—". */
export function months(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${Math.round(value * 10) / 10} mo`
}

export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${Math.round(value * 10) / 10}%`
}

/** Sum of item values, or the stated total, or null when nothing is known. */
export function totalOf(stated: number | null, items: { value?: number | null; monthly?: number | null }[]): number | null {
  if (stated !== null && stated !== undefined) return stated
  const known = items.map((i) => i.value ?? i.monthly ?? null).filter((v): v is number => v !== null)
  return known.length ? known.reduce((a, b) => a + b, 0) : null
}

/** Weighted pipeline value: Σ value × probability, over deals that have both. */
export function weightedPipeline(deals: Insight['pipeline']): { total: number | null; weighted: number | null; count: number } {
  const withValue = deals.filter((d) => d.value !== null)
  const total = withValue.length ? withValue.reduce((a, d) => a + (d.value ?? 0), 0) : null
  const withBoth = deals.filter((d) => d.value !== null && d.probabilityPct !== null)
  const weighted = withBoth.length ? withBoth.reduce((a, d) => a + (d.value ?? 0) * ((d.probabilityPct ?? 0) / 100), 0) : null
  return { total, weighted, count: deals.length }
}
