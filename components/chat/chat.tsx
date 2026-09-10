'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, LockSimple, PaperPlaneTilt } from '@phosphor-icons/react'
import type { Advisor, ChatMessage } from '@/lib/quorum/types'
import { api } from '@/lib/client-api'
import { useHref } from '@/components/shell/context'
import { Avatar } from '@/components/ui/avatar'

/** Screen 2 — a private 1:1 with one advisor. */
export function Chat({ advisorId }: { advisorId: string }) {
  const href = useHref()
  const [advisor, setAdvisor] = useState<Advisor | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    api.chat.get(advisorId).then((r) => {
      if (!alive) return
      if (r.ok) {
        setAdvisor(r.data.advisor)
        setMessages(r.data.messages)
      } else setError(r.message)
    })
    return () => {
      alive = false
    }
  }, [advisorId])

  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, typing])

  async function send() {
    const text = draft.trim()
    if (!text || typing) return
    setDraft('')
    setError(null)
    setTyping(true)
    const optimistic: ChatMessage = { id: `local-${Date.now()}`, from: 'user', text, createdAt: new Date().toISOString() }
    setMessages((m) => [...m, optimistic])
    const r = await api.chat.send(advisorId, text)
    setTyping(false)
    if (!r.ok) {
      setError(r.message)
      setMessages((m) => m.filter((x) => x.id !== optimistic.id))
      setDraft(text)
      return
    }
    setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), ...r.data.messages])
  }

  const name = advisor?.firstName ?? 'the advisor'

  return (
    <div className="chat">
      <div className="chat-head">
        <Link href={href('/')} className="btn btn-icon btn-secondary" aria-label="Back to board">
          <ArrowLeft size={16} />
        </Link>
        <Avatar initials={advisor?.initials ?? '…'} size={34} />
        <div className="who">
          <div className="chat-name">{advisor?.name ?? '…'}</div>
          <div className="chat-role">{advisor?.role ?? ''}</div>
        </div>
        <span className="tag tag-outline">Private 1:1</span>
      </div>

      <div className="chat-body" ref={bodyRef}>
        {messages.length === 0 && !typing && (
          <div className="chat-empty">
            <LockSimple size={22} />
            This conversation is private. {name} answers from the persona and knowledge base your admin configured.
          </div>
        )}
        {messages.map((m) =>
          m.from === 'user' ? (
            <div className="bubble-user" key={m.id}>
              {m.text}
            </div>
          ) : (
            <div className="bubble-row fade-up" key={m.id}>
              <Avatar initials={advisor?.initials ?? ''} size={26} tone="neutral" />
              <div className="bubble-adv">{m.text}</div>
            </div>
          ),
        )}
        {typing && (
          <div className="typing" aria-label={`${name} is typing`}>
            <i />
            <i />
            <i />
          </div>
        )}
        {error && <div className="msg warn">{error}</div>}
      </div>

      <div className="chat-input">
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder={`Ask ${name} anything…`}
          aria-label={`Message ${name}`}
          disabled={!advisor?.active}
        />
        <button className="btn btn-primary" onClick={send} disabled={typing || !advisor?.active} aria-label="Send">
          <PaperPlaneTilt size={16} />
        </button>
      </div>
    </div>
  )
}
