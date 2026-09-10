import { z } from 'zod'

/**
 * Environment configuration.
 *
 * Validated in groups and on FIRST USE, never at import: this module sits at
 * the bottom of many import chains and a unit test of a pure helper must not
 * fail because Supabase credentials are absent. The literal
 * `process.env.NEXT_PUBLIC_*` references still let Next inline the values into
 * the client bundle at build time.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

function read<T extends z.ZodTypeAny>(schema: T, values: unknown, group: string): z.infer<T> {
  const parsed = schema.safeParse(values)
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Missing or invalid ${group} environment variables: ${missing}. See .env.example.`)
  }
  return parsed.data
}

let cachedPublicEnv: z.infer<typeof publicSchema> | null = null

function loadPublicEnv() {
  cachedPublicEnv ??= read(
    publicSchema,
    {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    'Supabase',
  )
  return cachedPublicEnv
}

export const publicEnv = {
  get NEXT_PUBLIC_SUPABASE_URL() {
    return loadPublicEnv().NEXT_PUBLIC_SUPABASE_URL
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY() {
    return loadPublicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY
  },
}

/**
 * Absolute origin of this deployment. No platform fallback in production: it
 * is what every sign-in link is built from.
 */
export function appUrl(): string {
  const raw = process.env.APP_URL
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'APP_URL is not set. It must be the canonical origin of this deployment and must match ' +
          'the redirect URL configured in Supabase Auth.',
      )
    }
    return 'http://localhost:3000'
  }
  return raw.replace(/\/+$/, '')
}

/** Server-only. Bypasses RLS — never import this from a client component. */
export function serviceRoleKey(): string {
  return read(
    z.object({ SUPABASE_SERVICE_ROLE_KEY: z.string().min(1) }),
    { SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY },
    'Supabase service role',
  ).SUPABASE_SERVICE_ROLE_KEY
}

/**
 * The Anthropic key. `ANTHROPIC_API_KEY` is the SDK's own convention;
 * `CLAUDE_API_KEY` is accepted as an alias because it is what people type.
 */
export function anthropicKey(): string | null {
  return process.env.ANTHROPIC_API_KEY?.trim() || process.env.CLAUDE_API_KEY?.trim() || null
}

export function requireAnthropicEnv(): { ANTHROPIC_API_KEY: string } {
  const key = anthropicKey()
  if (!key) throw new Error('Missing Anthropic credentials: set ANTHROPIC_API_KEY (or CLAUDE_API_KEY). See .env.example.')
  return { ANTHROPIC_API_KEY: key }
}

/** The model every advisor speaks with. Opus 5 unless overridden. */
export function advisorModel(): string {
  return process.env.ADVISOR_MODEL?.trim() || 'claude-opus-5'
}

/** The model that writes the board's synthesis. Opus 5 unless overridden. */
export function synthesisModel(): string {
  return process.env.SYNTHESIS_MODEL?.trim() || 'claude-opus-5'
}
