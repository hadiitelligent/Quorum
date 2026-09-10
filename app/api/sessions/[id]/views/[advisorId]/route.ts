import { apiContext, json, toErrorResponse } from '@/lib/api'
import { runView } from '@/lib/board/convene'

/** POST /api/sessions/:id/views/:advisorId → stage 1, one advisor's independent view (idempotent) */
export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; advisorId: string }> }) {
  try {
    const { id, advisorId } = await params
    const ctx = await apiContext()
    return json({ session: await runView({ db: ctx.supabase, person: ctx.person }, id, advisorId) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
