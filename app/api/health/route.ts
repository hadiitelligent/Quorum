import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { advisorModel, anthropicKey, synthesisModel } from '@/lib/env'

/**
 * GET /api/health — is this deployment actually wired up?
 *
 * Reports what the deployment believes it is configured to do and proves it
 * can reach its database. Says nothing about anybody's data, so it is safe
 * to leave unauthenticated and point a monitor at.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: Record<string, string> = {
    advisors: anthropicKey() ? `on (${advisorModel()}; synthesis ${synthesisModel()})` : 'waiting for an Anthropic key',
  }

  let database = 'unreachable'
  try {
    const { error } = await createAdminClient().from('advisors').select('id', { head: true, count: 'exact' })
    database = error ? `error: ${error.message}` : 'ok'
  } catch (error) {
    database = error instanceof Error ? `error: ${error.message}` : 'error'
  }

  return NextResponse.json(
    { status: database === 'ok' ? 'ok' : 'degraded', database, ...checks },
    { status: database === 'ok' ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  )
}
