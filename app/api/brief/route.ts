import { z } from 'zod'
import { apiContext, json, parseBody, toErrorResponse } from '@/lib/api'
import { anthropicKey } from '@/lib/env'
import { BRIEF_CHAR_CAP } from '@/lib/quorum/session'
import { getBrief, saveBrief } from '@/lib/briefs'
import { extractInsight } from '@/lib/board/insight'

/**
 * GET /api/brief  → my standing brief and the insight extracted from it
 * PUT /api/brief  → { content } → saved; the insight is re-extracted (one
 *                   model call) when there is content. An extraction failure
 *                   still saves the brief and says why.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { person, supabase } = await apiContext()
    return json({ brief: await getBrief(supabase, person.id) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function PUT(request: Request) {
  try {
    const { person, supabase } = await apiContext()
    const body = await parseBody(
      request,
      z.object({ content: z.string().max(BRIEF_CHAR_CAP, { message: `The brief is over ${BRIEF_CHAR_CAP.toLocaleString()} characters. Ask Claude for a tighter one.` }) }),
    )
    const content = body.content.trim()
    let extracted: { insight: Awaited<ReturnType<typeof extractInsight>>['insight'] | null; model: string | null; error: string } = { insight: null, model: null, error: '' }
    if (content) {
      if (!anthropicKey()) extracted.error = 'The insight is not configured on this deployment (no Anthropic key).'
      else {
        try {
          const out = await extractInsight(content)
          extracted = { insight: out.insight, model: out.model, error: '' }
        } catch (e) {
          extracted.error = e instanceof Error ? e.message : String(e)
        }
      }
    }
    return json({ brief: await saveBrief(supabase, person.id, content, extracted) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
