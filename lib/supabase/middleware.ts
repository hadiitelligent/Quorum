import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'
import type { Database } from '@/lib/database.types'

/**
 * Refreshes the auth cookie and gates the app behind sign-in.
 *
 * `getUser()` — not `getSession()` — because it revalidates the token with the
 * auth server rather than trusting whatever the cookie claims.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  // The scripted demo needs no database and no session, and exists only in
  // development (app/demo/page.tsx 404s in production).
  if (process.env.NODE_ENV !== 'production' && request.nextUrl.pathname.startsWith('/demo')) {
    return response
  }

  const supabase = createServerClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isPublicPath =
    pathname === '/login' ||
    pathname.startsWith('/auth/') ||
    // The connector's OAuth server: discovery, registration, tokens are called by
    // the client's Claude, never by a browser session. /oauth/authorize is NOT
    // public — that is where the person signs in.
    pathname.startsWith('/.well-known/') ||
    pathname === '/oauth/register' ||
    pathname === '/oauth/token' ||
    pathname === '/oauth/revoke'

  // API routes answer for themselves with a 401, never with an HTML login page
  // that reads as a 200 to a caller.
  const isApiPath = pathname.startsWith('/api/')

  if (!user && !isPublicPath && !isApiPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    const redirect = NextResponse.redirect(url)
    // Remember where they were going (the OAuth approval page, typically) so
    // the sign-in link brings them back. Same browser; fifteen minutes.
    if (pathname !== '/' && !pathname.startsWith('/_next')) {
      redirect.cookies.set('quorum.next', `${pathname}${request.nextUrl.search}`, { path: '/', maxAge: 900, httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:' })
    }
    return redirect
  }

  return response
}
