import { test } from 'node:test'
import assert from 'node:assert/strict'
import { base64url, pkceMatches, randomToken, redirectAllowed, redirectUriAcceptable, sha256 } from '../../lib/oauth/crypto'

test('base64url and sha256 match the PKCE test vector from RFC 7636', async () => {
  // Appendix B: verifier → challenge
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
  assert.equal(await sha256(verifier), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  assert.equal(base64url(new Uint8Array([255, 254, 253])), '__79')
  assert.ok(await pkceMatches(verifier, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'))
  assert.ok(!(await pkceMatches(verifier, 'wrong')))
  assert.ok(!(await pkceMatches('short', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')))
})

test('random tokens are url-safe and distinct', () => {
  const a = randomToken()
  const b = randomToken()
  assert.notEqual(a, b)
  assert.match(a, /^[A-Za-z0-9_-]{40,}$/)
})

test('redirect URIs are exact-matched, loopback ports may vary, only https or loopback are accepted', () => {
  const registered = ['https://claude.ai/api/mcp/auth_callback', 'http://127.0.0.1:3333/callback']
  assert.ok(redirectAllowed(registered, 'https://claude.ai/api/mcp/auth_callback'))
  assert.ok(!redirectAllowed(registered, 'https://claude.ai/api/mcp/auth_callback?x=1'))
  assert.ok(!redirectAllowed(registered, 'https://evil.example/api/mcp/auth_callback'))
  assert.ok(redirectAllowed(registered, 'http://127.0.0.1:41234/callback'))
  assert.ok(!redirectAllowed(registered, 'http://127.0.0.1:41234/other'))
  assert.ok(redirectUriAcceptable('https://claude.ai/x'))
  assert.ok(redirectUriAcceptable('http://localhost:1/x'))
  assert.ok(!redirectUriAcceptable('http://example.com/x'))
  assert.ok(!redirectUriAcceptable('not a url'))
})
