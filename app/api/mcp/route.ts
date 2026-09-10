import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { personForBearer, resourceUrl } from '@/lib/oauth/server'
import { buildServer } from '@/lib/mcp/server'
import { appUrl } from '@/lib/env'

/**
 * The connector endpoint: MCP over Streamable HTTP, stateless (one server
 * per request), bearer-protected. A missing or bad token answers 401 with
 * the resource-metadata pointer the MCP auth flow follows to sign in.
 */
export const dynamic = 'force-dynamic'

function unauthorized(reason: string) {
  return new Response(JSON.stringify({ error: 'invalid_token', error_description: reason }), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': `Bearer resource_metadata="${appUrl()}/.well-known/oauth-protected-resource/api/mcp", error="invalid_token", error_description="${reason}"`,
      'cache-control': 'no-store',
    },
  })
}

export async function POST(request: Request) {
  const auth = await personForBearer(request.headers.get('authorization'))
  if (!auth) return unauthorized('Sign in to Quorum to connect.')
  const server = buildServer(auth.person)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  try {
    return await transport.handleRequest(request, { authInfo: { token: 'redacted', clientId: auth.clientId, scopes: ['quorum'], resource: new URL(resourceUrl()) } })
  } finally {
    // Stateless: nothing to keep between requests.
    void transport.close().catch(() => {})
  }
}

export async function GET(request: Request) {
  const auth = await personForBearer(request.headers.get('authorization'))
  if (!auth) return unauthorized('Sign in to Quorum to connect.')
  // No server-initiated stream in stateless mode.
  return new Response(null, { status: 405, headers: { allow: 'POST' } })
}

export async function DELETE() {
  return new Response(null, { status: 204 })
}
