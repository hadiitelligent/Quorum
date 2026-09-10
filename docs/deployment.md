# Deploying Quorum

**Cloudflare Workers**, via `@opennextjs/cloudflare` — the same setup as
ITelliBuilder, EQFlow and the Maxest task board, so one Cloudflare account and
one mental model covers all of them. `wrangler.jsonc` and
`open-next.config.ts` are in the repo. There is no cron and no `worker.ts`:
the generated OpenNext worker is the entry point.

## Before the first deploy

### 1. A Supabase project

Create one in the `hadi@itelligents.ca` organisation (Pro since 2026-09-07;
each project bills its own compute, about $10/month on the smallest
instance beyond the included credit). Region **Canada (Central)**, as the
others.

From **Project Settings → API** and **→ Database** fill in `.env.local`
(copy `.env.example`; a partly filled one is already on Hadi's machine with
the Anthropic key).

```bash
npm install
npm run db:push                 # applies supabase/migrations/* over SUPABASE_DB_URL
npm run seed -- --advisors      # the roster (scripts/roster.ts) + the five personas in seed/advisors
```

If a migration was ever applied by hand (SQL editor, Management API), the
CLI does not know and `db:push` will try to run it again ("relation …
already exists"). Record it instead:

```bash
npx supabase migration repair --status applied 20260909120001 --db-url "$SUPABASE_DB_URL"
```

Push the auth settings: `npx supabase link` then `npx supabase config push`
(`supabase/config.toml` turns signups off, sets three-hour links, the
8-digit code, and the token-hash email template that works in any browser).

### 2. Sign-in

Magic link works today. Add the deployed origin under **Authentication → URL
Configuration** (config push does this from `config.toml`):

```
https://<your-deployment>/auth/confirm
https://<your-deployment>/auth/callback
```

For Google sign-in, add the provider under **Authentication → Providers →
Google**; nothing in the code changes. Either way, **only an active row in
`people` can sign in** — an account is necessary, never sufficient. Add
people in `scripts/roster.ts` and re-run `npm run seed`; `admin: true`
unlocks the Persona library.

`npm run signin -- you@example.com` mints a sign-in link without sending
email (Supabase's built-in SMTP allows two an hour).

### 3. The advisors

`ANTHROPIC_API_KEY` — the advisors, the synthesis and the private chats all
run on it (`claude-opus-5` by default; `ADVISOR_MODEL` and `SYNTHESIS_MODEL`
override). Without it the board loads, the personas can be managed, and
"Convene board" and the chat answer with "not configured"; `/api/health`
says so too.

## Deploying

```bash
npx wrangler login          # once, interactive (already done on this machine)
npm run deploy:secrets      # pushes the server-side values from .env.local
npm run deploy              # preflight, then build and ship, then smoke test
```

`deploy` is gated: `predeploy` runs `scripts/preflight.sh` — types, lint, unit
tests, and the database suite — and nothing is built or uploaded if any fail.
The database suite applies every migration to a throwaway cluster and
asserts, as an unprivileged role, that only admins change personas, that a
private chat is one person's, that only the convener drives a session, that
contributions cannot be edited, that the synthesis is written once, and that
`anon` reads nothing. It needs a local PostgreSQL (`brew install
postgresql@17`); on a machine without one, `SKIP_DB_TEST=1 npm run deploy`
skips only that suite and says so.

Afterwards `postdeploy` runs `scripts/smoke-live.sh` against `APP_URL`:
health, the anonymous refusals on the advisors and sessions routes, that
`/demo` is a 404 in production, and the sign-in redirect.

**Build variables.** `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are inlined at BUILD time. A manual deploy
reads them from `.env.local`; Workers Builds needs them as build variables in
the dashboard, and `APP_URL` as both a build variable and a secret.

Rollback: `npx wrangler rollback`. Migrations do not roll back automatically.

## Custom domain

Workers custom domains need the zone on Cloudflare. Until then `*.workers.dev`
works (the hostname is per account: `quorum.<account>.workers.dev`); only
`APP_URL`, `supabase/config.toml` and the Supabase redirect URLs change
later. Add a `routes` entry to `wrangler.jsonc` when the zone is ready (see
EQFlow's `wrangler.jsonc` for the shape and the DNS-cutover warning).

## Limits and costs to watch

| limit | note |
|---|---|
| Worker size, 3 MB gzipped | re-measure with `npx wrangler deploy --dry-run` |
| Worker request time | each stage is one model call (10–60 s); the browser drives them, so nothing runs longer than one call |
| Supabase egress | small: a session is a handful of rows |

The cost line is the model: a convene is 3N + 1 calls for N advisors (views,
challenges, votes, one synthesis), each with the persona's cache-marked
system prompt. Five advisors on Opus 5 with a short knowledge base is on the
order of a few dollars a session; grounding documents scale the cached
prefix, not the per-call spend.
