import { apiContext, json, toErrorResponse } from '@/lib/api'
import { loadSession } from '@/lib/sessions'

/** GET /api/sessions/:id → the whole record */
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { supabase } = await apiContext()
    return json({ session: await loadSession(supabase, id) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
