-- =============================================================================
-- Quorum — the rules, asserted against a real database
-- =============================================================================
--   npm run db:test                     (against a scratch cluster)
--
-- Runs as the unprivileged `authenticated` role: a superuser silently bypasses
-- RLS and would make all of this pass for the wrong reason.
--
-- What is being protected:
--   1. Only an admin changes the personas; nobody deletes one.
--   2. A private chat is visible to exactly one person and cannot be edited.
--   3. Anyone convenes; only the convener drives the session; contributions
--      are insert-only; the synthesis is written once; the status only moves
--      forward.
--   4. A vote (the dissent) needs a view and a written synthesis first.
--   5. `anon` cannot read a single row.
-- =============================================================================

\set ON_ERROR_STOP on
set client_min_messages to notice;
\o /dev/null

-- --- harness -----------------------------------------------------------------
create schema if not exists t;

create or replace function t.check_eq(actual anyelement, expected anyelement, label text)
  returns void language plpgsql as $fn$
begin
  if actual is distinct from expected then
    raise exception 'FAIL  %  (expected %, got %)', label, expected, actual;
  end if;
  raise notice 'ok    %', label;
end;
$fn$;

create or replace function t.check_denied(stmt text, label text, expect_message text default null)
  returns void language plpgsql as $fn$
declare
  v_message text;
begin
  begin
    execute stmt;
  exception when others then
    v_message := sqlerrm;
    if expect_message is not null and position(expect_message in v_message) = 0 then
      raise exception 'FAIL  %  (wrong message: %)', label, v_message;
    end if;
    raise notice 'ok    %', label;
    return;
  end;
  raise exception 'FAIL  %  (the statement was allowed)', label;
end;
$fn$;

create or replace function t.check_rowcount(query text, expected bigint, label text)
  returns void language plpgsql as $fn$
declare
  v_count bigint;
begin
  execute format('select count(*) from (%s) s', query) into v_count;
  perform t.check_eq(v_count, expected, label);
end;
$fn$;

/** Executes a write and asserts how many rows it touched; RLS makes an unauthorised UPDATE touch none. */
create or replace function t.check_affected(stmt text, expected bigint, label text)
  returns void language plpgsql as $fn$
declare
  v_count bigint;
begin
  execute stmt;
  get diagnostics v_count = row_count;
  perform t.check_eq(v_count, expected, label);
end;
$fn$;

create or replace function t.become(p_user uuid) returns void language plpgsql as $fn$
begin
  perform set_config('app.user_id', coalesce(p_user::text, ''), false);
end;
$fn$;

grant usage on schema t to authenticated;
grant execute on all functions in schema t to authenticated;
grant usage on schema t to anon;
grant execute on all functions in schema t to anon;

-- --- fixtures (as superuser) -------------------------------------------------
insert into public.people (id, email, name, title, is_admin) values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.com',   'Admin',   'Chief of staff',      true),
  ('00000000-0000-0000-0000-000000000002', 'founder@example.com', 'Founder', 'Founder · Meridian',  false),
  ('00000000-0000-0000-0000-000000000003', 'other@example.com',   'Other',   'Co-founder',          false),
  ('00000000-0000-0000-0000-000000000004', 'gone@example.com',    'Gone',    '',                    false);
update public.people set active = false where email = 'gone@example.com';

insert into public.advisors (id, name, role, bio, strengths) values
  ('a0000000-0000-0000-0000-000000000001', 'Marcus Chen',  'Finance & Capital', 'Ex-CFO.', '[{"s":"Fundraising","lv":5}]'),
  ('a0000000-0000-0000-0000-000000000002', 'Elena Vasquez','Go-to-Market',      'Former CRO.', '[{"s":"Enterprise sales","lv":5}]'),
  ('a0000000-0000-0000-0000-000000000003', 'Not Invited',  'Nobody asked',      '', '[]');

