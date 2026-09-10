import 'server-only'

import type { Db } from '@/lib/advisors'
import type { PersonRow } from '@/lib/database.types'
import type { Advisor } from '@/lib/quorum/types'
import { advisorModel } from '@/lib/env'
import { listMessages } from '@/lib/chats'
import { activeRoster, boardContext, personaSystem } from './context'
import { chatSystemAddendum } from './prompts'
import { callText, type ModelText } from './model'

/** The model sees the last this-many messages of the private conversation. */
const HISTORY = 30

/**
 * One turn of a private 1:1 (spec §2): the persona, its knowledge base, the
 * conversation so far, the new question. Plain prose back.
 */
export async function chatTurn(db: Db, person: PersonRow, advisor: Advisor, question: string): Promise<ModelText> {
  const roster = await activeRoster(db)
  const system = await personaSystem(db, advisor, boardContext(person, roster))
  const history = (await listMessages(db, person.id, advisor.id)).slice(-HISTORY)
  return callText({
    model: advisorModel(),
    system: [...system, { text: chatSystemAddendum(), cache: false }],
    messages: [...history.map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.content })), { role: 'user', content: question }],
    effort: 'medium',
  })
}
