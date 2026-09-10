import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dissentOf, nextSteps, outcomeOf, stageOf, statusFor } from '../../lib/quorum/session'
import type { Session } from '../../lib/quorum/types'

const A = { id: 'a' }, B = { id: 'b' }, C = { id: 'c' }
const roster = [A, B, C]

function session(over: Partial<Session> = {}): Session {
  return {
    id: 's1',
    question: 'Series B now?',
    brief: '',
    advisorIds: [],
    status: 'views',
    stage: 1,
    recommendation: '',
    error: '',
    convenedBy: 'Dana',
    personId: 'p1',
    createdAt: '2026-09-09T10:00:00Z',
    completedAt: null,
    views: [],
    challenges: [],
    votes: [],
    ...over,
  }
}
const view = (id: string) => ({ advisorId: id, name: id.toUpperCase(), initials: id.toUpperCase(), role: 'r', view: 'v' })
const challenge = (from: string, to: string) => ({ fromId: from, toId: to, from: from.toUpperCase(), fi: from.toUpperCase(), to: to.toUpperCase(), text: 't' })
const vote = (id: string, v: 'agree' | 'conditional' | 'disagree') => ({ advisorId: id, name: id.toUpperCase(), initials: id.toUpperCase(), vote: v, statement: `${id} says` })

test('nextSteps runs every missing view first, in parallel', () => {
  assert.deepEqual(nextSteps(session(), roster), [
    { kind: 'view', advisorId: 'a' },
    { kind: 'view', advisorId: 'b' },
    { kind: 'view', advisorId: 'c' },
  ])
  assert.deepEqual(nextSteps(session({ views: [view('a'), view('c')] }), roster), [{ kind: 'view', advisorId: 'b' }])
})

test('nextSteps then challenges, then synthesis, then votes, then complete', () => {
  const views = [view('a'), view('b'), view('c')]
  assert.deepEqual(nextSteps(session({ views }), roster).map((s) => s.kind), ['challenge', 'challenge', 'challenge'])
  const challenges = [challenge('a', 'b'), challenge('b', 'a'), challenge('c', 'a')]
  assert.deepEqual(nextSteps(session({ views, challenges }), roster), [{ kind: 'synthesis' }])
  const rec = 'Do it in eight weeks.'
  assert.deepEqual(nextSteps(session({ views, challenges, recommendation: rec, status: 'votes' }), roster).map((s) => s.kind), ['vote', 'vote', 'vote'])
  const votes = [vote('a', 'agree'), vote('b', 'conditional'), vote('c', 'agree')]
  assert.deepEqual(nextSteps(session({ views, challenges, recommendation: rec, votes, status: 'votes' }), roster), [{ kind: 'complete' }])
  assert.deepEqual(nextSteps(session({ status: 'done' }), roster), [{ kind: 'nothing' }])
  assert.deepEqual(nextSteps(session({ status: 'failed' }), roster), [{ kind: 'nothing' }])
})

test('a board of one skips the challenge round', () => {
  const s = session({ views: [view('a')] })
  assert.deepEqual(nextSteps(s, [A]), [{ kind: 'synthesis' }])
  assert.equal(statusFor({ rosterSize: 1, views: 1, challenges: 0, recommendation: false, votes: 0 }), 'synthesis')
})

test('statusFor follows the rows', () => {
  assert.equal(statusFor({ rosterSize: 3, views: 1, challenges: 0, recommendation: false, votes: 0 }), 'views')
  assert.equal(statusFor({ rosterSize: 3, views: 3, challenges: 0, recommendation: false, votes: 0 }), 'challenges')
  assert.equal(statusFor({ rosterSize: 3, views: 3, challenges: 3, recommendation: false, votes: 0 }), 'synthesis')
  assert.equal(statusFor({ rosterSize: 3, views: 3, challenges: 3, recommendation: true, votes: 1 }), 'votes')
  assert.equal(statusFor({ rosterSize: 3, views: 3, challenges: 3, recommendation: true, votes: 3 }), 'done')
})

