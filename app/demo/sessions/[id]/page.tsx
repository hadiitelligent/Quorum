import { SessionView } from '@/components/session/session'

export default async function DemoSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SessionView id={id} />
}
