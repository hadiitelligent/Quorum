import type { Advisor, AdvisorDocument, ChatMessage, Session, SessionSummary } from '@/lib/quorum/types'
import type { Insight } from '@/lib/quorum/insight'
import { editedLabel, firstName, initials, primarySegment, sourcesLine } from '@/lib/quorum/text'
import { mergeSession, rosterFor, statusFor } from '@/lib/quorum/session'
import type { NextStep } from '@/lib/quorum/session'
import m1 from '@/seed/advisors/01-marcus-chen.json'
import m2 from '@/seed/advisors/02-amara-osei.json'
import m3 from '@/seed/advisors/03-elena-vasquez.json'
import m4 from '@/seed/advisors/04-richard-sato.json'
import m5 from '@/seed/advisors/05-james-whitfield.json'

/**
 * The prototype's scripted data (reference/Quorum.dc.html), served by the
 * dev-only demo at /demo. No database, no model: the stages answer after the
 * prototype's delays, scaled by `speed`.
 */

export const DEMO_PERSON = { id: 'demo-person', name: 'Dana Reyes', title: 'Founder · Meridian', initials: 'DR', isAdmin: true }

type Scripted = { sources: string; edited: string; view: string; replies: string[] }

const SCRIPT: Record<string, Scripted> = {
  'Marcus Chen': {
    sources: '84 docs · board memos, S-1s',
    edited: '2026-09-02T10:00:00Z',
    view: 'Your forward multiple is stronger than you think — 2.1x net revenue retention carries the story. I would raise now: dilution at today’s terms beats the risk of a compressed market in twelve months.',
    replies: [
      'Run the dilution math both ways before you anchor on a number. At your current burn, waiting costs you roughly 4% of the company in bridge terms — that’s the real comparison, not the headline valuation.',
      'I’d want your CFO modeling three scenarios, not one. The middle case is where boards get lazy — make the downside case the one you actually stress.',
    ],
  },
  'Dr. Amara Osei': {
    sources: '52 docs · eng surveys, org charts',
    edited: '2026-08-30T10:00:00Z',
    view: 'The team is showing early burnout markers in the last two pulse surveys. A raise now funds the two ops hires you’ve deferred twice — waiting a year on this budget means quiet attrition among your senior ICs.',
    replies: [
      'Before we talk structure, tell me what your best people are complaining about privately. That’s usually the real org chart.',
      'Titles are cheap and expensive at the same time. Give one out to solve a retention problem and you’ve created three more.',
    ],
  },
  'Elena Vasquez': {
    sources: '61 docs · pipeline, win/loss calls',
    edited: '2026-09-05T10:00:00Z',
    view: 'The pipeline says wait. Two enterprise logos are in legal now and close in Q2 — land those and the ARR story adds roughly 30% to what this round can price. Raising before they sign leaves money on the table.',
    replies: [
      'What did the last three lost deals say in the debrief? If you can’t answer that in one sentence, that’s the first fix — before pricing, before headcount.',
      'Founder-led sales isn’t a phase you exit, it’s a motion you encode. Write down what you do in the room before you hire someone to do it.',
    ],
  },
  'Richard Sato': {
    sources: '47 docs · PRDs, roadmaps',
    edited: '2026-08-21T10:00:00Z',
    view: 'The platform bet ships in March. Raising after it proves out changes the narrative from “tooling” to “platform” — a different multiple entirely. Wait, but pre-wire the investors now so March is a close, not a start.',
    replies: [
      'A roadmap is a story with dates. If an investor can’t retell yours after one meeting, the problem isn’t the product — it’s the sequence.',
      'Kill one thing this quarter. Every roadmap I’ve seen fail died of addition, not subtraction.',
    ],
  },
  'James Whitfield': {
    sources: '39 docs · contracts, policies',
    edited: '2026-08-18T10:00:00Z',
    view: 'Clean either way from a governance standpoint. One flag: the data-residency work must land before any diligence begins — it’s a six-week project now and a deal-risk finding later. Start it this quarter regardless of timing.',
    replies: [
      'Send me the customer contract template before you sign the next enterprise deal — the indemnity clause I saw in June will get flagged in diligence.',
      'Good governance is boring on purpose. If a board decision feels exciting, slow it down.',
    ],
  },
}

