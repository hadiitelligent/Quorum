# CLAUDE.md — Quorum (AI board of advisors)

## What this project is

A client keeps a roster of AI advisor personas, chats with any of them
privately, or convenes the board: independent views → a challenge round → a
synthesis with alignment votes and recorded dissent. Admins manage the
personas. **`docs/spec.md` is the design handoff and the source of truth for
the UI** — colours, spacing, copy, timings; `reference/Quorum.dc.html` is the
prototype it describes. When in doubt about how a screen looks or behaves,
read those two.

## Stack

Deliberately the same as ITelliBuilder, EQFlow and the Maxest task board:

- **Next.js 16 (App Router) + TypeScript**, deployed on **Cloudflare Workers**
  via `@opennextjs/cloudflare`
- **Supabase** — Postgres, Auth (magic link; Google OAuth is a dashboard
  change), no Storage
- **Anthropic API** — `claude-opus-5` for every advisor and for the synthesis
  (`ADVISOR_MODEL`, `SYNTHESIS_MODEL` override)
- No cron, no worker.ts: `wrangler.jsonc` points straight at the generated
  OpenNext worker. Copy ITelliBuilder's `worker.ts` if a scheduled job ever
  arrives.

### Portability rules (non-negotiable)

1. **Standard Postgres only.** The single Supabase touch-point is the FK from
   `people.id` to `auth.users`, in its own conditional migration.
2. **No framework-hostage logic.** `lib/quorum/` (text helpers, the session
   state machine, the memo) and `lib/board/prompts.ts` (every word the model
   is told) are plain TS modules with unit tests and no React, Next or
   database import.

## Where the logic lives

- `lib/quorum/session.ts` — the state machine: `nextSteps` (what the client
  still has to run), `statusFor` (what the rows mean), `stageOf` (the
  tracker), `outcomeOf` (the Sessions table tag), `dissentOf`, `mergeSession`
  (parallel stage results, unioned). **Every rule has a test.**
- `lib/quorum/text.ts` — initials, first names, the count word, the
  "Grounded in" line, the date labels. Tested.
- `lib/quorum/memo.ts` — "Export memo": the session as Markdown. Tested.
- `lib/board/prompts.ts` — the persona prompt, the knowledge-base block, and
  the four stage prompts. Tested. Change wording here, nowhere else.
- `lib/board/model.ts` — the one place that calls the Claude API: cache-marked
  system blocks, `callText` / `callJson` (structured output validated by zod),
  server-side refusal fallback on the Opus 5 / Fable family.
- `lib/board/convene.ts` — the stages, one function each, all idempotent;
  `lib/board/chat.ts` — a private 1:1 turn.
- `lib/advisors.ts`, `lib/documents.ts`, `lib/chats.ts`, `lib/sessions.ts` —
  the seam between Postgres rows (snake_case) and the screens' shapes
  (`lib/quorum/types.ts`). Nothing above them knows there is a database.
