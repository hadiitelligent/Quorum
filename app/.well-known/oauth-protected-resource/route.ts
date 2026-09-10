import { protectedResourceMetadata } from '@/lib/oauth/server'

export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json(protectedResourceMetadata(), { headers: { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' } })
}
