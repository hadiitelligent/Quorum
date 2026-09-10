-- =============================================================================
-- Quorum — core schema
-- =============================================================================
-- PORTABILITY: standard PostgreSQL only, as in ITelliBuilder and EQFlow.
-- Nothing here depends on Supabase; the single touch-point
-- (people.id → auth.users) is in its own conditional migration. Must survive
-- pg_dump → restore anywhere.
--
-- One board per deployment: a client (the founder) and their admins share one
-- roster of advisor personas. The tables fall into three groups:
--
--   people              who may sign in; is_admin manages the personas
--   advisors            the personas (spec §5), soft-removed, never deleted
--   advisor_documents   the knowledge each persona is grounded in
--   chat_messages       private 1:1 conversations (spec §2), one per person
--                       and advisor, append-only
--   sessions            a convened board (spec §3), and its record:
--   session_views       stage 1 — one independent view per advisor
--   session_challenges  stage 2 — one challenge per advisor, aimed at another
--   session_votes       stage 3 — one vote per advisor on the synthesis; a vote
--                       that is not "agree" IS the recorded dissent, in the
--                       advisor's own words, verbatim, because it is the row.
-- =============================================================================

create extension if not exists pgcrypto;

create schema if not exists app;
comment on schema app is
  'Business helpers used by RLS policies and triggers. Plain PL/pgSQL and SQL only.';

-- -----------------------------------------------------------------------------
-- Fixed vocabularies. Closed lists; a change is a migration.
-- -----------------------------------------------------------------------------
create or replace function app.session_statuses() returns text[]
  language sql immutable parallel safe as $$
  select array['views','challenges','synthesis','votes','done','failed']::text[];
$$;

create or replace function app.votes() returns text[]
  language sql immutable parallel safe as $$
  select array['agree','conditional','disagree']::text[];
$$;

-- -----------------------------------------------------------------------------
-- people — who may sign in. One row per person; id matches the auth user.
--
-- Sign-in requires a row here (lib/auth.ts): an email address is necessary and
-- never sufficient. `is_admin` unlocks the Persona library (spec §5): adding,
-- editing, grounding and removing advisors. Everyone on the roster can chat
-- privately and convene the board.
-- -----------------------------------------------------------------------------
create table public.people (
  id         uuid primary key,
  email      text not null unique check (email = lower(email)),
  name       text not null check (length(btrim(name)) > 0),
  -- The line under the name in the sidebar chip: "Founder · Meridian".
  title      text not null default '',
  is_admin   boolean not null default false,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.people is 'Sign-in roster; id matches the auth provider''s user id.';

-- -----------------------------------------------------------------------------
-- advisors — the personas. Removing one sets active = false: "Its private
-- chats and past session contributions stay on the record" (spec §5).
-- -----------------------------------------------------------------------------
create table public.advisors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  -- The domain kicker on the card: "Finance & Capital".
  role        text not null check (length(btrim(role)) > 0),
  bio         text not null default '',
  temperament text not null default '',
  -- [{ "s": "Fundraising", "lv": 5 }, …] — at most three rows, lv 1–5.
  strengths   jsonb not null default '[]'::jsonb,
  -- How the persona thinks and speaks, beyond what the card shows. Optional;
  -- lib/board/prompts.ts builds the system prompt from every column.
  instructions text not null default '',
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_by  text not null default 'seed',
  updated_by  text not null default 'seed',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint advisors_strengths_shape check (
    jsonb_typeof(strengths) = 'array' and jsonb_array_length(strengths) <= 3
  )
);

create index advisors_active on public.advisors (active, sort_order, created_at);

-- -----------------------------------------------------------------------------
-- advisor_documents — the knowledge base a persona answers from. Text only in
-- this version (markdown, plain text, pasted notes); the whole content goes
-- into the persona's system prompt, cache-marked, so it is capped.
-- -----------------------------------------------------------------------------
create table public.advisor_documents (
  id          uuid primary key default gen_random_uuid(),
  advisor_id  uuid not null references public.advisors (id) on delete cascade,
  title       text not null check (length(btrim(title)) > 0),
  -- A short label for the source type, shown on the library card:
  -- "board memo", "S-1", "pipeline review". Free text.
  category    text not null default '',
  content     text not null check (length(content) <= 200000),
  uploaded_by text not null default 'seed',
  created_at  timestamptz not null default now(),
  unique (advisor_id, title)
);

create index advisor_documents_advisor on public.advisor_documents (advisor_id, created_at);

-- -----------------------------------------------------------------------------
-- chat_messages — private 1:1. One conversation per (person, advisor).
-- Append-only: what was asked and what was answered is a record.
-- -----------------------------------------------------------------------------
create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people (id) on delete cascade,
  advisor_id  uuid not null references public.advisors (id) on delete cascade,
  role        text not null check (role in ('user','advisor')),
  content     text not null check (length(content) <= 40000),
  model       text,
  created_at  timestamptz not null default now()
);

create index chat_messages_thread on public.chat_messages (person_id, advisor_id, created_at);

