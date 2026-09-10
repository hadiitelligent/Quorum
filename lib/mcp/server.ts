import 'server-only'

import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PersonRow } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { appUrl, anthropicKey } from '@/lib/env'
import { listAdvisors } from '@/lib/advisors'
import { getBrief, saveBrief } from '@/lib/briefs'
import { extractInsight } from '@/lib/board/insight'
import { createSession, listSessions, loadSession } from '@/lib/sessions'
import { answerQuestions } from '@/lib/board/convene'
import { BRIEF_CHAR_CAP, DEFAULT_QUESTION, VOTE_LABELS, dissentOf } from '@/lib/quorum/session'
import { money, months, pct } from '@/lib/quorum/insight'
import type { Insight } from '@/lib/quorum/insight'

/**
 * The connector: what a client's Claude can do on Quorum once connected.
 *
 * The bearer token names the person; the tools act as them through the
 * service-role client, with the same ownership checks the routes make
 * (a brief is theirs, a session's questions are the convener's). The
 * surface is deliberately small: the brief, the board, the sessions and
 * their open questions, and convening.
 */

const BRIEF_SECTIONS = [
  '1. The business — what it sells, to whom, how it makes money, model and pricing, size (revenue/ARR, growth, gross margin, headcount), stage, funding, ownership.',
  '2. Where it stands today — the last quarter in numbers and events; what is working, what is not; what changed since the last brief.',
  '3. Assets — cash, property and equipment, inventory, IP, investments, key contracts, brand and audience; dated, with the basis.',
  '4. Liabilities and obligations — debt and terms, leases, guarantees, deferred revenue, legal exposure, covenants and headroom.',
  '5. Cash and runway — cash, burn or free cash flow, months of runway, capital in motion.',
  '6. Goals and targets — the numbers for the next 12 months and 3 years, and tracking against them.',
  '7. Pipeline — every deal that matters (sales, partnerships, financing, acquisitions, hires): counterparty, value, stage, expected close, probability, blocker, owner.',
  '8. Customers and market — concentration, retention and churn, the accounts that matter, competitors and what they did lately.',
  '9. Team — who leads what, gaps, anyone at risk, hiring in progress.',
  '10. Product and roadmap — what ships when and what it changes.',
  '11. Risks and open questions — legal, regulatory, competitive, technical, key-person.',
  '12. Constraints — deadlines, commitments, non-negotiables.',
].join('\n')

const BRIEF_RULES = 'Every figure with a date and a basis; estimates marked as estimates; unknowns left unknown rather than filled; no marketing language; written for a director who has never met the client; under 3,000 words. When updating, keep all twelve sections and add "What changed since the last brief" at the top.'

