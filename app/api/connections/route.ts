import { apiContext, json, toErrorResponse } from '@/lib/api'
import { listConnections } from '@/lib/oauth/server'

/** GET /api/connections → the Claudes connected to my account */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { person } = await apiContext()
    return json({ connections: await listConnections(person.id) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
