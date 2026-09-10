import type { Db } from '@/lib/advisors'
import { fromPostgrestError } from '@/lib/api-errors'
import { isInsight, type Insight } from '@/lib/quorum/insight'

/**
 * The standing brief — persistence only. One per person, theirs alone (RLS).
 * Convening copies it onto the session; this is the living copy, with the
 * insight extracted from it.
 */

export type StandingBrief = {
  content: string
  updatedAt: string | null
  insight: Insight | null
  insightError: string
}

export async function getBrief(db: Db, personId: string): Promise<StandingBrief> {
  const { data, error } = await db.from('briefs').select('content, updated_at, insight, insight_error').eq('person_id', personId).maybeSingle()
  if (error) throw fromPostgrestError(error)
  return {
    content: data?.content ?? '',
    updatedAt: data?.updated_at ?? null,
    insight: data && isInsight(data.insight) ? data.insight : null,
    insightError: data?.insight_error ?? '',
  }
}

/** The text only — what a session and a chat need. */
export async function briefText(db: Db, personId: string): Promise<string> {
  const { data, error } = await db.from('briefs').select('content').eq('person_id', personId).maybeSingle()
  if (error) throw fromPostgrestError(error)
  return data?.content ?? ''
}

export async function saveBrief(
  db: Db,
  personId: string,
  content: string,
  extracted: { insight: Insight | null; model: string | null; error: string },
): Promise<StandingBrief> {
  const { data, error } = await db
    .from('briefs')
    .upsert(
      { person_id: personId, content, insight: (extracted.insight ?? {}) as Record<string, unknown>, insight_model: extracted.model, insight_error: extracted.error },
      { onConflict: 'person_id' },
    )
    .select('content, updated_at, insight, insight_error')
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  return {
    content: data?.content ?? content,
    updatedAt: data?.updated_at ?? null,
    insight: data && isInsight(data.insight) ? data.insight : null,
    insightError: data?.insight_error ?? '',
  }
}
