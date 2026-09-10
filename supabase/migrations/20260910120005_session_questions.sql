-- =============================================================================
-- Quorum — the board's questions
-- =============================================================================
-- With its independent view, an advisor may ask the client ONE question whose
-- answer would change the view. When every view is in and any question was
-- asked, the session pauses (status 'questions') until the convener answers
-- or proceeds without answering; the answers are on the record and every
-- later stage reads them.
-- =============================================================================

create or replace function app.session_statuses() returns text[]
  language sql immutable parallel safe as $$
  select array['views','questions','challenges','synthesis','votes','done','failed']::text[];
$$;

create table public.session_questions (
  session_id   uuid not null references public.sessions (id) on delete cascade,
  advisor_id   uuid not null references public.advisors (id),
  advisor_name text not null,
  question     text not null check (length(btrim(question)) > 0),
  answer       text not null default '' check (length(answer) <= 8000),
  answered_at  timestamptz,
  created_at   timestamptz not null default now(),
  primary key (session_id, advisor_id)
);

-- The moment the convener closed the questions (answered, or proceeded).
alter table public.sessions add column questions_closed_at timestamptz;

alter table public.session_questions enable row level security;
create policy session_questions_select on public.session_questions for select using (app.is_active_person());
create policy session_questions_insert on public.session_questions for insert with check (app.owns_session(session_id));
-- The answer is the one thing on the record the client writes; until the
-- questions are closed it may be edited, after that it is fixed.
create policy session_questions_update on public.session_questions
  for update using (app.owns_session(session_id)) with check (app.owns_session(session_id));

create or replace function app.session_questions_guard() returns trigger
  language plpgsql as $$
begin
  if new.question <> old.question or new.advisor_id <> old.advisor_id or new.session_id <> old.session_id then
    raise exception 'A question on the record cannot be changed.' using errcode = '42501';
  end if;
  if (select questions_closed_at from public.sessions s where s.id = old.session_id) is not null and new.answer <> old.answer then
    raise exception 'The questions of this session are closed; the answers are on the record.' using errcode = '42501';
  end if;
  if new.answer <> old.answer then
    new.answered_at := case when btrim(new.answer) = '' then null else now() end;
  end if;
  return new;
end;
$$;

create trigger session_questions_guard before update on public.session_questions
  for each row execute function app.session_questions_guard();

-- Questions close once.
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
  if new.brief <> old.brief then
    raise exception 'The brief of a convened session cannot be changed.' using errcode = '42501';
  end if;
  if new.advisor_ids <> old.advisor_ids then
    raise exception 'The roster of a convened session cannot be changed.' using errcode = '42501';
  end if;
  if old.questions_closed_at is not null and new.questions_closed_at is distinct from old.questions_closed_at then
    raise exception 'The questions of this session are closed.' using errcode = '42501';
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

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update on public.session_questions to authenticated;
    revoke delete on public.session_questions from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.session_questions from anon;
  end if;
end;
$$;