const CHALLENGES = [
  { from: 'Elena Vasquez', to: 'Marcus Chen', text: 'Marcus, your window argument assumes multiples compress. If the Q2 logos land, we out-earn the compression — you’re pricing fear, I’m pricing pipeline.' },
  { from: 'Marcus Chen', to: 'Elena Vasquez', text: 'Two logos is concentration risk in a diligence room, not a story. Miss one and you’re raising from weakness in a worse market. The pipeline argument only works if it’s already signed.' },
  { from: 'Dr. Amara Osei', to: 'Richard Sato', text: 'Richard, “wait and pre-wire” still costs the team six more months at current load. Who ships your March platform bet if the senior ICs are gone by February?' },
  { from: 'Richard Sato', to: 'Dr. Amara Osei', text: 'Amara, the hires you want are funded either way; the question is what story they join. A raise before March buys headcount at a tooling multiple.' },
  { from: 'James Whitfield', to: 'Marcus Chen', text: 'Marcus, “raise now” means diligence starts before the data-residency work is done. That is a finding, and findings reprice rounds.' },
]

const QUESTIONS: Record<string, string> = {
  'Elena Vasquez': 'What did the last three lost deals say in the debrief — price, product, or timing?',
  'James Whitfield': 'Is the indemnity in the two enterprise contracts capped, and at what?',
}

const SYNTHESIS =
  'Begin the raise in ~8 weeks: pre-wire investors now, land at least one Q2 enterprise logo, and start the data-residency work immediately. Target close before the March platform launch so the round prices the current story — with the platform as upside, not a promise.'

const VOTES: Record<string, { vote: 'agree' | 'conditional' | 'disagree'; statement: string }> = {
  'Marcus Chen': { vote: 'agree', statement: 'Eight weeks is the right window; the pre-wire protects the price.' },
  'Dr. Amara Osei': { vote: 'agree', statement: 'It funds the hires before February. I can stand behind that.' },
  'Elena Vasquez': { vote: 'conditional', statement: 'Both Q2 enterprise logos should close before first partner meetings — raising on one invites concentration questions in diligence and weakens price. Preserved verbatim at my request.' },
  'Richard Sato': { vote: 'agree', statement: 'Platform as upside, not a promise, is the sequence I wanted.' },
  'James Whitfield': { vote: 'agree', statement: 'With the residency work started this week, clean.' },
}

type Seed = { name: string; role: string; bio: string; temperament: string; strengths: { s: string; lv: number }[]; instructions: string }

function advisorFrom(seed: Seed, id: string): Advisor {
  const s = SCRIPT[seed.name]
  return {
    id,
    name: seed.name,
    firstName: firstName(seed.name),
    initials: initials(seed.name),
    role: seed.role,
    bio: seed.bio,
    temperament: seed.temperament,
    strengths: seed.strengths,
    instructions: seed.instructions,
    active: true,
    sources: s?.sources ?? '0 docs · not yet grounded',
    docCount: s ? Number(s.sources.split(' ')[0]) : 0,
    edited: editedLabel(s?.edited ?? new Date().toISOString()),
    updatedAt: s?.edited ?? new Date().toISOString(),
  }
}

export class DemoStore {
  speed: number
  advisors: Advisor[]
  documents: Record<string, AdvisorDocument[]> = {}
  chats: Record<string, ChatMessage[]> = {}
  sessions: Session[] = []
  brief = ''
  briefUpdatedAt: string | null = null

