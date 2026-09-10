import { defineCloudflareConfig } from '@opennextjs/cloudflare'

/**
 * Every route is dynamic: the board is rendered per signed-in person from live
 * rows, and the API answers with no-store. Nothing to incrementally cache, so
 * the R2 incremental-cache override is skipped and the Worker stays inside the
 * free tier (no R2 bucket required). Same choice as ITelliBuilder and EQFlow.
 */
export default defineCloudflareConfig({})
