-- =============================================================================
-- Quorum — the brief
-- =============================================================================
-- A session carries the client's brief: a summary of the business and its
-- current situation, written (typically) by asking Claude and pasting the
-- answer into the convene panel, so every advisor works from the same
-- context at every stage. Part of the record, fixed once convened.
-- =============================================================================

alter table public.sessions
  add column brief text not null default '' check (length(brief) <= 24000);

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
