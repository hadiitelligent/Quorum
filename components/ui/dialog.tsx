'use client'

import { useEffect } from 'react'

/** The Nocturne modal: 440px surface, 14px radius, shadow-lg, 50% neutral-900 backdrop. Escape closes. */
export function Dialog({ title, onClose, wide, children, actions }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode; actions: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-title">{title}</div>
        {children}
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  )
}
