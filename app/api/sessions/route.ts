import { z } from 'zod'
import { ApiError, apiContext, json, parseBody, toErrorResponse } from '@/lib/api'
import { anthropicKey } from '@/lib/env'
import { listAdvisors } from '@/lib/advisors'
import { createSession, listSessions, loadSession } from '@/lib/sessions'
import { DEFAULT_QUESTION } from '@/lib/quorum/session'

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
    const body = await parseBody(request, z.object({ question: z.string().trim().max(4000).optional().default('') }))
    const roster = await listAdvisors(supabase)
    if (roster.length === 0) throw new ApiError('There is nobody on the board. Add a persona first.', 409)
    const row = await createSession(supabase, person.id, body.question || DEFAULT_QUESTION)
    return json({ session: await loadSession(supabase, row.id) }, 201)
  } catch (error) {
    return toErrorResponse(error)
  }
}
