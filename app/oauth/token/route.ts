import { OAuthError, exchangeCode, refreshTokens } from '@/lib/oauth/server'

/** The token endpoint: authorization_code (with PKCE) and refresh_token. */
export const dynamic = 'force-dynamic'

async function form(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    return new URLSearchParams(Object.entries(body).filter(([, v]) => typeof v === 'string') as [string, string][])
  }
  return new URLSearchParams(await request.text())
}

export async function POST(request: Request) {
  try {
    const params = await form(request)
    const grant = params.get('grant_type')
    const tokens = grant === 'authorization_code' ? await exchangeCode(params) : grant === 'refresh_token' ? await refreshTokens(params) : null
    if (!tokens) throw new OAuthError('unsupported_grant_type', 'Use authorization_code or refresh_token.')
    return Response.json(tokens, { headers: { 'cache-control': 'no-store', pragma: 'no-cache' } })
  } catch (e) {
    if (e instanceof OAuthError) return Response.json(e.toJSON(), { status: e.status, headers: { 'cache-control': 'no-store' } })
    console.error('[oauth] token:', e)
    return Response.json({ error: 'server_error', error_description: 'Could not issue a token.' }, { status: 500 })
  }
}
