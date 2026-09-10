import { apiContext, json, toErrorResponse } from '@/lib/api'
import { disconnect } from '@/lib/oauth/server'

/** DELETE /api/connections/:clientId → disconnect that Claude */
export const dynamic = 'force-dynamic'

export async function DELETE(_request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    const { clientId } = await params
    const { person } = await apiContext()
    await disconnect(person.id, clientId)
    return json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