function insightSummary(i: Insight | null): string {
  if (!i) return 'No insight has been read from the brief yet.'
  const c = i.company.currency
  return [
    `${i.company.name} — ${i.company.oneLiner}${i.company.stage ? ` (${i.company.stage})` : ''}${i.company.asOf ? `, as of ${i.company.asOf}` : ''}`,
    i.company.overview,
    `Revenue: ${i.revenue.arr !== null ? `ARR ${money(i.revenue.arr, c)}` : i.revenue.annualRevenue !== null ? `annual ${money(i.revenue.annualRevenue, c)}` : '—'}${i.revenue.growthMonthlyPct !== null ? `, ${pct(i.revenue.growthMonthlyPct)} MoM` : ''}${i.revenue.grossMarginPct !== null ? `, ${pct(i.revenue.grossMarginPct)} gross margin` : ''}${i.revenue.headcount !== null ? `, ${i.revenue.headcount} people` : ''}`,
    `Cash ${money(i.cash.cash, c)}, monthly net ${money(i.cash.monthlyNet, c)}, runway ${months(i.cash.runwayMonths)}; overheads ${money(i.overheads.monthlyTotal, c)}/month; valuation ${money(i.valuation.estimate, c)} (${i.valuation.basis || 'not stated'})`,
    i.targets.length ? `Targets: ${i.targets.map((t) => `${t.metric} ${t.target} by ${t.by}${t.current ? ` (now ${t.current})` : ''}`).join('; ')}` : 'Targets: none named',
    i.pipeline.length ? `Pipeline: ${i.pipeline.map((d) => `${d.name} (${d.kind}, ${money(d.value, c)}, ${d.stage}${d.expectedClose ? `, ${d.expectedClose}` : ''})`).join('; ')}` : 'Pipeline: none named',
    i.unknowns.length ? `The brief does not say: ${i.unknowns.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildServer(person: PersonRow): McpServer {
  const db = createAdminClient()
  const base = appUrl()
  const server = new McpServer(
    { name: 'quorum', version: '1.0.0' },
    {
      instructions: [
        `Quorum is ${person.name}'s AI board of advisors${person.title ? ` (${person.title})` : ''}. The board knows nothing about their business except the standing brief on Quorum, which you can read and update here.`,
        'When asked to update or refresh the brief: call get_brief, then rewrite the whole brief from everything you know about the person and their business (ask them for material numbers you do not have), and call save_brief with the full text. Quorum reads an insight from it (worth, assets, cash, runway, overheads, targets, pipeline) and shows it on the Business page.',
        'When the board has open questions for the person (get_session shows them), you may answer from what you know and call answer_questions — but only on their say-so; the answers go on the record.',
        'Sessions run in the browser: convene creates one and returns its link; the stages run when the person opens it.',
      ].join('\n\n'),
    },
  )

  server.registerTool(
    'get_brief',
    {
      title: 'Get the standing brief',
      description: 'The standing brief on Quorum (the summary of the business the board reads) and the insight extracted from it. Call before updating the brief.',
      inputSchema: {},
    },
    async () => {
      const brief = await getBrief(db, person.id)
      const text = brief.content.trim()
        ? [
            `STANDING BRIEF (last saved ${brief.updatedAt ?? 'never'}):`,
            '',
            brief.content,
            '',
            'INSIGHT QUORUM READ FROM IT:',
            insightSummary(brief.insight),
            brief.insightError ? `(the last extraction failed: ${brief.insightError})` : '',
            '',
            `To update: rewrite the brief in full with these sections — ${BRIEF_SECTIONS.replace(/\n/g, ' ')} — ${BRIEF_RULES} Then call save_brief.`,
          ]
            .filter((l) => l !== '')
            .join('\n')
        : `There is no standing brief yet. Write one — the board only knows what it is told — with these sections:\n${BRIEF_SECTIONS}\n\n${BRIEF_RULES}\n\nAsk the person for material numbers you do not have, then call save_brief with the full text.`
      return { content: [{ type: 'text', text }] }
    },
  )

  server.registerTool(
    'save_brief',
    {
      title: 'Save the standing brief',
      description: `Replaces the standing brief with the full text given (the whole brief, not a diff) and re-reads the insight from it. Sections:\n${BRIEF_SECTIONS}\n${BRIEF_RULES}`,
      inputSchema: { content: z.string().min(1).max(BRIEF_CHAR_CAP).describe('The complete brief, plain text or markdown, under 3,000 words.') },
    },
    async ({ content }) => {
      let extracted: { insight: Insight | null; model: string | null; error: string } = { insight: null, model: null, error: '' }
      if (!anthropicKey()) extracted.error = 'The insight is not configured on this deployment.'
      else {
        try {
          const out = await extractInsight(content)
          extracted = { insight: out.insight, model: out.model, error: '' }
        } catch (e) {
          extracted.error = e instanceof Error ? e.message : String(e)
        }
      }
      const saved = await saveBrief(db, person.id, content.trim(), extracted)
      return {
        content: [
          {
            type: 'text',
            text: [`Saved (${saved.content.length.toLocaleString()} characters). ${saved.insightError ? `The insight could not be read: ${saved.insightError}` : 'Insight read:'}`, insightSummary(saved.insight), `The Business page: ${base}/business`].join('\n'),
          },
        ],
      }
    },
  )

  server.registerTool(
    'list_advisors',
    { title: 'List the advisors', description: 'The personas on the board: id, name, domain, bio, temperament, rated strengths.', inputSchema: {} },
    async () => {
      const roster = await listAdvisors(db)
      const text = roster.length
        ? roster.map((a) => `- ${a.name} (${a.role}) — id ${a.id}\n  ${a.bio}\n  Temperament: ${a.temperament || 'not set'}. Strengths: ${a.strengths.map((s) => `${s.s} ${s.lv}/5`).join(', ') || 'not rated'}. ${a.sources}.`).join('\n')
        : 'Nobody is on the board yet.'
      return { content: [{ type: 'text', text }] }
    },
  )

  server.registerTool(
    'list_sessions',
    { title: 'List the sessions', description: 'Board sessions on the record, newest first: id, question, when, outcome.', inputSchema: { limit: z.number().optional().describe('How many, default 20.') } },
    async ({ limit }) => {
      const rows = await listSessions(db, Math.min(100, Math.max(1, Math.round(limit ?? 20))))
      const text = rows.length ? rows.map((s) => `- ${s.createdAt.slice(0, 10)} · ${s.question} — ${s.outcome} — id ${s.id}`).join('\n') : 'No sessions yet.'
      return { content: [{ type: 'text', text }] }
    },
  )

  server.registerTool(
    'get_session',
    { title: 'Get a session', description: 'The whole record of one session: the question, who was in the room, the independent views, the board\'s questions for the client and their answers (open questions are flagged), the challenge round, the synthesis, the votes and any dissent.', inputSchema: { session_id: z.string().describe('The session id.') } },
    async ({ session_id }) => {
      const s = await loadSession(db, session_id)
      const open = s.questions.length > 0 && !s.questionsClosed
      const lines = [
        `SESSION ${s.id} — ${s.question}`,
        `Convened by ${s.convenedBy} on ${s.createdAt.slice(0, 10)} · status ${s.status}${s.error ? ` · ${s.error}` : ''} · ${base}/sessions/${s.id}`,
        '',
        s.views.length ? `INDEPENDENT VIEWS\n${s.views.map((v) => `${v.name} (${v.role}): ${v.view}`).join('\n\n')}` : 'No views yet.',
        s.questions.length ? `\nTHE BOARD'S QUESTIONS FOR THE CLIENT${open ? ' — OPEN, waiting for answers' : ''}\n${s.questions.map((q) => `[${q.advisorId}] ${q.name}: ${q.question}\n  Answer: ${q.answer.trim() || '(none yet)'}`).join('\n')}` : '',
        s.challenges.length ? `\nCHALLENGE ROUND\n${s.challenges.map((c) => `${c.from} → ${c.to}: ${c.text}`).join('\n')}` : '',
        s.recommendation ? `\nBOARD SYNTHESIS\n${s.recommendation}` : '',
        s.votes.length ? `\nALIGNMENT\n${s.votes.map((v) => `${v.name}: ${VOTE_LABELS[v.vote]} — ${v.statement}`).join('\n')}` : '',
        dissentOf(s.votes).length ? `\nRECORDED DISSENT (verbatim)\n${dissentOf(s.votes).map((v) => `${v.name}: ${v.statement}`).join('\n')}` : '',
        open && s.personId === person.id ? '\nThe session is paused until the client answers (answer_questions) or proceeds.' : '',
      ]
      return { content: [{ type: 'text', text: lines.filter((l) => l !== '').join('\n') }] }
    },
  )

  server.registerTool(
    'answer_questions',
    {
      title: "Answer the board's questions",
      description: "Answers the board's open questions on a session the person convened and lets it continue. Any question left out is recorded as not answered. The answers go on the record — do this only when the person has told you to.",
      inputSchema: {
        session_id: z.string(),
        answers: z.array(z.object({ advisor_id: z.string().describe('From get_session, the id in square brackets.'), answer: z.string().max(8000) })),
      },
    },
    async ({ session_id, answers }) => {
      const map: Record<string, string> = {}
      for (const a of answers) map[a.advisor_id] = a.answer
      const s = await answerQuestions({ db, person }, session_id, map)
      return { content: [{ type: 'text', text: `Answers recorded; the session is now at "${s.status}". Open it to let the stages run: ${base}/sessions/${s.id}` }] }
    },
  )

  server.registerTool(
    'convene',
    {
      title: 'Convene the board',
      description: 'Creates a board session on a question with the chosen advisors (all of them when none are named), using the standing brief. The stages run when the person opens the returned link in Quorum.',
      inputSchema: {
        question: z.string().min(1).max(4000).describe('The decision to put to the board.'),
        advisor_ids: z.array(z.string()).optional().describe('From list_advisors; omit for the whole board.'),
      },
    },
    async ({ question, advisor_ids }) => {
      const roster = await listAdvisors(db)
      if (roster.length === 0) throw new Error('Nobody is on the board.')
      const active = new Set(roster.map((a) => a.id))
      const invited = (advisor_ids ?? []).filter((id) => active.has(id))
      if (advisor_ids && advisor_ids.length && invited.length === 0) throw new Error('None of those ids is an active advisor.')
      const brief = (await getBrief(db, person.id)).content
      const row = await createSession(db, person.id, question.trim() || DEFAULT_QUESTION, brief, invited.length ? invited : roster.map((a) => a.id))
      return { content: [{ type: 'text', text: `Session created with ${invited.length || roster.length} advisor(s). Open it to run the board: ${base}/sessions/${row.id}` }] }
    },
  )

  return server
}
