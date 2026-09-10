/**
 * Errors the service layer throws, with no dependency on anything above it.
 *
 * Kept apart from lib/api.ts on purpose: that module reaches for `next/server`
 * and pulls React in behind it. The services need to say "409, and here is
 * why" from a script without a web framework.
 */

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** A refusal about who is asking, rather than about what they asked for. */
export class PermissionError extends Error {
  readonly status: number
  constructor(message: string, status = 403) {
    super(message)
    this.name = 'PermissionError'
    this.status = status
  }
}
