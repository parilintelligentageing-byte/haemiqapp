-- HAEMIQ: user_profiles (onboarding)
-- Run this whole file in Supabase Dashboard → SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS guards.

-- ============================================================
-- 1. ENUM TYPE
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'profile_gender') then
    create type profile_gender as enum ('male', 'female', 'non-binary', 'prefer_not_to_say');
  end if;
end $$;

-- ============================================================
-- 2. TABLE
-- ============================================================

create table if not exists user_profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  name                  text,
  age                   integer,
  gender                profile_gender,
  height_cm             numeric,
  weight_kg             numeric,
  onboarding_completed  boolean not null default false,
  fitness_goals         text[],
  dietary_preferences   text[],
  activity_level        text,
  health_conditions     text[],
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Keep updated_at current on every row change.
create or replace function set_user_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists user_profiles_set_updated_at on user_profiles;
create trigger user_profiles_set_updated_at
  before update on user_profiles
  for each row
  execute function set_user_profiles_updated_at();

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

alter table user_profiles enable row level security;

drop policy if exists "Users can view their own profile" on user_profiles;
create policy "Users can view their own profile"
  on user_profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "Users can insert their own profile" on user_profiles;
create policy "Users can insert their own profile"
  on user_profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "Users can update their own profile" on user_profiles;
create policy "Users can update their own profile"
  on user_profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
