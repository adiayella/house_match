-- ---------------------------------------------------------------------------
-- HouseMatch — Supabase schema
--
-- Paste the whole file into the Supabase SQL editor and run it once.
--
-- Three tables, and one idea behind all of them: a person's answers belong to
-- that person. Nothing here is written or read by anybody except the bot's
-- service role, so one participant cannot pull another's answers out of the
-- database before the match runs. Row level security is on with no public
-- policy, which means the anon key can read nothing at all.
-- ---------------------------------------------------------------------------

-- Each person's completed intake form, one row per person per group.
create table if not exists public.hm_profiles (
  group_id    text        not null,
  person_key  text        not null,
  name        text        not null default '',
  payload     jsonb       not null,
  updated_at  timestamptz not null default now(),
  primary key (group_id, person_key)
);

-- Where somebody is up to in the form. Short-lived working state.
create table if not exists public.hm_sessions (
  chat_id     text        primary key,
  state       jsonb       not null,
  updated_at  timestamptz not null default now()
);

-- Interested / discuss / reject, per person per listing.
create table if not exists public.hm_votes (
  group_id    text        not null,
  listing_id  text        not null,
  person_key  text        not null,
  name        text        not null default '',
  vote        text        not null check (vote in ('interested', 'discuss', 'reject')),
  created_at  timestamptz not null default now(),
  primary key (group_id, listing_id, person_key)
);

create index if not exists hm_profiles_group_idx on public.hm_profiles (group_id);
create index if not exists hm_votes_group_listing_idx on public.hm_votes (group_id, listing_id);

-- RLS on, and deliberately no policies. The bot uses the service role key,
-- which bypasses RLS; everything else gets nothing. If you ever expose the
-- anon key in a browser, this is what stops it reading people's answers.
alter table public.hm_profiles enable row level security;
alter table public.hm_sessions enable row level security;
alter table public.hm_votes    enable row level security;