test('stageOf lights the tracker', () => {
  assert.equal(stageOf('views', { views: 0, challenges: 0, recommendation: false }), 1)
  assert.equal(stageOf('challenges', { views: 3, challenges: 0, recommendation: false }), 2)
  assert.equal(stageOf('synthesis', { views: 3, challenges: 3, recommendation: false }), 3)
  assert.equal(stageOf('done', { views: 3, challenges: 3, recommendation: true }), 3)
  assert.equal(stageOf('failed', { views: 0, challenges: 0, recommendation: false }), 0)
  assert.equal(stageOf('failed', { views: 2, challenges: 0, recommendation: false }), 1)
})

test('dissent is every vote that is not agree, verbatim', () => {
  const votes = [vote('a', 'agree'), vote('b', 'conditional'), vote('c', 'disagree')]
  assert.deepEqual(dissentOf(votes).map((v) => v.statement), ['b says', 'c says'])
})

test('outcomeOf names the Sessions table tag', () => {
  const now = new Date('2026-09-09T12:00:00Z')
  const votes = [vote('a', 'agree'), vote('b', 'agree')]
  assert.deepEqual(outcomeOf({ status: 'done', votes, createdAt: '2026-09-09T10:00:00Z' }, now), { outcome: 'Unanimous', tone: 'accent' })
  assert.deepEqual(outcomeOf({ status: 'done', votes, createdAt: '2026-08-01T10:00:00Z' }, now), { outcome: 'Unanimous', tone: 'neutral' })
  assert.deepEqual(outcomeOf({ status: 'done', votes: [vote('a', 'agree'), vote('b', 'conditional')], createdAt: '2026-08-01T10:00:00Z' }, now), { outcome: 'Synthesis · 1 dissent', tone: 'neutral' })
  assert.deepEqual(outcomeOf({ status: 'done', votes: [vote('a', 'disagree'), vote('b', 'conditional')], createdAt: '2026-09-09T11:00:00Z' }, now), { outcome: 'Synthesis · 2 dissents', tone: 'accent' })
  assert.deepEqual(outcomeOf({ status: 'challenges', votes: [], createdAt: '2026-09-09T11:00:00Z' }, now), { outcome: 'In session', tone: 'accent' })
  assert.deepEqual(outcomeOf({ status: 'failed', votes: [], createdAt: '2026-09-09T11:00:00Z' }, now), { outcome: 'Stopped before synthesis', tone: 'neutral' })
})

test('mergeSession unions the rows and keeps the furthest status', async () => {
  const { mergeSession } = await import('../../lib/quorum/session')
  const a = session({ status: 'views', views: [view('a')] })
  const b = session({ status: 'challenges', views: [view('b'), view('c')] })
  const m = mergeSession(a, b)
  assert.equal(m.status, 'challenges')
  assert.deepEqual(m.views.map((v) => v.advisorId), ['a', 'b', 'c'])
  assert.equal(m.stage, 2)
  const f = mergeSession(session({ status: 'failed', error: 'Stopped at the vote: boom' }), session({ status: 'votes', recommendation: 'Do it.' }))
  assert.equal(f.status, 'failed')
  assert.equal(f.recommendation, 'Do it.')
  assert.equal(f.error, 'Stopped at the vote: boom')
})

test('briefPrompt asks for a structured, dated, honest brief', async () => {
  const { briefPrompt, BRIEF_CHAR_CAP } = await import('../../lib/quorum/session')
  const p = briefPrompt('Dana Reyes')
  assert.match(p, /Dana Reyes/)
  assert.match(p, /Cash and runway/)
  assert.match(p, /mark estimates as estimates/)
  assert.doesNotMatch(briefPrompt(), /\(\)/)
  assert.ok(BRIEF_CHAR_CAP >= 10_000)
})

test('rosterFor is the invited who are still active, or everyone when nobody was named', async () => {
  const { rosterFor } = await import('../../lib/quorum/session')
  assert.deepEqual(rosterFor({ advisorIds: [] }, roster), roster)
  assert.deepEqual(rosterFor({ advisorIds: ['c', 'a', 'gone'] }, roster), [A, C])
  assert.deepEqual(rosterFor({ advisorIds: ['gone'] }, roster), [])
})
