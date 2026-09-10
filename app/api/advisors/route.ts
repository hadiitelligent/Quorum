import { z } from 'zod'
import { apiContext, assertAdmin, json, parseBody, toErrorResponse } from '@/lib/api'
import { createAdvisor, listAdvisors } from '@/lib/advisors'

/**
 * GET  /api/advisors   → the active roster (everyone on the roster)
 * POST /api/advisors   → a new persona (admins)
 */
export const dynamic = 'force-dynamic'

const STRENGTH = z.object({ s: z.string().trim().max(60), lv: z.number().int().min(1).max(5) })

export const ADVISOR_BODY = z.object({
  name: z.string().trim().min(1, { message: 'Give the persona a name.' }).max(80),
  role: z.string().trim().min(1, { message: 'Give the persona a domain.' }).max(80),
  bio: z.string().trim().max(600).optional(),
  temperament: z.string().trim().max(120).optional(),
  strengths: z.array(STRENGTH).max(3).optional(),
  instructions: z.string().trim().max(6000).optional(),
})

export async function GET() {
  try {
    const { supabase } = await apiContext()
    return json({ advisors: await listAdvisors(supabase) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const { person, supabase } = await apiContext()
    assertAdmin(person)
    const body = await parseBody(request, ADVISOR_BODY)
    const advisor = await createAdvisor(supabase, body, person.name)
    return json({ advisor }, 201)
  } catch (error) {
    return toErrorResponse(error)
  }
}
