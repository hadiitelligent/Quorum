import { z } from 'zod'
import { apiContext, assertAdmin, json, parseBody, toErrorResponse } from '@/lib/api'
import { getAdvisor } from '@/lib/advisors'
import { DOCUMENT_CHAR_CAP, addDocument, listDocuments } from '@/lib/documents'

/**
 * GET  /api/advisors/:id/documents  → the knowledge base (titles, sizes)
 * POST /api/advisors/:id/documents  → add or replace a text document (admins)
 */
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params
    const { supabase } = await apiContext()
    return json({ documents: await listDocuments(supabase, id) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const { person, supabase } = await apiContext()
    assertAdmin(person)
    await getAdvisor(supabase, id)
    const body = await parseBody(
      request,
      z.object({
        title: z.string().trim().min(1, { message: 'Give the document a title.' }).max(160),
        category: z.string().trim().max(60).optional().default(''),
        content: z
          .string()
          .min(1, { message: 'That document is empty.' })
          .max(DOCUMENT_CHAR_CAP, { message: `That document is over ${DOCUMENT_CHAR_CAP.toLocaleString()} characters. Split it.` }),
      }),
    )
    const document = await addDocument(supabase, id, body, person.name)
    return json({ document }, 201)
  } catch (error) {
    return toErrorResponse(error)
  }
}
