'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Buildings, ChatsCircle, Stack, UsersThree } from '@phosphor-icons/react'
import { useHref, useShell } from './context'
import { Brand } from './brand'
import { Avatar } from '@/components/ui/avatar'

/**
 * Nav: Board, Sessions, Persona library (admin-only). Board stays active in
 * the Chat and Session views (spec: Shell).
 */
export function Sidebar() {
  const { person, base, demo } = useShell()
  const href = useHref()
  const pathname = usePathname()
  const path = pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname

  const boardActive = path === '/' || path.startsWith('/chat/') || /^\/sessions\/[^/]+/.test(path)
  const sessionsActive = path === '/sessions'
  const businessActive = path === '/business'
  const libraryActive = path === '/library'

  return (
    <aside className="sidebar">
      <Link href={href('/')} className="brand" aria-label="Quorum — board">
        <Brand />
      </Link>
      <nav className="nav" aria-label="Main">
        <Link href={href('/')} className="navbtn" aria-current={boardActive ? 'page' : undefined}>
          <UsersThree size={17} />
          <span>Board</span>
        </Link>
        <Link href={href('/business')} className="navbtn" aria-current={businessActive ? 'page' : undefined}>
          <Buildings size={17} />
          <span>Business</span>
        </Link>
        <Link href={href('/sessions')} className="navbtn" aria-current={sessionsActive ? 'page' : undefined}>
          <ChatsCircle size={17} />
          <span>Sessions</span>
        </Link>
        {person.isAdmin && (
          <Link href={href('/library')} className="navbtn" aria-current={libraryActive ? 'page' : undefined}>
            <Stack size={17} />
            <span>Persona library</span>
          </Link>
        )}
      </nav>
      <div className="sidebar-spacer" />
      <div className="userchip">
        <Avatar initials={person.initials} size={30} tone="neutral" />
        <div>
          <div className="userchip-name">{person.name}</div>
          <div className="userchip-sub">{person.title || (person.isAdmin ? 'Admin' : 'Member')}</div>
        </div>
        {!demo && (
          <form action="/auth/sign-out" method="post">
            <button type="submit">Sign out</button>
          </form>
        )}
      </div>
    </aside>
  )
}
