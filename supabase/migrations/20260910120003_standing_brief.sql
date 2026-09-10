-- =============================================================================
-- Quorum — the standing brief
-- =============================================================================
-- Each person keeps ONE standing brief: the comprehensive summary of their
-- business (where it stands, assets, goals and targets, the deal pipeline)
-- that their own Claude writes for them and they paste in. Convening copies
-- it onto the session, where it is fixed; here it is theirs to keep current.
-- Private to the person, like a chat.
-- =============================================================================

create table public.briefs (
  person_id  uuid primary key references public.people (id) on delete cascade,
  content    text not null default '' check (length(content) <= 60000),
  updated_at timestamptz not null default now()
);

create trigger briefs_touch before update on public.briefs
  for each row execute function app.touch_updated_at();

alter table public.briefs enable row level security;

create policy briefs_select on public.briefs
  for select using (person_id = app.current_user_id() and app.is_active_person());
create policy briefs_insert on public.briefs
  for insert with check (person_id = app.current_user_id() and app.is_active_person());
create policy briefs_update on public.briefs
  for update using (person_id = app.current_user_id()) with check (person_id = app.current_user_id());
create policy briefs_delete on public.briefs
  for delete using (person_id = app.current_user_id());

-- A comprehensive brief is longer than the first cap allowed.
alter table public.sessions drop constraint if exists sessions_brief_check;
alter table public.sessions add constraint sessions_brief_check check (length(brief) <= 60000);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.briefs to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.briefs from anon;
  end if;
end;
$$;
