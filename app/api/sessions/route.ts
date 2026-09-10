import { z } from 'zod'
import { ApiError, apiContext, json, parseBody, toErrorResponse } from '@/lib/api'
import { anthropicKey } from '@/lib/env'
import { listAdvisors } from '@/lib/advisors'
import { createSession, listSessions, loadSession } from '@/lib/sessions'
import { BRIEF_CHAR_CAP, DEFAULT_QUESTION } from '@/lib/quorum/session'

/**
 * GET  /api/sessions  → every session on the record, newest first
 * POST /api/sessions  → { question } → a new session; the client then drives
 *                       the stages (lib/quorum/session.ts nextSteps)
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await apiContext()
    return json({ sessions: await listSessions(supabase) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const { person, supabase } = await apiContext()
    if (!anthropicKey()) throw new ApiError('The board cannot be convened on this deployment (no Anthropic key).', 503)
    const body = await parseBody(
      request,
      z.object({
        question: z.string().trim().max(4000).optional().default(''),
        brief: z.string().trim().max(BRIEF_CHAR_CAP, { message: `The brief is over ${BRIEF_CHAR_CAP.toLocaleString()} characters. Ask Claude for a tighter summary.` }).optional().default(''),
        advisorIds: z.array(z.string().uuid()).max(50).optional(),
      }),
    )
    const roster = await listAdvisors(supabase)
    if (roster.length === 0) throw new ApiError('There is nobody on the board. Add a persona first.', 409)
    // The invited: every id must be an active advisor; none named means everyone.
    const active = new Set(roster.map((a) => a.id))
    const invited = [...new Set(body.advisorIds ?? [])].filter((id) => active.has(id))
    if (body.advisorIds && invited.length === 0) throw new ApiError('Pick at least one advisor for the session.', 422)
    const row = await createSession(supabase, person.id, body.question || DEFAULT_QUESTION, body.brief, invited.length === roster.length ? roster.map((a) => a.id) : invited)
    return json({ session: await loadSession(supabase, row.id) }, 201)
  } catch (error) {
    return toErrorResponse(error)
  }
}
