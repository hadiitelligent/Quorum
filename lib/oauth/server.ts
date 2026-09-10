import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { OAuthClientRow, PersonRow } from '@/lib/database.types'
import { appUrl } from '@/lib/env'
import { ApiError } from '@/lib/errors'
import { pkceMatches, randomToken, redirectAllowed, redirectUriAcceptable, sha256 } from './crypto'

/**
 * The OAuth 2.1 authorization server behind the connector: dynamic client
 * registration, authorization codes with PKCE, access and refresh tokens.
 * Everything is stored through the service role (the tables have no
 * policies) and every secret is stored as its SHA-256.
 *
 * Lifetimes: a code lives 10 minutes and is single-use; an access token a
 * day; a refresh token 90 days, rotated on use.
 */

export const SCOPE = 'quorum'
const CODE_TTL_MS = 10 * 60_000
const ACCESS_TTL_S = 24 * 3600
const REFRESH_TTL_S = 90 * 24 * 3600

export function issuer(): string {
  return appUrl()
}

export function resourceUrl(): string {
  return `${appUrl()}/api/mcp`
}

/** RFC 9728: where the resource says its authorization server is. */
export function protectedResourceMetadata() {
  return {
    resource: resourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Quorum',
  }
}

/** RFC 8414. */
export function authorizationServerMetadata() {
  const base = issuer()
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
    service_documentation: `${base}/business`,
  }
}

export class OAuthError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, description: string, status = 400) {
    super(description)
    this.code = code
    this.status = status
  }
  toJSON() {
    return { error: this.code, error_description: this.message }
  }
}

// --- clients ---------------------------------------------------------------

export async function registerClient(input: { client_name?: unknown; redirect_uris?: unknown }): Promise<OAuthClientRow> {
  const uris = Array.isArray(input.redirect_uris) ? input.redirect_uris.filter((u): u is string => typeof u === 'string') : []
  if (uris.length === 0) throw new OAuthError('invalid_redirect_uri', 'redirect_uris is required.')
  for (const u of uris) if (!redirectUriAcceptable(u)) throw new OAuthError('invalid_redirect_uri', `Redirect URI not acceptable: ${u}`)
  const name = typeof input.client_name === 'string' ? input.client_name.slice(0, 120) : ''
  const id = `qc_${randomToken(16)}`
  const { data, error } = await createAdminClient().from('oauth_clients').insert({ id, name, redirect_uris: uris }).select('*').maybeSingle()
  if (error || !data) throw new OAuthError('server_error', error?.message ?? 'Could not register the client.', 500)
  return data
}

export async function getClient(id: string): Promise<OAuthClientRow | null> {
  if (!id) return null
  const { data } = await createAdminClient().from('oauth_clients').select('*').eq('id', id).maybeSingle()
  return data ?? null
}

// --- authorization ---------------------------------------------------------

export type AuthorizeRequest = {
  client: OAuthClientRow
  redirectUri: string
  state: string | null
  codeChallenge: string
  scope: string
}

/** Validates the query of /oauth/authorize before anything is shown. */
export async function parseAuthorizeRequest(params: URLSearchParams): Promise<AuthorizeRequest> {
  const clientId = params.get('client_id') ?? ''
  const client = await getClient(clientId)
  if (!client) throw new OAuthError('invalid_client', 'Unknown client. Add the connector again in Claude.')
  const redirectUri = params.get('redirect_uri') ?? ''
  if (!redirectAllowed(client.redirect_uris, redirectUri)) throw new OAuthError('invalid_request', 'The redirect URI is not registered for this client.')
  if ((params.get('response_type') ?? 'code') !== 'code') throw new OAuthError('unsupported_response_type', 'Only response_type=code is supported.')
  if ((params.get('code_challenge_method') ?? '') !== 'S256') throw new OAuthError('invalid_request', 'PKCE with S256 is required.')
  const codeChallenge = params.get('code_challenge') ?? ''
  if (codeChallenge.length < 43) throw new OAuthError('invalid_request', 'code_challenge is required.')
  return { client, redirectUri, state: params.get('state'), codeChallenge, scope: SCOPE }
}

/** The person approved: mint a single-use code bound to the client, redirect URI and PKCE challenge. */
export async function issueCode(request: AuthorizeRequest, person: PersonRow): Promise<string> {
  const code = randomToken(32)
  const { error } = await createAdminClient()
    .from('oauth_codes')
    .insert({
      code_hash: await sha256(code),
      client_id: request.client.id,
      person_id: person.id,
      redirect_uri: request.redirectUri,
      code_challenge: request.codeChallenge,
      scope: request.scope,
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    })
  if (error) throw new OAuthError('server_error', error.message, 500)
  return code
}

// --- tokens ----------------------------------------------------------------

export type TokenResponse = { access_token: string; token_type: 'Bearer'; expires_in: number; refresh_token: string; scope: string }

async function mintTokens(clientId: string, personId: string, scope: string): Promise<TokenResponse> {
  const access = randomToken(32)
  const refresh = randomToken(32)
  const now = Date.now()
  const { error } = await createAdminClient()
    .from('oauth_tokens')
    .insert([
      { token_hash: await sha256(access), kind: 'access', client_id: clientId, person_id: personId, scope, expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString() },
      { token_hash: await sha256(refresh), kind: 'refresh', client_id: clientId, person_id: personId, scope, expires_at: new Date(now + REFRESH_TTL_S * 1000).toISOString() },
    ])
  if (error) throw new OAuthError('server_error', error.message, 500)
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope }
}

