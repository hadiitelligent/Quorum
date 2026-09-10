import { apiContext, json, toErrorResponse } from '@/lib/api'
import { runSynthesis } from '@/lib/board/convene'

/** POST /api/sessions/:id/synthesis → stage 3, the board synthesis (idempotent) */
export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await apiContext()
    return json({ session: await runSynthesis({ db: ctx.supabase, person: ctx.person }, id) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