-- -----------------------------------------------------------------------------
-- sessions — a convened board. The question, the stage it has reached, and
-- the synthesis once written. The record itself is in the three tables below.
-- -----------------------------------------------------------------------------
create table public.sessions (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid not null references public.people (id) on delete cascade,
  question       text not null check (length(btrim(question)) > 0 and length(question) <= 4000),
  status         text not null default 'views' check (status = any (app.session_statuses())),
  -- The board's recommendation. Written once; see app.sessions_guard.
  recommendation text not null default '',
  synthesis_model text,
  -- Where a failed run stopped, in words.
  error          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create index sessions_recent on public.sessions (created_at desc);

-- Each contribution snapshots the advisor's name and role: the persona may be
-- edited or removed later, and the record must still read as it was.
create table public.session_views (
  session_id   uuid not null references public.sessions (id) on delete cascade,
  advisor_id   uuid not null references public.advisors (id),
  advisor_name text not null,
  advisor_role text not null,
  view         text not null check (length(btrim(view)) > 0),
  model        text,
  created_at   timestamptz not null default now(),
  primary key (session_id, advisor_id)
);

create table public.session_challenges (
  session_id      uuid not null references public.sessions (id) on delete cascade,
  from_advisor_id uuid not null references public.advisors (id),
  to_advisor_id   uuid not null references public.advisors (id),
  from_name       text not null,
  to_name         text not null,
  challenge       text not null check (length(btrim(challenge)) > 0),
  model           text,
  created_at      timestamptz not null default now(),
  primary key (session_id, from_advisor_id),
  check (from_advisor_id <> to_advisor_id)
);

create table public.session_votes (
  session_id   uuid not null references public.sessions (id) on delete cascade,
  advisor_id   uuid not null references public.advisors (id),
  advisor_name text not null,
  vote         text not null check (vote = any (app.votes())),
  -- The advisor's own words. When vote <> 'agree' this IS the dissent the
  -- synthesis card shows, unedited.
  statement    text not null check (length(btrim(statement)) > 0),
  model        text,
  created_at   timestamptz not null default now(),
  primary key (session_id, advisor_id)
);

-- =============================================================================
-- Rules that live in the database, not just the code.
-- Each is also implemented in TypeScript; this is the version that cannot be
-- forgotten by a future caller.
-- =============================================================================

-- 1. updated_at is the database's clock, not the caller's.
create or replace function app.touch_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger advisors_touch before update on public.advisors
  for each row execute function app.touch_updated_at();

create trigger sessions_touch before update on public.sessions
  for each row execute function app.touch_updated_at();

-- 2. A session's recommendation is written once. The question never changes.
--    The status only moves forward (views → challenges → synthesis → votes →
--    done; failed is reachable from anywhere but done).
create or replace function app.sessions_guard() returns trigger
  language plpgsql as $$
declare
  v_order text[] := app.session_statuses();
  v_old int := array_position(v_order, old.status);
  v_new int := array_position(v_order, new.status);
begin
  if new.question <> old.question then
    raise exception 'The question of a convened session cannot be changed.' using errcode = '42501';
  end if;
  if old.recommendation <> '' and new.recommendation <> old.recommendation then
    raise exception 'The board''s synthesis is on the record and cannot be rewritten.' using errcode = '42501';
  end if;
  if old.status = 'done' and new.status <> 'done' then
    raise exception 'A completed session cannot be reopened.' using errcode = '42501';
  end if;
  if new.status <> 'failed' and v_new < v_old then
    raise exception 'A session only moves forward (% → % refused).', old.status, new.status using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger sessions_guard before update on public.sessions
  for each row execute function app.sessions_guard();

-- 3. A strengths row is { s: text, lv: 1..5 } and nothing else.
create or replace function app.advisors_check_strengths() returns trigger
  language plpgsql as $$
declare
  v_row jsonb;
begin
  for v_row in select * from jsonb_array_elements(new.strengths) loop
    if jsonb_typeof(v_row) <> 'object'
       or jsonb_typeof(v_row -> 's') <> 'string'
       or length(btrim(v_row ->> 's')) = 0
       or jsonb_typeof(v_row -> 'lv') <> 'number'
       or (v_row ->> 'lv')::numeric not between 1 and 5
       or (v_row ->> 'lv')::numeric <> floor((v_row ->> 'lv')::numeric) then
      raise exception 'Each strength must be { "s": "<subject>", "lv": 1–5 }.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

create trigger advisors_check_strengths before insert or update of strengths on public.advisors
  for each row execute function app.advisors_check_strengths();

-- 4. A contribution belongs to an advisor who was on the board when it was
--    made, and a challenge is aimed at an advisor who gave a view in the same
--    session.
create or replace function app.session_challenges_check() returns trigger
  language plpgsql as $$
begin
  if not exists (select 1 from public.session_views v where v.session_id = new.session_id and v.advisor_id = new.from_advisor_id) then
    raise exception 'An advisor challenges only after giving a view.' using errcode = '23503';
  end if;
  if not exists (select 1 from public.session_views v where v.session_id = new.session_id and v.advisor_id = new.to_advisor_id) then
    raise exception 'A challenge must be aimed at an advisor who gave a view in this session.' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger session_challenges_check before insert on public.session_challenges
  for each row execute function app.session_challenges_check();

create or replace function app.session_votes_check() returns trigger
  language plpgsql as $$
begin
  if not exists (select 1 from public.session_views v where v.session_id = new.session_id and v.advisor_id = new.advisor_id) then
    raise exception 'An advisor votes only after giving a view.' using errcode = '23503';
  end if;
  if (select recommendation from public.sessions s where s.id = new.session_id) = '' then
    raise exception 'Votes are cast on a written synthesis.' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger session_votes_check before insert on public.session_votes
  for each row execute function app.session_votes_check();