- `components/` — the React port of the prototype, one folder per screen.
  Every screen fetches through `lib/client-api.ts`, which is why the
  dev-only `/demo` can run the real screens over `components/demo/` (a
  `window.fetch` patch serving the prototype's scripted data).

## The data model

`supabase/migrations/` is the source of truth; `lib/database.types.ts`
mirrors it by hand. `people` (the sign-in roster; `is_admin` unlocks the
library), `advisors` (soft-removed, never deleted; seeded from
`seed/advisors/*.json`, with grounding documents from
`seed/documents/<same basename>/` and its `_documents.json` manifest; a
`previous_names` list renames a persona in place, and seed-uploaded documents
no longer in the manifest are removed), `advisor_documents` (text
only; the whole knowledge base goes into the persona's cached system block,
capped at `GROUNDING_CHAR_CAP`), `chat_messages` (one private conversation
per person and advisor), `sessions` + `session_views` + `session_challenges`
+ `session_votes` (the record; every contribution snapshots the advisor's
name and role so an edited or removed persona reads as it was). A session
also carries the **brief** — the client's summary of the business, pasted
at convene time (the convene panel offers the prompt to get it from Claude:
`briefPrompt` in `lib/quorum/session.ts`) — fixed once convened and put
before the question in every stage prompt (`briefBlock`). And **who is in
the room**: `advisor_ids`, chosen by clicking advisor cards on the board
(the room starts empty), fixed once convened;
`rosterFor` (pure) resolves it to the invited advisors still on the board,
empty meaning everyone (sessions from before the picker).

## Rules that live in the database, not just the code

`npm run db:test` asserts all of these against a throwaway cluster, as an
unprivileged role (`supabase/tests/permissions.test.sql`).

1. **Only an admin changes a persona; nobody deletes one.** Remove is
   `active = false`.
2. **A private chat is one person's** (RLS by `person_id`) and append-only.
3. **Anyone convenes; only the convener drives the session** (RLS on
   `sessions` update and on every contribution insert, through
   `app.owns_session`).
4. **Contributions are insert-only** — no update, no delete on views,
   challenges or votes. The vote's `statement` IS the recorded dissent.
5. **`app.sessions_guard`**: the question, the brief and the roster never
   change, the synthesis is written once, the status only moves forward,
   done is final. `session_views_check`: a view comes from an invited advisor.
6. **A vote needs a view and a written synthesis first; a challenge is
   aimed at an advisor who gave a view** (`session_votes_check`,
   `session_challenges_check`).
7. **Strengths are `{ s, lv 1–5 }`, at most three** (`advisors_check_strengths`).
8. `updated_at` is the database's clock.

## The brief and the insight

Each person keeps ONE standing brief (`briefs`, RLS by person): the
comprehensive summary of their business that their own Claude writes from
`briefPrompt` (first time) or `updatePrompt` (later; carries the current
brief, asks for a "what changed" section). Saving it runs `extractInsight`
(`lib/board/insight.ts`, structured output against `InsightSchema` in
`lib/quorum/insight.ts`; everything the brief does not say is null and
listed under `unknowns` — the extraction never invents a figure). The
Business page (`components/business/`) renders the insight. Convening
copies the brief onto the session; `lib/board/chat.ts` puts it in the
private chats as its own cache-marked block. The board redirects to
`/business` until a brief exists.

## The convene orchestration

The browser drives it (`components/session/session.tsx`): read the record,
ask `nextSteps` what is missing, fire every step that can run in parallel,
merge each result as it lands, repeat. Every stage route is idempotent — an
existing row is returned, never regenerated — and the primary keys refuse a
duplicate if two tabs race. A model failure marks the session `failed` with
"Stopped at <stage>: <reason>" and the screen offers "Convene again".

Cost per convene: 3N + 1 model calls for N advisors (views, challenges,
votes, one synthesis). The persona's system prompt is two cache-marked
blocks (persona, knowledge base) shared across every stage and every
private chat, so a session mostly pays for the question and the views.

Structured stages (challenge target, vote) use `output_config.format` with a
zod schema and re-validate the text; the SDK's helper type is cast to the
beta `BetaJSONOutputFormat` (`lib/board/model.ts`) — the only cast in the
model layer. **Trap already paid for:** a schema the size of `InsightSchema`
is refused by the API ("The compiled grammar is too large"), so the insight
extraction uses `callJsonLoose` — JSON asked for in the prompt with an
example of the shape, fences stripped, zod validating — the same fallback
ITelliBuilder's interpreter needed.

## Conventions

TypeScript strict; zod on every API input and on the model's structured
output; all mutations through route handlers that re-check the caller
(`apiContext`, `assertAdmin`); migrations in SQL, checked in; every string
the client reads on a screen comes from `docs/spec.md`'s copy.

Route paths with brackets (`app/api/advisors/[id]`) must be quoted in zsh.

## Grant Cardone (the GC persona)

An unofficial AI board member modeled on Grant Cardone's public record,
2016–2026 — the persona's bio and instructions say it is not him and not
endorsed by him; keep that line in any edit. Built from Hadi's "GC — Virtual
Board Member v2" folder: a 164-rule library (17 domains, SAYS/DOES/BOTH/GOV
basis tags, A/B/C evidence, 21 fixed guardrails, an aggression dial), a
constitution (system prompt, mental model, scorecard, playbooks, voice,
guardrails, scenarios) and an evidence base. `scripts/import-gc-persona.ts`
turns the folder into 21 documents under `seed/documents/06-grant-cardone/`
(~190k characters; `GROUNDING_CHAR_CAP` is 240k for it). The persona's
`instructions` are the constitution's drop-in system prompt, condensed.

## Deliberately left out

PDF and image documents (text and markdown only — ITelliBuilder's
`lib/assistant/transcribe.ts` is the shape to copy when asked); per-advisor
model choice; multi-tenant boards (one board per deployment); streaming
replies. Do not add features not in the spec without asking.

See `docs/deployment.md` to ship it and `docs/status.md` for what is built,
verified and left.
