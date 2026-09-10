import { revokeToken } from '@/lib/oauth/server'

/** RFC 7009: revoking either token ends the connection. Always 200. */
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  await revokeToken(new URLSearchParams(await request.text())).catch(() => {})
  return new Response(null, { status: 200 })
}
