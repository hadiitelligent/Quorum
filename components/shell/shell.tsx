import { ShellProvider, type ShellPerson } from './context'
import { Sidebar } from './sidebar'

/** The two-pane shell: fixed 230px sidebar + scrollable main, full height. */
export function AppShell({ person, base, demo, children }: { person: ShellPerson; base: string; demo?: boolean; children: React.ReactNode }) {
  return (
    <ShellProvider value={{ person, base, demo: Boolean(demo) }}>
      <div className="app">
        <Sidebar />
        <div className="main">{children}</div>
      </div>
    </ShellProvider>
  )
}
