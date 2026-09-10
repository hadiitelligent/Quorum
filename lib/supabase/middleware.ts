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

  const isPublicPath = pathname === '/login' || pathname.startsWith('/auth/')

  // API routes answer for themselves with a 401, never with an HTML login page
  // that reads as a 200 to a caller.
  const isApiPath = pathname.startsWith('/api/')

  if (!user && !isPublicPath && !isApiPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
