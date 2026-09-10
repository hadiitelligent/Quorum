import { apiContext, json, toErrorResponse } from '@/lib/api'
import { complete } from '@/lib/board/convene'

/** POST /api/sessions/:id/complete → marks the session done once every vote is in */
export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await apiContext()
    return json({ session: await complete({ db: ctx.supabase, person: ctx.person }, id) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
