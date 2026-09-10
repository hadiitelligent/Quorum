/**
 * The pure pieces of the OAuth server: random secrets, SHA-256 hashing,
 * base64url, PKCE verification. Web Crypto only, so the same code runs on
 * Cloudflare Workers and in Node 22.
 */

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (const b of arr) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return base64url(arr)
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return base64url(digest)
}

/** PKCE S256: base64url(sha256(verifier)) must equal the challenge. */
export async function pkceMatches(verifier: string, challenge: string): Promise<boolean> {
  if (!verifier || !challenge) return false
  if (verifier.length < 43 || verifier.length > 128) return false
  return (await sha256(verifier)) === challenge
}

/** A redirect URI is exact-matched against the registered list, per the spec; loopback ports may vary. */
export function redirectAllowed(registered: string[], uri: string): boolean {
  if (registered.includes(uri)) return true
  try {
    const u = new URL(uri)
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      return registered.some((r) => {
        try {
          const ru = new URL(r)
          return ru.hostname === u.hostname && ru.pathname === u.pathname && ru.protocol === u.protocol
        } catch {
          return false
        }
      })
    }
  } catch {
    return false
  }
  return false
}

/** Only https redirect targets, or loopback http, may receive a code. */
export function redirectUriAcceptable(uri: string): boolean {
  try {
    const u = new URL(uri)
    if (u.protocol === 'https:') return true
    return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')
  } catch {
    return false
  }
}