export async function exchangeCode(form: URLSearchParams): Promise<TokenResponse> {
  const db = createAdminClient()
  const code = form.get('code') ?? ''
  const verifier = form.get('code_verifier') ?? ''
  const clientId = form.get('client_id') ?? ''
  const redirectUri = form.get('redirect_uri') ?? ''
  if (!code) throw new OAuthError('invalid_request', 'code is required.')
  const { data: row } = await db.from('oauth_codes').select('*').eq('code_hash', await sha256(code)).maybeSingle()
  if (!row) throw new OAuthError('invalid_grant', 'Unknown or expired code.')
  if (row.used_at) {
    // A replayed code: revoke what it issued, per the spec's advice.
    await db.from('oauth_tokens').update({ revoked_at: new Date().toISOString() }).eq('client_id', row.client_id).eq('person_id', row.person_id).is('revoked_at', null)
    throw new OAuthError('invalid_grant', 'That code was already used.')
  }
  if (new Date(row.expires_at).getTime() < Date.now()) throw new OAuthError('invalid_grant', 'The code has expired. Start again from Claude.')
  if (clientId && clientId !== row.client_id) throw new OAuthError('invalid_grant', 'The code belongs to another client.')
  if (redirectUri && redirectUri !== row.redirect_uri) throw new OAuthError('invalid_grant', 'redirect_uri does not match.')
  if (!(await pkceMatches(verifier, row.code_challenge))) throw new OAuthError('invalid_grant', 'PKCE verification failed.')
  await db.from('oauth_codes').update({ used_at: new Date().toISOString() }).eq('code_hash', row.code_hash)
  return mintTokens(row.client_id, row.person_id, row.scope)
}

export async function refreshTokens(form: URLSearchParams): Promise<TokenResponse> {
  const db = createAdminClient()
  const refresh = form.get('refresh_token') ?? ''
  if (!refresh) throw new OAuthError('invalid_request', 'refresh_token is required.')
  const hash = await sha256(refresh)
  const { data: row } = await db.from('oauth_tokens').select('*').eq('token_hash', hash).eq('kind', 'refresh').maybeSingle()
  if (!row || row.revoked_at) throw new OAuthError('invalid_grant', 'Unknown or revoked refresh token.')
  if (new Date(row.expires_at).getTime() < Date.now()) throw new OAuthError('invalid_grant', 'The refresh token has expired. Connect again from Claude.')
  const clientId = form.get('client_id')
  if (clientId && clientId !== row.client_id) throw new OAuthError('invalid_grant', 'The token belongs to another client.')
  // Rotate: the old refresh token dies with this exchange.
  await db.from('oauth_tokens').update({ revoked_at: new Date().toISOString() }).eq('token_hash', hash)
  return mintTokens(row.client_id, row.person_id, row.scope)
}

export async function revokeToken(form: URLSearchParams): Promise<void> {
  const token = form.get('token') ?? ''
  if (!token) return
  const db = createAdminClient()
  const hash = await sha256(token)
  const { data: row } = await db.from('oauth_tokens').select('client_id, person_id').eq('token_hash', hash).maybeSingle()
  if (!row) return
  // Revoking either token ends the connection: everything for that client and person.
  await db.from('oauth_tokens').update({ revoked_at: new Date().toISOString() }).eq('client_id', row.client_id).eq('person_id', row.person_id).is('revoked_at', null)
}

/** The bearer on /api/mcp → the person, or null. Touches last_used_at. */
export async function personForBearer(authorization: string | null): Promise<{ person: PersonRow; clientId: string } | null> {
  const m = /^Bearer\s+(.+)$/i.exec(authorization ?? '')
  if (!m) return null
  const db = createAdminClient()
  const hash = await sha256(m[1].trim())
  const { data: row } = await db.from('oauth_tokens').select('*').eq('token_hash', hash).eq('kind', 'access').maybeSingle()
  if (!row || row.revoked_at || new Date(row.expires_at).getTime() < Date.now()) return null
  const { data: person } = await db.from('people').select('*').eq('id', row.person_id).eq('active', true).maybeSingle()
  if (!person) return null
  await db.from('oauth_tokens').update({ last_used_at: new Date().toISOString() }).eq('token_hash', hash)
  return { person, clientId: row.client_id }
}

// --- the person's connections (for the Business page) ----------------------

export type Connection = { clientId: string; clientName: string; connectedAt: string; lastUsedAt: string | null; expiresAt: string }

export async function listConnections(personId: string): Promise<Connection[]> {
  const db = createAdminClient()
  const { data: tokens, error } = await db
    .from('oauth_tokens')
    .select('client_id, kind, created_at, last_used_at, expires_at, revoked_at')
    .eq('person_id', personId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw new ApiError(error.message, 500)
  const live = (tokens ?? []).filter((t) => new Date(t.expires_at).getTime() > Date.now())
  const ids = [...new Set(live.map((t) => t.client_id))]
  if (ids.length === 0) return []
  const { data: clients } = await db.from('oauth_clients').select('id, name').in('id', ids)
  return ids.map((id) => {
    const mine = live.filter((t) => t.client_id === id)
    const refresh = mine.find((t) => t.kind === 'refresh') ?? mine[0]
    const lastUsed = mine.map((t) => t.last_used_at).filter((x): x is string => Boolean(x)).sort().pop() ?? null
    return {
      clientId: id,
      clientName: clients?.find((c) => c.id === id)?.name || 'Claude',
      connectedAt: mine.map((t) => t.created_at).sort()[0],
      lastUsedAt: lastUsed,
      expiresAt: refresh.expires_at,
    }
  })
}

export async function disconnect(personId: string, clientId: string): Promise<void> {
  await createAdminClient().from('oauth_tokens').update({ revoked_at: new Date().toISOString() }).eq('person_id', personId).eq('client_id', clientId).is('revoked_at', null)
}
