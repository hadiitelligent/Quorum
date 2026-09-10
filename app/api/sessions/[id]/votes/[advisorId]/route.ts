import { apiContext, json, toErrorResponse } from '@/lib/api'
import { runVote } from '@/lib/board/convene'

/** POST /api/sessions/:id/votes/:advisorId → one advisor's alignment vote and statement (idempotent) */
export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; advisorId: string }> }) {
  try {
    const { id, advisorId } = await params
    const ctx = await apiContext()
    return json({ session: await runVote({ db: ctx.supabase, person: ctx.person }, id, advisorId) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
