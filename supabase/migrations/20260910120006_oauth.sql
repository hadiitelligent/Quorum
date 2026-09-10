-- =============================================================================
-- Quorum — the connector's OAuth server
-- =============================================================================
-- Quorum is a remote MCP connector a client adds to their Claude. Claude
-- registers itself as an OAuth client, sends the person to /oauth/authorize
-- (they sign in to Quorum and approve), exchanges the code for tokens with
-- PKCE, and calls /api/mcp with a bearer token. These tables belong to the
-- server alone: RLS is on with no policies and no grants, so only the
-- service role (lib/oauth.ts) can touch them. Secrets are stored hashed.
-- =============================================================================

create table public.oauth_clients (
  id            text primary key,
  name          text not null default '',
  redirect_uris text[] not null,
  created_at    timestamptz not null default now()
);

create table public.oauth_codes (
  code_hash      text primary key,
  client_id      text not null references public.oauth_clients (id) on delete cascade,
  person_id      uuid not null references public.people (id) on delete cascade,
  redirect_uri   text not null,
  code_challenge text not null,
  scope          text not null default 'quorum',
  expires_at     timestamptz not null,
  used_at        timestamptz
);

create table public.oauth_tokens (
  token_hash   text primary key,
  kind         text not null check (kind in ('access', 'refresh')),
  client_id    text not null references public.oauth_clients (id) on delete cascade,
  person_id    uuid not null references public.people (id) on delete cascade,
  scope        text not null default 'quorum',
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);

create index oauth_tokens_person on public.oauth_tokens (person_id, client_id, kind);

alter table public.oauth_clients enable row level security;
alter table public.oauth_codes   enable row level security;
alter table public.oauth_tokens  enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.oauth_clients, public.oauth_codes, public.oauth_tokens from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.oauth_clients, public.oauth_codes, public.oauth_tokens from anon;
  end if;
end;
$$;
