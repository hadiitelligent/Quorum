import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoFilename, sessionMemo } from '../../lib/quorum/memo'
import type { Session } from '../../lib/quorum/types'

const done: Session = {
  id: 's',
  question: 'Should we raise our Series B now?',
  status: 'done',
  stage: 3,
  recommendation: 'Begin the raise in ~8 weeks.',
  error: '',
  convenedBy: 'Dana Reyes',
  personId: 'p1',
  createdAt: '2026-09-09T10:00:00Z',
  completedAt: '2026-09-09T10:05:00Z',
  views: [{ advisorId: 'a', name: 'Marcus Chen', initials: 'MC', role: 'Finance & Capital', view: 'Raise now.' }],
  challenges: [{ fromId: 'b', toId: 'a', from: 'Elena Vasquez', fi: 'EV', to: 'Marcus Chen', text: 'You are pricing fear.' }],
  votes: [
    { advisorId: 'a', name: 'Marcus Chen', initials: 'MC', vote: 'agree', statement: 'Agreed.' },
    { advisorId: 'b', name: 'Elena Vasquez', initials: 'EV', vote: 'conditional', statement: 'Both Q2 logos should close first.\nOne invites concentration questions.' },
  ],
}

test('the memo carries the synthesis, the alignment and the dissent verbatim', () => {
  const memo = sessionMemo(done, { boardName: 'Quorum', now: new Date('2026-09-10T00:00:00Z') })
  assert.match(memo, /^# Board memo — Should we raise our Series B now\?/)
  assert.match(memo, /## Board synthesis\n\nBegin the raise in ~8 weeks\./)
  assert.match(memo, /- \*\*Marcus Chen\*\* — Agree/)
  assert.match(memo, /- \*\*Elena Vasquez\*\* — Conditional/)
  assert.match(memo, /### Recorded dissent/)
  assert.match(memo, /> Both Q2 logos should close first\.\n> One invites concentration questions\./)
  assert.match(memo, /### Marcus Chen — Finance & Capital\n\nRaise now\./)
  assert.match(memo, /\*\*Elena Vasquez → Marcus Chen:\*\* You are pricing fear\./)
  assert.ok(memo.endsWith('\n'))
})

test('a memo before synthesis says so', () => {
  const memo = sessionMemo({ ...done, status: 'views', recommendation: '', votes: [] })
  assert.match(memo, /has not reached a synthesis \(status: views\)/)
  assert.doesNotMatch(memo, /Recorded dissent/)
})

test('memoFilename slugs the question and dates it', () => {
  assert.equal(memoFilename('Should we raise our Series B now?', '2026-09-09T10:00:00Z'), 'quorum-memo-2026-09-09-should-we-raise-our-series-b-now.md')
  assert.equal(memoFilename('???', '2026-09-09T10:00:00Z'), 'quorum-memo-2026-09-09-session.md')
})