  constructor(speed = 1) {
    this.speed = speed
    this.advisors = [m1, m2, m3, m4, m5].map((s, i) => advisorFrom(s as Seed, `adv-${i + 1}`))
    this.sessions = SAMPLE_SESSIONS.map((s) => ({ ...s }))
  }

  delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms / this.speed))
  }

  createAdvisor(body: { name: string; role: string; bio?: string; strengths?: { s: string; lv: number }[] }): Advisor {
    const a: Advisor = {
      id: `adv-${Date.now()}`,
      name: body.name.trim(),
      firstName: firstName(body.name),
      initials: initials(body.name),
      role: body.role.trim(),
      bio: body.bio?.trim() ?? '',
      temperament: '',
      strengths: body.strengths ?? [{ s: primarySegment(body.role), lv: 3 }],
      instructions: '',
      active: true,
      sources: sourcesLine(0, []),
      docCount: 0,
      edited: 'Just now',
      updatedAt: new Date().toISOString(),
    }
    this.advisors.push(a)
    return a
  }

  updateAdvisor(id: string, patch: Partial<Advisor>): Advisor {
    const a = this.advisors.find((x) => x.id === id)!
    Object.assign(a, patch, { firstName: firstName(patch.name ?? a.name), initials: initials(patch.name ?? a.name), edited: 'Just now' })
    return a
  }

  removeAdvisor(id: string) {
    this.advisors = this.advisors.filter((a) => a.id !== id)
  }

  refreshSources(id: string) {
    const a = this.advisors.find((x) => x.id === id)!
    const docs = this.documents[id] ?? []
    a.docCount = docs.length
    a.sources = sourcesLine(docs.length, docs.map((d) => d.category))
  }

  async reply(advisorId: string, text: string): Promise<ChatMessage[]> {
    const a = this.advisors.find((x) => x.id === advisorId)!
    const thread = (this.chats[advisorId] ??= [])
    const asked: ChatMessage = { id: `m-${Date.now()}`, from: 'user', text, createdAt: new Date().toISOString() }
    thread.push(asked)
    await this.delay(1600)
    const pool = SCRIPT[a.name]?.replies ?? ['I’m still being configured — my answers will sharpen once documents are attached to my knowledge base.']
    const n = thread.filter((m) => m.from === 'adv').length
    const answered: ChatMessage = { id: `m-${Date.now()}-a`, from: 'adv', text: pool[n % pool.length], createdAt: new Date().toISOString() }
    thread.push(answered)
    return [asked, answered]
  }

  createSession(question: string, brief = '', advisorIds: string[] = []): Session {
    const s: Session = {
      id: `s-${Date.now()}`,
      question,
      brief,
      advisorIds,
      status: 'views',
      stage: 1,
      recommendation: '',
      error: '',
      convenedBy: DEMO_PERSON.name,
      personId: DEMO_PERSON.id,
      createdAt: new Date().toISOString(),
      completedAt: null,
      views: [],
      questions: [],
      questionsClosed: false,
      challenges: [],
      votes: [],
    }
    this.sessions.unshift(s)
    return s
  }

  private touch(s: Session) {
    const room = rosterFor(s, this.advisors)
    s.status = s.status === 'failed' ? 'failed' : statusFor({ rosterSize: room.length, questionsOpen: s.questions.length > 0 && !s.questionsClosed, views: s.views.length, challenges: s.challenges.length, recommendation: Boolean(s.recommendation), votes: s.votes.length })
    if (s.status === 'done' && !s.completedAt) s.completedAt = new Date().toISOString()
    const merged = mergeSession(s, s)
    Object.assign(s, merged)
    return { ...s }
  }

  async step(id: string, step: NextStep): Promise<Session> {
    const s = this.sessions.find((x) => x.id === id)!
    const room = rosterFor(s, this.advisors)
    const a = 'advisorId' in step ? room.find((x) => x.id === step.advisorId)! : null
    const idx = a ? room.indexOf(a) : 0
    if (step.kind === 'view' && a && !s.views.some((v) => v.advisorId === a.id)) {
      await this.delay(800 + idx * 950)
      s.views.push({ advisorId: a.id, name: a.name, initials: a.initials, role: a.role, view: SCRIPT[a.name]?.view ?? 'I don’t have enough grounding on this company yet to take a firm position — flagging that so the synthesis weighs my view accordingly.' })
      const q = QUESTIONS[a.name]
      if (q) s.questions.push({ advisorId: a.id, name: a.name, initials: a.initials, question: q, answer: '' })
    } else if (step.kind === 'challenge' && a && !s.challenges.some((c) => c.fromId === a.id)) {
      await this.delay(800 + idx * 1400)
      const scripted = CHALLENGES.find((c) => c.from === a.name)
      const target = room.find((x) => x.name === scripted?.to) ?? room.find((x) => x.id !== a.id)!
      s.challenges.push({ fromId: a.id, toId: target.id, from: a.name, fi: a.initials, to: target.name, text: scripted?.text ?? `${target.firstName}, what would change your mind, and by when?` })
    } else if (step.kind === 'synthesis' && !s.recommendation) {
      await this.delay(1500)
      s.recommendation = SYNTHESIS
    } else if (step.kind === 'vote' && a && !s.votes.some((v) => v.advisorId === a.id)) {
      await this.delay(500 + idx * 300)
      const v = VOTES[a.name] ?? { vote: 'conditional' as const, statement: 'I would want my knowledge base attached before I stand behind this.' }
      s.votes.push({ advisorId: a.id, name: a.name, initials: a.initials, vote: v.vote, statement: v.statement })
    }
    return this.touch(s)
  }

  answer(id: string, answers: Record<string, string>): Session {
    const s = this.sessions.find((x) => x.id === id)!
    if (!s.questionsClosed) {
      for (const q of s.questions) q.answer = (answers[q.advisorId] ?? '').trim()
      s.questionsClosed = true
    }
    return this.touch(s)
  }

  summaries(): SessionSummary[] {
    return this.sessions.map((s) => {
      const dissent = s.votes.filter((v) => v.vote !== 'agree').length
      const fresh = Date.now() - new Date(s.createdAt).getTime() < 24 * 3600 * 1000
      const outcome = s.status !== 'done' ? (s.status === 'failed' ? 'Stopped before synthesis' : 'In session') : dissent === 0 ? 'Unanimous' : `Synthesis · ${dissent} dissent${dissent === 1 ? '' : 's'}`
      return { id: s.id, question: s.question, status: s.status, createdAt: s.createdAt, outcome, tone: s.status === 'done' && !fresh ? 'neutral' : s.status === 'failed' ? 'neutral' : 'accent' }
    })
  }
}

