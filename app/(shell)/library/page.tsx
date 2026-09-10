import { redirect } from 'next/navigation'
import { requirePerson } from '@/lib/auth'
import { Library } from '@/components/library/library'

export const dynamic = 'force-dynamic'

/** Admin only. The API refuses non-admin writes regardless; this keeps the nav honest. */
export default async function LibraryPage() {
  const person = await requirePerson()
  if (!person.is_admin) redirect('/')
  return <Library />
}
