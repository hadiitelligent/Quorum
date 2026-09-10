-- =============================================================================
-- Quorum — row-level security
-- =============================================================================
-- One door: people who are on the roster sign in, get a JWT, and every query
-- they make is filtered here. The API routes re-check the same rules; RLS is
-- the net, not the only check.
--
-- Every write in this app runs through the caller's own session — there is no
-- service-role write path besides the seed script. So these policies ARE the
-- permission model:
--
--   personas        everyone reads; admins add, edit and remove (soft)
--   documents       everyone on the roster reads (the persona answers from
--                   them either way); admins add and remove
--   private chats   mine, and only mine; append-only
--   sessions        the board's record: everyone reads; anyone convenes;
--                   only the convener drives the stages; contributions are
--                   insert-only and never edited or deleted
--
-- `anon` is granted NOTHING. There is no public surface on this app.
--
-- PORTABILITY: app.current_user_id() reads a plain session GUC first and only
-- then falls back to PostgREST/Supabase JWT claims, so on a bare Postgres host
-- `set app.user_id` per connection keeps every policy working.
-- =============================================================================

create or replace function app.current_user_id() returns uuid
  language plpgsql stable as $$
declare
  v_raw text;
begin
  begin
    v_raw := nullif(current_setting('app.user_id', true), '');
    if v_raw is not null then return v_raw::uuid; end if;
  exception when others then null;
  end;

  begin
    v_raw := nullif(current_setting('request.jwt.claim.sub', true), '');
    if v_raw is not null then return v_raw::uuid; end if;
  exception when others then null;
  end;

  begin
    v_raw := nullif(current_setting('request.jwt.claims', true), '');
    if v_raw is not null then
      return nullif(v_raw::jsonb ->> 'sub', '')::uuid;
    end if;
  exception when others then null;
  end;

  return null;
end;
$$;

-- SECURITY DEFINER: these read public.people from inside the policies that
-- protect public.people. Without it every policy would recurse.
create or replace function app.is_active_person() returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.people p where p.id = app.current_user_id() and p.active);
$$;

create or replace function app.is_admin() returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.people p where p.id = app.current_user_id() and p.active and p.is_admin
  );
$$;

create or replace function app.owns_session(p_session uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.sessions s where s.id = p_session and s.person_id = app.current_user_id()
  );
$$;

alter table public.people             enable row level security;
alter table public.advisors           enable row level security;
alter table public.advisor_documents  enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.sessions           enable row level security;
alter table public.session_views      enable row level security;
alter table public.session_challenges enable row level security;
alter table public.session_votes      enable row level security;

-- --- people: everyone on the roster sees it; admins change it ---------------
create policy people_select on public.people for select using (app.is_active_person());
create policy people_insert on public.people for insert with check (app.is_admin());
create policy people_update on public.people for update using (app.is_admin()) with check (app.is_admin());
create policy people_delete on public.people for delete using (app.is_admin());

-- --- advisors: read for all, write for admins, DELETE FOR NOBODY -------------
-- "Remove" is active = false. The chats and session rows that reference the
-- advisor stay readable, as the spec promises.
create policy advisors_select on public.advisors for select using (app.is_active_person());
create policy advisors_insert on public.advisors for insert with check (app.is_admin());
create policy advisors_update on public.advisors for update using (app.is_admin()) with check (app.is_admin());
create policy advisors_delete on public.advisors for delete using (false);

-- --- documents: read for all, admins add and remove --------------------------
create policy advisor_documents_select on public.advisor_documents for select using (app.is_active_person());
create policy advisor_documents_insert on public.advisor_documents for insert with check (app.is_admin());
create policy advisor_documents_delete on public.advisor_documents for delete using (app.is_admin());

-- --- private chats: mine, and only mine; append-only -------------------------
create policy chat_messages_select on public.chat_messages
  for select using (person_id = app.current_user_id() and app.is_active_person());
create policy chat_messages_insert on public.chat_messages
  for insert with check (person_id = app.current_user_id() and app.is_active_person());
-- No update, no delete: the transcript is a record.

-- --- sessions: the board's record ---------------------------------------------
create policy sessions_select on public.sessions for select using (app.is_active_person());
create policy sessions_insert on public.sessions
  for insert with check (person_id = app.current_user_id() and app.is_active_person());
-- Only the person who convened it drives it forward; the guard trigger keeps
-- the question and the synthesis fixed once written.
create policy sessions_update on public.sessions
  for update using (person_id = app.current_user_id()) with check (person_id = app.current_user_id());
create policy sessions_delete on public.sessions for delete using (false);

create policy session_views_select on public.session_views for select using (app.is_active_person());
create policy session_views_insert on public.session_views for insert with check (app.owns_session(session_id));

create policy session_challenges_select on public.session_challenges for select using (app.is_active_person());
create policy session_challenges_insert on public.session_challenges for insert with check (app.owns_session(session_id));

create policy session_votes_select on public.session_votes for select using (app.is_active_person());
create policy session_votes_insert on public.session_votes for insert with check (app.owns_session(session_id));
-- No update, no delete on any contribution.

-- =============================================================================
-- Grants — guarded by role existence so the file also runs on plain Postgres.
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema app to authenticated;
    grant execute on all functions in schema app to authenticated;

    grant select, insert, update, delete on public.people             to authenticated;
    grant select, insert, update         on public.advisors           to authenticated;
    grant select, insert, delete         on public.advisor_documents  to authenticated;
    grant select, insert                 on public.chat_messages      to authenticated;
    grant select, insert, update         on public.sessions           to authenticated;
    grant select, insert                 on public.session_views      to authenticated;
    grant select, insert                 on public.session_challenges to authenticated;
    grant select, insert                 on public.session_votes      to authenticated;

    -- Stated twice on purpose.
    revoke delete on public.advisors, public.sessions from authenticated;
    revoke update, delete on public.chat_messages, public.session_views,
                            public.session_challenges, public.session_votes from authenticated;
    revoke update on public.advisor_documents from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.people, public.advisors, public.advisor_documents, public.chat_messages,
                  public.sessions, public.session_views, public.session_challenges, public.session_votes from anon;
    revoke all on schema app from anon;
  end if;
end;
$$;
