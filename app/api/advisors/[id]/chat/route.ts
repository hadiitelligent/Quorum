import { z } from 'zod'
import { ApiError, apiContext, json, parseBody, toErrorResponse } from '@/lib/api'
import { anthropicKey } from '@/lib/env'
import { getAdvisor } from '@/lib/advisors'
import { appendMessage, listMessages, toMessage } from '@/lib/chats'
import { chatTurn } from '@/lib/board/chat'

/**
 * GET  /api/advisors/:id/chat  → my private conversation with this advisor
 * POST /api/advisors/:id/chat  → { message } → the advisor's reply
 *
 * The conversation is the caller's own (RLS); the advisor answers from its
 * persona and knowledge base (lib/board/chat.ts).
 */
export const dynamic = 'force-dynamic'

export const MAX_MESSAGE = 8_000

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params
    const { person, supabase } = await apiContext()
    const advisor = await getAdvisor(supabase, id, { includeRemoved: true })
    const messages = (await listMessages(supabase, person.id, id)).map(toMessage)
    return json({ advisor, messages })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const { person, supabase } = await apiContext()
    if (!anthropicKey()) throw new ApiError('The advisors are not configured on this deployment (no Anthropic key).', 503)
    const body = await parseBody(
      request,
      z.object({
        message: z.string().trim().min(1, { message: 'Type a message first.' }).max(MAX_MESSAGE, { message: `Keep it under ${MAX_MESSAGE.toLocaleString()} characters.` }),
      }),
    )
    const advisor = await getAdvisor(supabase, id)
    const asked = await appendMessage(supabase, person.id, id, 'user', body.message)
    const reply = await chatTurn(supabase, person, advisor, body.message)
    const answered = await appendMessage(supabase, person.id, id, 'advisor', reply.text, reply.model)
    return json({ messages: [toMessage(asked), toMessage(answered)], model: reply.model })
  } catch (error) {
    return toErrorResponse(error)
  }
}
