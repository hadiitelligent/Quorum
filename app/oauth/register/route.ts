import { OAuthError, registerClient } from '@/lib/oauth/server'

/** RFC 7591 dynamic client registration — how a Claude registers itself before sending the person to sign in. */
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const client = await registerClient(body)
    return Response.json(
      {
        client_id: client.id,
        client_id_issued_at: Math.floor(new Date(client.created_at).getTime() / 1000),
        client_name: client.name,
        redirect_uris: client.redirect_uris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: 'quorum',
      },
      { status: 201, headers: { 'cache-control': 'no-store' } },
    )
  } catch (e) {
    if (e instanceof OAuthError) return Response.json(e.toJSON(), { status: e.status })
    console.error('[oauth] register:', e)
    return Response.json({ error: 'server_error', error_description: 'Could not register the client.' }, { status: 500 })
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } })
}
