-- =============================================================================
-- Quorum — Supabase auth adapter (the ONLY platform-specific migration)
-- =============================================================================
-- Ties public.people.id to the identity provider's user id. Wrapped in an
-- existence check so the same migration is a no-op on a plain Postgres host.
--
-- Deliberately NOT here: an `on auth.users` trigger that auto-creates roster
-- rows. Provisioning is app code (scripts/seed.ts) so that an email account is
-- necessary to sign in and never sufficient.
-- =============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) then
    if not exists (select 1 from pg_constraint where conname = 'people_id_fkey') then
      alter table public.people
        add constraint people_id_fkey
        foreign key (id) references auth.users (id) on delete cascade;
    end if;
  end if;
end;
$$;
