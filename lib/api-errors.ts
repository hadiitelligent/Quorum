import { ApiError } from '@/lib/errors'

/**
 * Maps the database's own refusals to readable messages. Framework-free, so
 * the scripts can share it with the route handlers.
 *
 * The triggers raise with wording written for the person who hit them (the
 * synthesis is on the record, a session only moves forward, a strength out
 * of range); those pass through.
 */
export function fromPostgrestError(error: { code?: string; message: string }): ApiError {
  switch (error.code) {
    case '42501':
      return new ApiError(/record|forward|reopened|question|brief|roster|in this session/.test(error.message) ? error.message : 'Not allowed for you.', 403)
    case '23503':
    case '23514':
      return new ApiError(error.message.replace(/^.*?:\s*/, ''), 422)
    case '23505':
      return new ApiError('That already exists.', 409)
    case 'PGRST116':
      return new ApiError('Not found. Refresh the page.', 404)
    default:
      console.error('[db] error:', error)
      return new ApiError('Not saved — try again.', 500)
  }
}
