import { requirePerson } from '@/lib/auth'
import { initials } from '@/lib/quorum/text'
import { AppShell } from '@/components/shell/shell'

export const dynamic = 'force-dynamic'

/** Every screen behind sign-in shares the shell. The middleware redirects the anonymous; this re-checks the roster. */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const person = await requirePerson()
  return (
    <AppShell person={{ id: person.id, name: person.name, title: person.title, initials: initials(person.name), isAdmin: person.is_admin }} base="">
      {children}
    </AppShell>
  )
}
