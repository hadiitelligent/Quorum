import { apiContext, json, toErrorResponse } from '@/lib/api'
import { runChallenge } from '@/lib/board/convene'

/** POST /api/sessions/:id/challenges/:advisorId → stage 2, one advisor's challenge (idempotent) */
export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; advisorId: string }> }) {
  try {
    const { id, advisorId } = await params
    const ctx = await apiContext()
    return json({ session: await runChallenge({ db: ctx.supabase, person: ctx.person }, id, advisorId) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
