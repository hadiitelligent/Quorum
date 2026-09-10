import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InsightSchema, isInsight, money, months, pct, totalOf, weightedPipeline } from '../../lib/quorum/insight'

test('money formats in the board style', () => {
  assert.equal(money(4_200_000), '$4.2M')
  assert.equal(money(360_000), '$360k')
  assert.equal(money(-360_000), '−$360k')
  assert.equal(money(1_250), '$1,250')
  assert.equal(money(12_500_000, 'CAD'), 'C$12.5M')
  assert.equal(money(2_000_000_000), '$2B')
  assert.equal(money(null), '—')
  assert.equal(months(14), '14 mo')
  assert.equal(months(null), '—')
  assert.equal(pct(8.04), '8%')
})

test('totals fall back to the sum of known items', () => {
  assert.equal(totalOf(100, [{ value: 1 }]), 100)
  assert.equal(totalOf(null, [{ value: 1 }, { value: null }, { value: 2 }]), 3)
  assert.equal(totalOf(null, [{ monthly: 5 }, { monthly: 7 }]), 12)
  assert.equal(totalOf(null, []), null)
})

test('weighted pipeline uses value × probability where both are known', () => {
  const r = weightedPipeline([
    { name: 'A', kind: 'sale', value: 480_000, stage: 'legal', expectedClose: null, probabilityPct: 50, blocker: null, owner: null },
    { name: 'B', kind: 'sale', value: 310_000, stage: 'legal', expectedClose: null, probabilityPct: null, blocker: null, owner: null },
    { name: 'C', kind: 'hire', value: null, stage: 'offer', expectedClose: null, probabilityPct: 80, blocker: null, owner: null },
  ])
  assert.deepEqual(r, { total: 790_000, weighted: 240_000, count: 3 })
})

test('the schema accepts an all-unknown snapshot and rejects a broken one', () => {
  const empty = {
    company: { name: 'X', oneLiner: '', overview: '', stage: '', currency: 'USD', asOf: null },
    revenue: { arr: null, annualRevenue: null, growthMonthlyPct: null, grossMarginPct: null, headcount: null },
    assets: { total: null, items: [] },
    liabilities: { total: null, items: [] },
    cash: { cash: null, monthlyNet: null, runwayMonths: null },
    overheads: { monthlyTotal: null, items: [] },
    targets: [],
    pipeline: [],
    valuation: { estimate: null, low: null, high: null, basis: '' },
    unknowns: ['everything'],
  }
  assert.ok(isInsight(empty))
  assert.ok(!isInsight({ company: { name: 'X' } }))
  assert.ok(!isInsight({}))
  assert.ok(InsightSchema.safeParse(empty).success)
})
