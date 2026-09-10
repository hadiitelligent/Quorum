import 'server-only'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError, PermissionError } from '@/lib/errors'
import { getCurrentPerson } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Database, PersonRow } from '@/lib/database.types'

/**
 * Shared plumbing for the routes: identify the caller, parse the body,
 * re-check permissions, write, and report failure in words the UI can put in
 * front of a person unedited.
 */

export { ApiError, PermissionError } from '@/lib/errors'

export type ApiContext = {
  person: PersonRow
  /** Session-scoped client: RLS applies on top of the checks in the route. */
  supabase: SupabaseClient<Database>
}

export async function apiContext(): Promise<ApiContext> {
  const person = await getCurrentPerson()
  if (!person) throw new ApiError('Your session has expired. Sign in again.', 401)
  return { person, supabase: await createClient() }
}

export function assertAdmin(person: PersonRow): void {
  if (!person.is_admin) throw new PermissionError('Only an admin manages the persona library.')
}

export async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new ApiError('Malformed request body.', 400)
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    // A message written for people (ends with a full stop) stands alone; zod's own wording gets the field name.
    const where = issue.path.length && !/[.!?]$/.test(issue.message) ? `${issue.path.join('.')}: ` : ''
    throw new ApiError(`${where}${issue.message}`, 422)
  }
  return parsed.data
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof PermissionError || error instanceof ApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  console.error('[api] unhandled error:', error)
  return NextResponse.json({ message: 'Not saved — try again.' }, { status: 500 })
}

export { fromPostgrestError } from '@/lib/api-errors'

/** JSON with no store: none of these responses is ever cacheable. */
export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } })
}
