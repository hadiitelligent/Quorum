'use client'

import { createContext, useContext } from 'react'

/**
 * Who is looking, and where the app is mounted. The deployed app mounts at
 * "/"; the dev-only scripted demo mounts the same screens at "/demo".
 */
export type ShellPerson = { id: string; name: string; title: string; initials: string; isAdmin: boolean }

export type Shell = { person: ShellPerson; base: string; demo: boolean }

const ShellContext = createContext<Shell | null>(null)

export function ShellProvider({ value, children }: { value: Shell; children: React.ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}

export function useShell(): Shell {
  const shell = useContext(ShellContext)
  if (!shell) throw new Error('useShell outside of ShellProvider')
  return shell
}

/** A link inside the app, respecting the mount point. */
export function useHref(): (path: string) => string {
  const { base } = useShell()
  return (path: string) => `${base}${path}` || '/'
}