const SAMPLE_SESSIONS: Session[] = [
  {
    id: 'sample-1',
    question: 'Pricing model overhaul — seats to usage',
    brief: '',
    advisorIds: [],
    status: 'done',
    stage: 3,
    recommendation: 'Move to usage-based pricing for new logos from Q1 and grandfather seats for twelve months.',
    error: '',
    convenedBy: DEMO_PERSON.name,
    personId: DEMO_PERSON.id,
    createdAt: '2026-08-28T15:00:00Z',
    completedAt: '2026-08-28T15:06:00Z',
    views: [],
    questions: [],
    questionsClosed: true,
    challenges: [],
    votes: [
      { advisorId: 'adv-1', name: 'Marcus Chen', initials: 'MC', vote: 'agree', statement: 'Agreed.' },
      { advisorId: 'adv-3', name: 'Elena Vasquez', initials: 'EV', vote: 'disagree', statement: 'Usage pricing punishes the customers who love us most.' },
    ],
  },
  { id: 'sample-2', question: 'VP Engineering — final two candidates', brief: '', advisorIds: [], status: 'done', stage: 3, recommendation: 'Hire the platform candidate.', error: '', convenedBy: DEMO_PERSON.name, personId: DEMO_PERSON.id, createdAt: '2026-08-14T15:00:00Z', completedAt: '2026-08-14T15:05:00Z', views: [], questions: [], questionsClosed: true, challenges: [], votes: [{ advisorId: 'adv-2', name: 'Dr. Amara Osei', initials: 'AO', vote: 'agree', statement: 'Yes.' }] },
  { id: 'sample-3', question: 'EU expansion go/no-go', brief: '', advisorIds: [], status: 'done', stage: 3, recommendation: 'Defer; revisit Q4.', error: '', convenedBy: DEMO_PERSON.name, personId: DEMO_PERSON.id, createdAt: '2026-07-30T15:00:00Z', completedAt: '2026-07-30T15:05:00Z', views: [], questions: [], questionsClosed: true, challenges: [], votes: [{ advisorId: 'adv-5', name: 'James Whitfield', initials: 'JW', vote: 'agree', statement: 'Yes.' }] },
]

