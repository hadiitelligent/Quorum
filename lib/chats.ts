import type { Db } from '@/lib/advisors'
import type { ChatMessageRow } from '@/lib/database.types'
import type { ChatMessage } from '@/lib/quorum/types'
import { fromPostgrestError } from '@/lib/api-errors'
import { ApiError } from '@/lib/errors'

/**
 * Private 1:1 conversations — persistence only. One conversation per person
 * and advisor; RLS makes it visible to that person alone, and nobody edits a
 * transcript after the fact.
 */

export function toMessage(row: ChatMessageRow): ChatMessage {
  return { id: row.id, from: row.role === 'user' ? 'user' : 'adv', text: row.content, createdAt: row.created_at }
}

export async function listMessages(db: Db, personId: string, advisorId: string): Promise<ChatMessageRow[]> {
  const { data, error } = await db
    .from('chat_messages')
    .select('*')
    .eq('person_id', personId)
    .eq('advisor_id', advisorId)
    .order('created_at')
  if (error) throw fromPostgrestError(error)
  return data ?? []
}

export async function appendMessage(db: Db, personId: string, advisorId: string, role: 'user' | 'advisor', content: string, model: string | null = null): Promise<ChatMessageRow> {
  const { data, error } = await db
    .from('chat_messages')
    .insert({ person_id: personId, advisor_id: advisorId, role, content, model })
    .select('*')
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) throw new ApiError('Could not save the message.', 500)
  return data
}