insert into public.advisor_documents (advisor_id, title, category, content, uploaded_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Board memo Q2', 'board memo', 'Runway is 14 months.', 'seed');

insert into public.chat_messages (person_id, advisor_id, role, content) values
  ('00000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'user', 'Should we raise?'),
  ('00000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'user', 'Private question.');

insert into public.sessions (id, person_id, question, brief, advisor_ids) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Series B now or in 12 months?', 'Runway 14 months, 2.1x NRR.',
   '{a0000000-0000-0000-0000-000000000001,a0000000-0000-0000-0000-000000000002}');

-- =============================================================================
-- As `authenticated`
-- =============================================================================
set role authenticated;

-- --- 1. personas: everyone reads, admins write, nobody deletes ---------------
select t.become('00000000-0000-0000-0000-000000000002');
select t.check_rowcount('select * from public.advisors', 3, 'a founder sees every advisor');
select t.check_rowcount('select * from public.advisor_documents', 1, 'a founder sees the grounding documents');
select t.check_affected(
  $q$ update public.advisors set bio = 'changed' where id = 'a0000000-0000-0000-0000-000000000001' $q$,
  0, 'a founder''s edit to a persona touches no row');
select t.check_denied(
  $q$ insert into public.advisors (name, role) values ('Intruder', 'X') $q$,
  'a founder cannot add a persona');
select t.check_denied(
  $q$ insert into public.advisor_documents (advisor_id, title, content) values ('a0000000-0000-0000-0000-000000000001', 'x', 'x') $q$,
  'a founder cannot ground a persona');

select t.become('00000000-0000-0000-0000-000000000001');
update public.advisors set bio = 'Ex-CFO through two IPOs.', updated_by = 'admin' where id = 'a0000000-0000-0000-0000-000000000001';
select t.check_eq((select bio from public.advisors where id = 'a0000000-0000-0000-0000-000000000001'), 'Ex-CFO through two IPOs.', 'an admin can edit a persona');
insert into public.advisors (name, role, bio, strengths, created_by, updated_by) values ('Priya Nair', 'Security & Infrastructure', '', '[{"s":"Security","lv":3}]', 'admin', 'admin');
select t.check_rowcount('select * from public.advisors', 4, 'an admin can add a persona');
select t.check_denied(
  $q$ delete from public.advisors where id = 'a0000000-0000-0000-0000-000000000002' $q$,
  'an admin cannot delete a persona');
update public.advisors set active = false, updated_by = 'admin' where id = 'a0000000-0000-0000-0000-000000000002';
select t.check_eq((select active from public.advisors where id = 'a0000000-0000-0000-0000-000000000002'), false, 'an admin removes a persona by deactivating it');
update public.advisors set active = true, updated_by = 'admin' where id = 'a0000000-0000-0000-0000-000000000002';
select t.check_denied(
  $q$ update public.advisors set strengths = '[{"s":"Fundraising","lv":9}]' where id = 'a0000000-0000-0000-0000-000000000001' $q$,
  'a strength rating outside 1–5 is refused', 'strength');
select t.check_denied(
  $q$ update public.advisors set strengths = '[{"s":"a","lv":1},{"s":"b","lv":1},{"s":"c","lv":1},{"s":"d","lv":1}]' where id = 'a0000000-0000-0000-0000-000000000001' $q$,
  'more than three strengths is refused');
insert into public.advisor_documents (advisor_id, title, category, content, uploaded_by) values ('a0000000-0000-0000-0000-000000000001', 'S-1 notes', 'S-1', 'Text.', 'admin');
delete from public.advisor_documents where advisor_id = 'a0000000-0000-0000-0000-000000000001' and title = 'S-1 notes';
select t.check_rowcount('select * from public.advisor_documents', 1, 'an admin can add and remove a grounding document');
select t.check_eq((select updated_at > now() - interval '1 minute' from public.advisors where id = 'a0000000-0000-0000-0000-000000000001'), true, 'updated_at is set by the database');

-- --- 2. private chats --------------------------------------------------------
select t.become('00000000-0000-0000-0000-000000000002');
select t.check_rowcount('select * from public.chat_messages', 1, 'a person sees only their own chat');
insert into public.chat_messages (person_id, advisor_id, role, content) values
  ('00000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'advisor', 'Run the math both ways.');
select t.check_rowcount('select * from public.chat_messages', 2, 'a person can append to their own chat');
select t.check_denied(
  $q$ insert into public.chat_messages (person_id, advisor_id, role, content)
      values ('00000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'user', 'peek') $q$,
  'a person cannot write into somebody else''s chat');
select t.check_denied(
  $q$ update public.chat_messages set content = 'edited' where person_id = '00000000-0000-0000-0000-000000000002' $q$,
  'a transcript cannot be edited');
select t.check_denied(
  $q$ delete from public.chat_messages where person_id = '00000000-0000-0000-0000-000000000002' $q$,
  'a transcript cannot be deleted');
select t.become('00000000-0000-0000-0000-000000000001');
select t.check_rowcount('select * from public.chat_messages', 0, 'an admin does not see other people''s chats');

-- --- 2b. the standing brief is one person's ----------------------------------
select t.become('00000000-0000-0000-0000-000000000002');
insert into public.briefs (person_id, content) values ('00000000-0000-0000-0000-000000000002', 'Meridian: $4.2M ARR.');
update public.briefs set content = 'Meridian: $4.3M ARR.' where person_id = '00000000-0000-0000-0000-000000000002';
select t.check_eq((select content from public.briefs where person_id = '00000000-0000-0000-0000-000000000002'), 'Meridian: $4.3M ARR.', 'a person keeps their own standing brief');
select t.check_denied(
  $q$ insert into public.briefs (person_id, content) values ('00000000-0000-0000-0000-000000000003', 'as someone else') $q$,
  'a person cannot write somebody else''s brief');
select t.become('00000000-0000-0000-0000-000000000001');
select t.check_rowcount('select * from public.briefs', 0, 'an admin does not see other people''s briefs');

-- --- 3. sessions: the board's record ------------------------------------------
select t.become('00000000-0000-0000-0000-000000000003');
select t.check_rowcount('select * from public.sessions', 1, 'everyone on the roster sees the sessions');
select t.check_affected(
  $q$ update public.sessions set status = 'challenges' where id = '50000000-0000-0000-0000-000000000001' $q$,
  0, 'somebody else cannot drive a session they did not convene');
select t.check_denied(
  $q$ insert into public.session_views (session_id, advisor_id, advisor_name, advisor_role, view)
      values ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Marcus Chen', 'Finance & Capital', 'x') $q$,
  'somebody else cannot add a view to a session they did not convene');
select t.check_denied(
  $q$ insert into public.sessions (person_id, question) values ('00000000-0000-0000-0000-000000000002', 'as someone else') $q$,
  'a session is convened in one''s own name');
insert into public.sessions (person_id, question) values ('00000000-0000-0000-0000-000000000003', 'EU expansion go/no-go');
select t.check_rowcount('select * from public.sessions', 2, 'anyone on the roster can convene');

select t.become('00000000-0000-0000-0000-000000000002');
select t.check_denied(
  $q$ update public.sessions set question = 'another question' where id = '50000000-0000-0000-0000-000000000001' $q$,
  'the question cannot be changed', 'question');
select t.check_denied(
  $q$ update public.sessions set brief = 'a different brief' where id = '50000000-0000-0000-0000-000000000001' $q$,
  'the brief cannot be changed', 'brief');
select t.check_denied(
  $q$ update public.sessions set advisor_ids = '{a0000000-0000-0000-0000-000000000001}' where id = '50000000-0000-0000-0000-000000000001' $q$,
  'the roster of a session cannot be changed', 'roster');
select t.check_denied(
  $q$ insert into public.session_views (session_id, advisor_id, advisor_name, advisor_role, view)
      values ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Not Invited', 'X', 'x') $q$,
  'an advisor who was not invited cannot give a view', 'not in this session');
select t.check_denied(
  $q$ insert into public.session_votes (session_id, advisor_id, advisor_name, vote, statement)
      values ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Marcus Chen', 'agree', 'x') $q$,
  'a vote before a view is refused', 'view');
insert into public.session_views (session_id, advisor_id, advisor_name, advisor_role, view) values
  ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Marcus Chen', 'Finance & Capital', 'Raise now.'),
  ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Elena Vasquez', 'Go-to-Market', 'Wait for the logos.');
select t.check_denied(
  $q$ update public.session_views set view = 'rewritten' where session_id = '50000000-0000-0000-0000-000000000001' $q$,
  'a view cannot be edited');
select t.check_denied(
  $q$ delete from public.session_views where session_id = '50000000-0000-0000-0000-000000000001' $q$,
  'a view cannot be deleted');
select t.check_denied(
  $q$ insert into public.session_challenges (session_id, from_advisor_id, to_advisor_id, from_name, to_name, challenge)
      values ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'M', 'M', 'x') $q$,
  'an advisor cannot challenge themself');
insert into public.session_challenges (session_id, from_advisor_id, to_advisor_id, from_name, to_name, challenge) values
  ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Elena Vasquez', 'Marcus Chen', 'You are pricing fear.');
update public.sessions set status = 'challenges' where id = '50000000-0000-0000-0000-000000000001';
select t.check_denied(
  $q$ update public.sessions set status = 'views' where id = '50000000-0000-0000-0000-000000000001' $q$,
  'a session does not move backwards', 'forward');
select t.check_denied(
  $q$ insert into public.session_votes (session_id, advisor_id, advisor_name, vote, statement)
      values ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Marcus Chen', 'agree', 'x') $q$,
  'a vote before the synthesis is refused', 'synthesis');
update public.sessions set status = 'votes', recommendation = 'Begin the raise in eight weeks.' where id = '50000000-0000-0000-0000-000000000001';
select t.check_denied(
  $q$ update public.sessions set recommendation = 'Something else.' where id = '50000000-0000-0000-0000-000000000001' $q$,
  'the synthesis is written once', 'record');
insert into public.session_votes (session_id, advisor_id, advisor_name, vote, statement) values
  ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Marcus Chen', 'agree', 'Agreed.'),
  ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Elena Vasquez', 'conditional', 'Both logos should close first.');
select t.check_denied(
  $q$ update public.session_votes set statement = 'softened' where session_id = '50000000-0000-0000-0000-000000000001' $q$,
  'a recorded dissent cannot be softened');
select t.check_denied(
  $q$ insert into public.session_votes (session_id, advisor_id, advisor_name, vote, statement)
      values ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Marcus Chen', 'maybe', 'x') $q$,
  'a vote is agree, conditional or disagree');
update public.sessions set status = 'done', completed_at = now() where id = '50000000-0000-0000-0000-000000000001';
select t.check_denied(
  $q$ update public.sessions set status = 'failed' where id = '50000000-0000-0000-0000-000000000001' $q$,
  'a completed session cannot be reopened', 'reopened');
select t.check_denied(
  $q$ delete from public.sessions where id = '50000000-0000-0000-0000-000000000001' $q$,
  'a session cannot be deleted');

-- --- 4. a deactivated person sees nothing ------------------------------------
select t.become('00000000-0000-0000-0000-000000000004');
select t.check_rowcount('select * from public.advisors', 0, 'a deactivated person sees no advisors');
select t.check_rowcount('select * from public.sessions', 0, 'a deactivated person sees no sessions');

-- =============================================================================
-- As `anon`
-- =============================================================================
reset role;
set role anon;
select t.become(null);
select t.check_denied('select * from public.people',             'anon cannot read the roster');
select t.check_denied('select * from public.advisors',           'anon cannot read advisors');
select t.check_denied('select * from public.advisor_documents',  'anon cannot read documents');
select t.check_denied('select * from public.chat_messages',      'anon cannot read chats');
select t.check_denied('select * from public.briefs',             'anon cannot read briefs');
select t.check_denied('select * from public.sessions',           'anon cannot read sessions');
select t.check_denied('select * from public.session_views',      'anon cannot read views');
select t.check_denied('select * from public.session_votes',      'anon cannot read votes');

reset role;
\o
select 'permissions suite passed' as result;
