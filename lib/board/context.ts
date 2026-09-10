import 'server-only'

import type { Db } from '@/lib/advisors'
import { listAdvisors } from '@/lib/advisors'
import { groundingFor } from '@/lib/documents'
import type { PersonRow } from '@/lib/database.types'
import type { Advisor } from '@/lib/quorum/types'
import { groundingBlock, personaPrompt, type BoardContext } from './prompts'
import type { SystemBlock } from './model'

/**
 * What every advisor call needs: the board context (who the client is, who
 * else is on the board) and the persona's system blocks, built once per
 * request and shared across stages.
 */

export function boardContext(person: PersonRow, roster: Advisor[]): BoardContext {
  return {
    client: person.title ? `${person.name}, ${person.title}` : person.name,
    roster: roster.map((a) => ({ name: a.name, role: a.role })),
  }
}

/** [persona][knowledge base] — both cache-marked. */
export async function personaSystem(db: Db, advisor: Advisor, board: BoardContext): Promise<SystemBlock[]> {
  const docs = await groundingFor(db, advisor.id)
  return [
    { text: personaPrompt(advisor, board), cache: true },
    { text: groundingBlock(docs), cache: true },
  ]
}

export async function activeRoster(db: Db): Promise<Advisor[]> {
  return listAdvisors(db)
}
