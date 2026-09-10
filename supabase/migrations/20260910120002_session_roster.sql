-- =============================================================================
-- Quorum — who sits in a session
-- =============================================================================
-- The client picks which advisors join a session (spec: "convene the board"
-- over the roster; now over a chosen subset). The chosen ids are stored on
-- the session and fixed once convened, so the record says who was in the
-- room. An empty array means "everyone who was active" — the shape of
-- sessions convened before this migration.
-- =============================================================================

alter table public.sessions
  add column advisor_ids uuid[] not null default '{}';

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

-- A contribution comes from an advisor who was in the room.
create or replace function app.session_views_check() returns trigger
  language plpgsql as $$
declare
  v_ids uuid[];
begin
  select advisor_ids into v_ids from public.sessions s where s.id = new.session_id;
  if cardinality(v_ids) > 0 and not (new.advisor_id = any (v_ids)) then
    raise exception 'That advisor is not in this session.' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger session_views_check before insert on public.session_views
  for each row execute function app.session_views_check();
