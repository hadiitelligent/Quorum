# Status

_2026-09-09 — built from the design handoff and deployed to production the same evening. 2026-09-10 — the 10X Strategic Director persona and the brief._

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
- `npm run db:test` — every migration applied to a scratch cluster, the 46
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

**2026-09-10.** Roster: Hossein (admin). **The 10X Strategic Director**:
an unofficial Grant Cardone-inspired persona built from Hadi's "10X
Strategic Director Decision Library v1" (172 principles, 16 domains, 30
sources). `npm run import:10x -- <library.json>` turns the JSON into 18
markdown documents under `seed/documents/06-10x-strategic-director/`; the
seed now uploads a persona's documents from that folder (64k characters,
under the 120k grounding cap). Its bio and instructions say plainly that it
is not Grant Cardone and does not speak for him, as the library's own
preface requires. **The brief** (Hadi's idea): the convene panel has a
"Brief the board" section with a ready-made prompt to copy into Claude
("summarize my business and where it stands"), a box to paste the answer,
remembered per browser; the brief is a column on the session, fixed once
convened (guard trigger, tested), carried at every stage in the prompts
(tested), shown on the session page and in the memo. **Who is in the room** (Hadi's
idea): the room starts empty; clicking an advisor card adds them to "In
the room" above the Convene button (a chip; click it or the card again to
remove; "add everyone" / "clear" shortcuts); the chosen ids are stored on
the session (`advisor_ids`, fixed once
convened, a trigger refuses a view from anyone not invited), the stages run
for exactly those advisors, and older sessions with an empty list mean
"everyone who was active". The board of one skips the challenge round.

Verified on production on 2026-09-10: a session convened with a brief
(Meridian, ~1,700 characters) and three chosen advisors (Marcus, Elena, the
10X Director) ran to done in 38 s (10 Opus 5 calls). The views argued from
the brief's own figures (the $40M floor, the 14 months, the indemnity
redlines); the 10X Director cited principles by id; the synthesis was
concrete and dated; the votes came back Agree, Agree, Agree with the
softened vote prompt (the first session, before the change, had been five
"conditional"s).

**2026-09-10, later.** The 10X Strategic Director was replaced by **Grant
Cardone** (the "GC" v2 build from `~/Documents/Digital Twins/Grant Cardone
Combined Persona`): 164 rules in 17 domains with fixed guardrails and an
aggression dial, the constitution and the evidence base — 21 documents,
~190k characters, so the grounding cap rose from 120k to 240k. The persona
was renamed in place (`previous_names` in the seed), so its earlier chats and
session contributions stay attached; the old 18 documents were removed by
the seed. Its instructions are the constitution's drop-in system prompt,
condensed, with the honesty line ("not him, not endorsed by him") kept.

**2026-09-10, evening — the Business page.** The brief became a *standing
brief* per person (`briefs` table, private like a chat; convening copies it
onto the session, and private chats read it too). A new **Business** page
owns it: on first sign-in (no brief yet, the board redirects there) it walks
the client through copying the prompt into their own Claude, running it,
and pasting the brief; saving it extracts an **insight** (one structured
Opus 5 call, `lib/board/insight.ts`, schema in `lib/quorum/insight.ts`) and
renders the dashboard — overview, business worth, assets held and what is
owed, cash, burn and runway, monthly overheads, revenue, targets for the
year, the pipeline with a weighted value, and what the brief does not say.
Later visits show the dashboard and an **update prompt** that carries the
current brief and asks their Claude to rewrite it with a "what changed"
section. The full-brief prompt now covers assets, liabilities, goals and
targets and the pipeline explicitly; the cap rose to 60k characters. The
board's convene panel just says how fresh the brief is and links to the
page. Verified on production: Hadi's first visit redirected to /business;
the pasted Meridian brief was read into the dashboard in 22 s (after one
fix — the insight schema was too large for the API's output grammar, so
the extraction now asks for plain JSON and validates it).

**2026-09-10, night — the board's questions.** With its independent view
each advisor may ask the client one specific question (the view call is now
structured: `{ view, question|null }`). When every view is in and any
question was asked, the session pauses at status `questions`: the convener
sees "The board has questions for you", answers what they can (or proceeds
without answering), and the answers go on the record (`session_questions`,
fixed once closed — tested) and into the challenge, synthesis and vote
prompts. Others watching see "waiting for the client". The memo carries the
questions and answers.

## Not yet verified

- **Sign-in by email.** Production sign-in was done with a minted link
  (`npm run signin -- … --prod`); a real magic-link email has not been sent
  yet. Supabase's built-in SMTP allows two an hour.

## To redeploy (docs/deployment.md)

`npm run deploy`. The database suite runs in preflight against a throwaway
cluster from Postgres.app (`/Applications/Postgres.app`, Postgres 18). `npm run deploy:secrets` again only when a
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
