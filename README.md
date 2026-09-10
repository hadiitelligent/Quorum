# Quorum

An **AI board of advisors**. A client keeps a roster of advisor personas,
chats with any of them privately, or **convenes the board**: every advisor
forms an independent view on the question, they challenge each other, and
the board delivers a synthesis with alignment votes and dissent recorded in
the dissenter's own words. Admins manage the personas — add, edit, rate
their expertise, ground them in documents, remove.

- **`docs/spec.md`** — the design handoff: every screen, token and
  interaction. Source of truth for the UI.
- **`CLAUDE.md`** — how the code is organised and the rules it keeps.
- **`docs/deployment.md`** — how to ship it.
- **`docs/status.md`** — what is built, verified, and left.
- `reference/` — the design prototype (`Quorum.dc.html`) and the Nocturne
  stylesheet this app's `app/globals.css` was ported from.
- `seed/advisors/` — the personas, one JSON each; `seed/documents/` their
  grounding documents.

```bash
npm install
npm run test:unit                    # the text helpers, the session state machine, the memo, the prompts
npm run dev                          # http://localhost:3000 (needs .env.local)
npm run dev && open http://localhost:3000/demo   # the screens over scripted data, no database, no model
npm run seed -- --advisors           # the roster (scripts/roster.ts) + the personas and their grounding documents
npm run import:10x -- lib.json       # the 10X decision library → seed/documents/06-10x-strategic-director/
npm run deploy                       # preflight (types, lint, unit tests, database suite) → build → Cloudflare → smoke test
```

## Stack

The same as ITelliBuilder, EQFlow and the Maxest task board, so one person
can hold all of them: **Next.js 16** (App Router, TypeScript) deployed on
**Cloudflare Workers** via `@opennextjs/cloudflare`; **Supabase** for
Postgres and magic-link sign-in; the **Anthropic API** (Claude Opus 5 by
default) for every advisor.

## How a session runs

```
POST /api/sessions                      the question, on the record
POST …/views/:advisor       × N         stage 1 — parallel; nobody sees the others'
POST …/challenges/:advisor  × N         stage 2 — parallel; each picks one to challenge
POST …/synthesis                        stage 3 — the secretary writes the recommendation
POST …/votes/:advisor       × N         agree / conditional / disagree, with a statement
POST …/complete                         done
```

The browser drives the stages in that order (`lib/quorum/session.ts`), so
each is a bounded request on the Worker, every contribution is a row the
moment it lands, and a reload resumes where it stopped. A vote that is not
"agree" **is** the recorded dissent — the synthesis card shows the row,
verbatim, and the database refuses to edit it.
