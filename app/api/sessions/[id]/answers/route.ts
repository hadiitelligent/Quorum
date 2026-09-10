import { z } from 'zod'
import { apiContext, json, parseBody, toErrorResponse } from '@/lib/api'
import { answerQuestions } from '@/lib/board/convene'

/** POST /api/sessions/:id/answers → { answers: { [advisorId]: text } } → the questions close and the session moves on */
export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await apiContext()
    const body = await parseBody(request, z.object({ answers: z.record(z.string().uuid(), z.string().max(8000)).default({}) }))
    return json({ session: await answerQuestions({ db: ctx.supabase, person: ctx.person }, id, body.answers) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
