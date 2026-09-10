import { notFound } from 'next/navigation'
import { AppShell } from '@/components/shell/shell'
import { DemoBoot } from '@/components/demo/boot'
import { DEMO_PERSON } from '@/components/demo/script'

/**
 * The scripted demo: the real screens over the prototype's scripted data,
 * with no database and no model. Development only; 404 in production.
 * `?speed=3` scales the stage delays.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <AppShell person={DEMO_PERSON} base="/demo" demo>
      <DemoBoot />
      {children}
    </AppShell>
  )
}
