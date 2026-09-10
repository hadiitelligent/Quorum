import { Chat } from '@/components/chat/chat'

export default async function ChatPage({ params }: { params: Promise<{ advisorId: string }> }) {
  const { advisorId } = await params
  return <Chat advisorId={advisorId} />
}
