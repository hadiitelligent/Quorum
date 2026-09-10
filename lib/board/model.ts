import 'server-only'

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'
import { requireAnthropicEnv } from '@/lib/env'
import { ApiError } from '@/lib/errors'

/**
 * One place that talks to the Claude API.
 *
 * Every call is a single Messages request with the persona's system prompt
 * split into cache-marked blocks (the persona, then its knowledge base), so a
 * session's N views, N challenges and N votes, and every private chat turn,
 * reuse the same cached prefix per advisor.
 *
 * Opus 5 by default (lib/env). Thinking is the model's own (adaptive by
 * default on Opus 5); effort is set per stage. Server-side refusal fallback
 * ("default") is on for the Fable / Opus 5 family, so a request the model
 * declines is re-run on the next model down inside the same call instead of
 * becoming an error on the board.
 */

const MAX_TOKENS = 4_000

export type SystemBlock = { text: string; cache: boolean }

export type ModelCall = {
  model: string
  system: SystemBlock[]
  messages: Anthropic.Beta.BetaMessageParam[]
  effort?: 'low' | 'medium' | 'high'
  maxTokens?: number
}

export type ModelText = { text: string; model: string }

function supportsFallbacks(model: string): boolean {
  return model.startsWith('claude-fable-') || model === 'claude-opus-5'
}

function client(): Anthropic {
  const { ANTHROPIC_API_KEY } = requireAnthropicEnv()
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 2 })
}

function systemParam(blocks: SystemBlock[]): Anthropic.Beta.BetaTextBlockParam[] {
  return blocks
    .filter((b) => b.text.trim().length > 0)
    .map((b) => (b.cache ? { type: 'text', text: b.text, cache_control: { type: 'ephemeral' } } : { type: 'text', text: b.text }))
}

async function create(call: ModelCall, format?: Anthropic.Beta.BetaJSONOutputFormat): Promise<Anthropic.Beta.BetaMessage> {
  try {
    return await client().beta.messages.create({
      model: call.model,
      max_tokens: call.maxTokens ?? MAX_TOKENS,
      ...(supportsFallbacks(call.model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      system: systemParam(call.system),
      messages: call.messages,
      output_config: { effort: call.effort ?? 'medium', ...(format ? { format } : {}) },
    })
  } catch (e) {
    // The API's own words reach the screen — a billing or key problem is the
    // operator's to fix and should not read as "try again".
    if (e instanceof Anthropic.APIError) {
      throw new ApiError(`The advisor could not be reached (${e.status ?? 'error'}): ${e.message.replace(/^\d+\s*\{[\s\S]*"message":"([^"]+)"[\s\S]*$/, '$1')}`, 502)
    }
    throw e
  }
}

function textOf(response: Anthropic.Beta.BetaMessage): string {
  return response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

/** A plain prose answer. */
export async function callText(call: ModelCall): Promise<ModelText> {
  const response = await create(call)
  if (response.stop_reason === 'refusal') throw new ApiError('The advisor declined to answer that.', 422)
  const text = textOf(response)
  if (!text) throw new ApiError('The advisor gave no answer. Try again.', 502)
  return { text, model: response.model }
}

/** A structured answer, validated against the zod schema the format was built from. */
export async function callJson<T extends z.ZodType>(call: ModelCall, schema: T): Promise<{ data: z.infer<T>; model: string }> {
  const response = await create(call, zodOutputFormat(schema) as unknown as Anthropic.Beta.BetaJSONOutputFormat)
  if (response.stop_reason === 'refusal') throw new ApiError('The advisor declined to answer that.', 422)
  const text = textOf(response)
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ApiError('The advisor answered in a shape the board could not read. Try again.', 502)
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw new ApiError('The advisor answered in a shape the board could not read. Try again.', 502)
  return { data: parsed.data, model: response.model }
}
