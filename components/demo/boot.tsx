'use client'

import { installDemo } from './mock'

// Module load, not an effect: the screens fetch in their effects, and the
// patch must be in place before the first one runs.
if (typeof window !== 'undefined') installDemo()

export function DemoBoot() {
  return null
}
