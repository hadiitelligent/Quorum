import { redirect } from 'next/navigation'
import { Board } from '@/components/board/board'
import { requirePerson } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { briefText } from '@/lib/briefs'

export const dynamic = 'force-dynamic'

/** First sign-in: no standing brief yet → the Business page walks them through it. */
export default async function BoardPage() {
  const person = await requirePerson()
  const brief = await briefText(await createClient(), person.id).catch(() => '')
  if (!brief.trim()) redirect('/business')
  return <Board />
}
