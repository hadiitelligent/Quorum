import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GROUNDING_CHAR_CAP, answersBlock, briefBlock, challengePrompt, groundingBlock, personaPrompt, synthesisPrompt, viewPrompt, votePrompt } from '../../lib/board/prompts'
import type { Advisor } from '../../lib/quorum/types'

const marcus: Advisor = {
  id: 'a', name: 'Marcus Chen', firstName: 'Marcus', initials: 'MC', role: 'Finance & Capital',
  bio: 'Ex-CFO through two IPOs.', temperament: 'Direct, numbers-first',
  strengths: [{ s: 'Fundraising', lv: 5 }, { s: 'M&A', lv: 3 }], instructions: 'Always ask for the dilution math.',
  active: true, sources: '0 docs · not yet grounded', docCount: 0, edited: 'Sep 2', updatedAt: '2026-09-02T00:00:00Z',
}
const board = { client: 'Dana Reyes, Founder · Meridian', roster: [{ name: 'Marcus Chen', role: 'Finance & Capital' }, { name: 'Elena Vasquez', role: 'Go-to-Market' }] }

test('the persona prompt carries every column and names the others', () => {
  const p = personaPrompt(marcus, board)
  assert.match(p, /You are Marcus Chen, Finance & Capital advisor/)
  assert.match(p, /Dana Reyes, Founder · Meridian/)
  assert.match(p, /Ex-CFO through two IPOs/)
  assert.match(p, /Temperament: Direct, numbers-first/)
  assert.match(p, /Fundraising \(5\/5\), M&A \(3\/5\)/)
  assert.match(p, /Always ask for the dilution math/)
  assert.match(p, /Elena Vasquez \(Go-to-Market\)/)
  assert.doesNotMatch(p, /Marcus Chen \(Finance & Capital\)/)
})

test('an ungrounded persona says so and a lone advisor knows it', () => {
  const p = personaPrompt({ ...marcus, bio: '', strengths: [] }, { client: 'X', roster: [{ name: 'Marcus Chen', role: 'F' }] })
  assert.match(p, /not been written yet/)
  assert.match(p, /not yet rated/)
  assert.match(p, /only advisor on the board/)
})

test('the grounding block is empty when ungrounded and trimmed at the cap', () => {
  assert.equal(groundingBlock([]), '')
  const g = groundingBlock([{ title: 'Board memo', category: 'memo', content: 'Runway 14 months.' }])
  assert.match(g, /### Board memo \(memo\)\nRunway 14 months\./)
  const big = groundingBlock(
    [
      { title: 'A', category: '', content: 'x'.repeat(GROUNDING_CHAR_CAP) },
      { title: 'B', category: '', content: 'y' },
    ],
    1000,
  )
  assert.ok(big.length < 1400)
  assert.match(big, /trimmed/)
  assert.match(big, /1 more document\(s\) not shown/)
})

test('the stage prompts quote the question and address the right people', () => {
  assert.match(viewPrompt('Raise now?'), /"Raise now\?"/)
  const views = [
    { advisorId: 'a', name: 'Marcus Chen', initials: 'MC', role: 'F', view: 'Now.' },
    { advisorId: 'b', name: 'Elena Vasquez', initials: 'EV', role: 'G', view: 'Wait.' },
  ]
  const c = challengePrompt('Raise now?', views[0], views)
  assert.match(c, /Marcus Chen \(F\) — you/)
  assert.match(c, /Choose "to" from: b = Elena Vasquez\./)
  const s = synthesisPrompt('Raise now?', views, [{ fromId: 'b', toId: 'a', from: 'Elena Vasquez', fi: 'EV', to: 'Marcus Chen', text: 'Fear.' }])
  assert.match(s, /Elena Vasquez → Marcus Chen: Fear\./)
  const v = votePrompt('Raise now?', 'Do it.', [{ fromId: 'b', toId: 'a', from: 'Elena Vasquez', fi: 'EV', to: 'Marcus Chen', text: 'Fear.' }], { name: 'Marcus Chen' })
  assert.match(v, /Challenges that were aimed at you/)
  assert.match(v, /preserved verbatim/)
  const v2 = votePrompt('Raise now?', 'Do it.', [], { name: 'Elena Vasquez' })
  assert.doesNotMatch(v2, /aimed at you/)
})

test('the brief travels with every stage, and its absence is said out loud', () => {
  assert.match(briefBlock(''), /no written brief/)
  assert.match(briefBlock('  Runway 14 months. '), /treat it as fact[\s\S]*Runway 14 months\./)
  const views = [{ advisorId: 'a', name: 'Marcus Chen', initials: 'MC', role: 'F', view: 'Now.' }, { advisorId: 'b', name: 'Elena Vasquez', initials: 'EV', role: 'G', view: 'Wait.' }]
  for (const p of [
    viewPrompt('Q?', 'BRIEF-TEXT'),
    challengePrompt('Q?', views[0], views, 'BRIEF-TEXT'),
    synthesisPrompt('Q?', views, [], 'BRIEF-TEXT'),
    votePrompt('Q?', 'Do it.', [], { name: 'Marcus Chen' }, 'BRIEF-TEXT'),
  ]) {
    assert.match(p, /BRIEF-TEXT/)
    assert.ok(p.indexOf('BRIEF-TEXT') < p.indexOf('Q?'), 'the brief comes before the question')
  }
  assert.match(viewPrompt('Q?'), /no written brief/)
})

test('the answers travel to the later stages; an unanswered question says so', () => {
  assert.equal(answersBlock([]), '')
  const qs = [
    { advisorId: 'b', name: 'Elena Vasquez', initials: 'EV', question: 'Lost deals?', answer: 'Price, twice.' },
    { advisorId: 'c', name: 'James Whitfield', initials: 'JW', question: 'Indemnity cap?', answer: '' },
  ]
  const block = answersBlock(qs)
  assert.match(block, /Elena Vasquez asked: Lost deals\?\nClient: Price, twice\./)
  assert.match(block, /James Whitfield asked: Indemnity cap\?\nClient: \(not answered/)
  const views = [{ advisorId: 'a', name: 'Marcus Chen', initials: 'MC', role: 'F', view: 'Now.' }, { advisorId: 'b', name: 'Elena Vasquez', initials: 'EV', role: 'G', view: 'Wait.' }]
  assert.match(challengePrompt('Q?', views[0], views, '', qs), /Client: Price, twice\./)
  assert.match(synthesisPrompt('Q?', views, [], '', qs), /Client: Price, twice\./)
  assert.match(votePrompt('Q?', 'Do it.', [], { name: 'Marcus Chen' }, '', qs), /Client: Price, twice\./)
  assert.match(viewPrompt('Q?'), /"question" is null/)
})
