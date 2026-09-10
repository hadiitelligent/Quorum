import { Chat } from '@/components/chat/chat'

export default async function DemoChatPage({ params }: { params: Promise<{ advisorId: string }> }) {
  const { advisorId } = await params
  return <Chat advisorId={advisorId} />
}