/** What the extraction returns for the demo, whatever is pasted. */
export const DEMO_INSIGHT: Insight = {
  company: { name: 'Meridian', oneLiner: 'B2B revenue analytics for mid-market manufacturers', overview: 'Meridian sells revenue-analytics software to mid-market manufacturers on annual subscriptions. It reached $4.2M ARR in Q3 2026, growing about 8% a month with 74% gross margins and 31 people. Fourteen months of runway remain; a platform launch in March 2027 is meant to move it from a reporting tool to a system of record.', stage: 'Seed, raising Series B', currency: 'USD', asOf: '2026-09-10' },
  revenue: { arr: 4_200_000, annualRevenue: null, growthMonthlyPct: 8, grossMarginPct: 74, headcount: 31 },
  assets: { total: null, items: [{ name: 'Cash and equivalents', value: 5_100_000, basis: 'bank, Sep 2026' }, { name: 'Contracted ARR', value: 4_200_000, basis: 'signed subscriptions' }, { name: 'Platform IP', value: null, basis: 'not valued' }] },
  liabilities: { total: null, items: [{ name: 'Deferred revenue', value: 1_400_000, terms: 'annual prepayments' }, { name: 'Office lease', value: 420_000, terms: '2 years remaining' }] },
  cash: { cash: 5_100_000, monthlyNet: -360_000, runwayMonths: 14 },
  overheads: { monthlyTotal: 520_000, items: [{ name: 'Payroll', monthly: 410_000 }, { name: 'Cloud and tooling', monthly: 48_000 }, { name: 'Office', monthly: 17_500 }, { name: 'Sales and marketing programs', monthly: 44_500 }] },
  targets: [{ metric: 'ARR', target: '$6.5M', current: '$4.2M', by: 'Dec 2026', progressPct: 65 }, { metric: 'Enterprise logos', target: '6', current: '2', by: 'Jun 2027', progressPct: 33 }, { metric: 'Series B', target: '$40M pre-money', current: null, by: 'Q1 2027', progressPct: null }],
  pipeline: [{ name: 'Northwind Steel', kind: 'sale', value: 480_000, stage: 'Legal', expectedClose: 'Q2 2027', probabilityPct: 60, blocker: 'Indemnity clause', owner: 'VP Sales' }, { name: 'Kestrel Components', kind: 'sale', value: 310_000, stage: 'Legal', expectedClose: 'Q2 2027', probabilityPct: 55, blocker: 'Indemnity clause', owner: 'VP Sales' }, { name: 'Series B', kind: 'financing', value: 40_000_000, stage: 'Pre-wiring', expectedClose: 'Q1 2027', probabilityPct: null, blocker: null, owner: 'CEO' }],
  valuation: { estimate: 32_000_000, low: null, high: null, basis: 'seed round post-money, Jan 2025' },
  unknowns: ['CAC payback', 'net revenue retention by cohort', 'debt terms'],
}
