import 'server-only'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PersonRow } from '@/lib/database.types'

/**
 * Sign-in gate: an active row in `public.people`, and nothing else.
 *
 * Same posture as ITelliBuilder and EQFlow. Supabase signups are DISABLED,
 * the sign-in form passes `shouldCreateUser: false`, and accounts are created
 * only by `npm run seed` (scripts/roster.ts) using the service-role key. So
 * the only way to hold an account is for an operator to have made you one.
 */
export async function isOnRoster(email: string | null | undefined): Promise<boolean> {
  if (!email) return false
  const { data } = await createAdminClient()
    .from('people')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .eq('active', true)
    .maybeSingle()
  return Boolean(data)
}

/**
 * The signed-in person's roster row, or null. Read through their own client,
 * so RLS answers the question: a row that is missing or `active = false` is
 * invisible and reads as "not signed in". Deactivating someone locks them out.
 */
export async function getCurrentPerson(): Promise<PersonRow | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase.from('people').select('*').eq('id', user.id).maybeSingle()
  if (error || !data) return null
  return data
}

export async function requirePerson(): Promise<PersonRow> {
  const person = await getCurrentPerson()
  if (!person) redirect('/login?error=not_on_roster')
  return person
}
