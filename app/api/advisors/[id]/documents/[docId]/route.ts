import { apiContext, assertAdmin, json, toErrorResponse } from '@/lib/api'
import { removeDocument } from '@/lib/documents'

/** DELETE /api/advisors/:id/documents/:docId → drop a grounding document (admins) */
export const dynamic = 'force-dynamic'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const { id, docId } = await params
    const { person, supabase } = await apiContext()
    assertAdmin(person)
    await removeDocument(supabase, id, docId)
    return json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
