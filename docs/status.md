# Status

_2026-09-09 — built from the design handoff and deployed to production the same evening._

## Live

**https://quorum.itelligents.workers.dev**

Cloudflare Workers, in the `hadi@itelligents.ca` account, against the
Supabase project `Quorum` (ref `qrgmuibsvymoqjhuvibi`, ca-central-1).
Migrations were first applied through the Management API, which does not
record them in the CLI's migration history; the first `npm run db:push`
therefore failed with "relation people already exists" and the history was
repaired with `supabase migration repair --status applied` (2026-09-09).
`SUPABASE_DB_URL` is now set and `npm run db:push --dry-run` reports the
remote up to date. Roster (two admin sign-ins)
and the five personas seeded; auth config pushed (production site URL,
three-hour token-hash links, signups off); secrets pushed; smoke test passed.

Verified on production on 2026-09-09 with a minted sign-in link: signed in
as Hadi; one private chat turn with Marcus Chen answered in ~9 s in persona;
one full convene on the Series B question ran views → challenges →
synthesis → votes → done in 46 s (16 Opus 5 calls), with the record on the
Sessions page and no console errors.

Observed: every advisor voted "conditional" on that first session — each
found a condition to add. The vote prompt was softened afterwards so that
"agree" is the default when an advisor can stand behind the synthesis
(`lib/board/prompts.ts` votePrompt); that wording is deployed but has not
yet been exercised by a second convene.

## Built and verified on this machine

The app is complete against `docs/spec.md`: the shell, the Board, private
Chat, the Board session (real three-stage orchestration on Claude), Sessions,
and the admin Persona library with the New / Edit / Remove dialogs and
text-document grounding. Pipeline and deployment are ITelliBuilder's,
adapted: `preflight` → `deploy` → `smoke-live`, `deploy:secrets`, `db:push`,
`db:test`, `seed`, `signin`.

Verified:

- `npm run typecheck`, `npm run lint` — clean.
- `npm run db:test` — every migration applied to a scratch cluster, the 45
  permission assertions pass as the unprivileged role.
- `npm run test:unit` — 22 tests (text helpers, session state machine,
  merge, memo, prompts) pass.
- `npm run seed -- --advisors --dry-run` — the five personas validate.
- `npx opennextjs-cloudflare build` — the Worker bundles at 2.2 MB gzipped
  (limit 3 MB).
- The scripted demo at `/demo` (no database, no model) was driven end to end
  in headless Chrome with Playwright: convene → five views → five challenges
  → synthesis → five votes → done, dissent shown verbatim, memo download
  named from the question; private chat with typing indicator and replies;
  New persona (button disabled until name + domain), Edit persona with a
  document added (the card's "Grounded in" line updated), Remove; a board of
  one skips the challenge round. No console errors.

## Not yet verified

- **Sign-in by email.** Production sign-in was done with a minted link
  (`npm run signin -- … --prod`); a real magic-link email has not been sent
  yet. Supabase's built-in SMTP allows two an hour.

## To redeploy (docs/deployment.md)

`npm run deploy`. The database suite runs in preflight against a throwaway
cluster from Postgres.app (`/Applications/Postgres.app`, Postgres 18) — 45
assertions passed on 2026-09-09. `npm run deploy:secrets` again only when a
value in `.env.local` changes.

## Decisions worth knowing

- The browser drives the stages (one request per model call) rather than
  one long request, so the Worker never waits on more than one call and a
  reload resumes. `lib/quorum/session.ts` is the whole state machine.
- Dissent is structural: a vote row that is not "agree" is the dissent, in
  the advisor's own words; the synthesis card renders the row and the
  database refuses to edit it.
- Personas are soft-removed; every session contribution snapshots the name
  and role.
- Documents are text only. PDF/image transcription is a copy of
  ITelliBuilder's `lib/assistant/transcribe.ts` away, when asked.
