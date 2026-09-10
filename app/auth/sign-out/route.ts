import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { appUrl } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(`${appUrl()}/login`, { status: 303 })
}
