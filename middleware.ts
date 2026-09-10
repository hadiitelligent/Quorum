/**
 * Deliberately `middleware.ts`, not Next 16's newer `proxy.ts`.
 *
 * Next 16 pinned `proxy.ts` to the Node runtime; @opennextjs/cloudflare only
 * supports edge middleware and rejects the Node variant outright. Next 16 still
 * supports `middleware.ts` on the edge runtime for exactly this case. The build
 * prints a deprecation warning; that warning is the cost of the app building at
 * all. Same reasoning as ITelliBuilder and EQFlow.
 */
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // Everything except Next's own assets and static files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
