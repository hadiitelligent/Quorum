import { authorizationServerMetadata } from '@/lib/oauth/server'

export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json(authorizationServerMetadata(), { headers: { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' } })
}
