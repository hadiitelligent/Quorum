import { test } from 'node:test'
import assert from 'node:assert/strict'
import { convenedLabel, countWord, editedLabel, firstName, initials, normalizeStrengths, primarySegment, sourcesLine } from '../../lib/quorum/text'

test('initials skip honorifics and take two letters', () => {
  assert.equal(initials('Marcus Chen'), 'MC')
  assert.equal(initials('Dr. Amara Osei'), 'AO')
  assert.equal(initials('Priya'), 'P')
  assert.equal(initials('  '), '?')
  assert.equal(initials('Jean-Luc Picard'), 'JP')
})

test('firstName is the first non-honorific word', () => {
  assert.equal(firstName('Dr. Amara Osei'), 'Amara')
  assert.equal(firstName('Marcus Chen'), 'Marcus')
  assert.equal(firstName('Priya'), 'Priya')
})

test('countWord spells out up to ten', () => {
  assert.equal(countWord(0), 'Zero')
  assert.equal(countWord(5), 'Five')
  assert.equal(countWord(10), 'Ten')
  assert.equal(countWord(11), '11')
})

test('primarySegment is the first segment of a domain', () => {
  assert.equal(primarySegment('Security & Infrastructure'), 'Security')
  assert.equal(primarySegment('Sales, Pricing'), 'Sales')
  assert.equal(primarySegment('Go-to-Market'), 'Go-to-Market')
})

test('sourcesLine reads like the library card', () => {
  assert.equal(sourcesLine(0, []), '0 docs · not yet grounded')
  assert.equal(sourcesLine(1, ['board memo']), '1 doc · board memo')
  assert.equal(sourcesLine(84, ['board memos', 'S-1s', 'board memos', '']), '84 docs · board memos, S-1s')
  assert.equal(sourcesLine(3, ['', ' ']), '3 docs')
})

test('editedLabel and convenedLabel', () => {
  const now = new Date('2026-09-09T20:00:00')
  assert.equal(editedLabel('2026-09-02T10:00:00', now), 'Sep 2')
  assert.equal(editedLabel('2025-12-24T10:00:00', now), 'Dec 24, 2025')
  assert.equal(editedLabel(now.toISOString(), now), 'Just now')
  assert.equal(editedLabel('nonsense', now), '')
  assert.equal(convenedLabel('2026-09-09T08:00:00', now), 'Today')
  assert.equal(convenedLabel('2026-09-08T08:00:00', now), 'Yesterday')
  assert.equal(convenedLabel('2026-08-28T08:00:00', now), 'Aug 28')
})

test('normalizeStrengths clamps, trims and caps at three', () => {
  assert.deepEqual(
    normalizeStrengths([
      { s: ' Fundraising ', lv: 9 },
      { s: '', lv: 3 },
      { s: 'M&A', lv: 0 },
      { s: 'Pricing', lv: 3.4 },
      { s: 'Extra', lv: 2 },
    ]),
    [
      { s: 'Fundraising', lv: 5 },
      { s: 'M&A', lv: 1 },
      { s: 'Pricing', lv: 3 },
    ],
  )
})
