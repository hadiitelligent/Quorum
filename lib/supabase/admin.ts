import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { publicEnv, serviceRoleKey } from '@/lib/env'
import type { Database } from '@/lib/database.types'

/**
 * Service-role client. BYPASSES RLS.
 *
 * Legitimate callers:
 *  - the roster lookup during sign-in, before a session exists;
 *  - /api/health's reachability probe.
 *
 * Anything acting on behalf of a signed-in person must use
 * lib/supabase/server.ts instead, so their permissions actually apply.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
