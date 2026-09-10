'use client'

import { useSyncExternalStore } from 'react'

/**
 * A localStorage value as React state, without an effect.
 *
 * Reading it in an effect and copying into state is the pattern the React
 * hooks lint rule rejects; a store subscription is the shape it wants, and it
 * also means two tabs agree. Same helper as ITelliBuilder.
 */

const EVENT = 'quorum:stored'
const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = () => cb()
  window.addEventListener('storage', onStorage)
  window.addEventListener(EVENT, onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(EVENT, onStorage)
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStored(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {}
  window.dispatchEvent(new Event(EVENT))
}

/** Null on the server and during hydration; the stored value after. */
export function useStored(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  )
}
