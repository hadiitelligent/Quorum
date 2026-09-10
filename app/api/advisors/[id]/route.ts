import { apiContext, assertAdmin, json, parseBody, toErrorResponse } from '@/lib/api'
import { getAdvisor, removeAdvisor, updateAdvisor } from '@/lib/advisors'
import { listDocuments } from '@/lib/documents'
import { ADVISOR_BODY } from '../route'

/**
 * GET    /api/advisors/:id  → the persona and its documents
 * PATCH  /api/advisors/:id  → edit (admins)
 * DELETE /api/advisors/:id  → remove from the board (admins). Soft: the row
 *                             stays, active = false; chats and sessions keep
 *                             their record.
 */
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params
    const { supabase } = await apiContext()
    const [advisor, documents] = await Promise.all([getAdvisor(supabase, id), listDocuments(supabase, id)])
    return json({ advisor, documents })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const { person, supabase } = await apiContext()
    assertAdmin(person)
    const body = await parseBody(request, ADVISOR_BODY.partial())
    const advisor = await updateAdvisor(supabase, id, body, person.name)
    return json({ advisor })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params
    const { person, supabase } = await apiContext()
    assertAdmin(person)
    await removeAdvisor(supabase, id, person.name)
    return json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
