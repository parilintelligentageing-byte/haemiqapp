-- HAEMIQ: meal plan generator Phase 2 (meal structure, swap, logging, persistent preferences)
-- Run this whole file in Supabase Dashboard → SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS guards.

-- ============================================================
-- 1. ENUM TYPES
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'meal_plan_meal_type') then
    create type meal_plan_meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');
  end if;

  if not exists (select 1 from pg_type where typname = 'food_preference_type') then
    create type food_preference_type as enum ('excluded', 'preferred');
  end if;
end $$;

-- ============================================================
-- 2. meal_plan_foods: add meal_type
-- ============================================================

-- Existing rows predate meal slots and get backfilled to 'lunch'. The
-- default is dropped afterward — every future insert (generation, swap,
-- add-a-food) always specifies meal_type explicitly.
alter table meal_plan_foods add column if not exists meal_type meal_plan_meal_type not null default 'lunch';
alter table meal_plan_foods alter column meal_type drop default;

create index if not exists meal_plan_foods_meal_type_idx on meal_plan_foods(meal_type);

-- ============================================================
-- 3. food_preferences — persistent "never suggest" / "always suggest"
-- ============================================================

-- Separate from user_profiles.allergies (a hard safety block) and from a
-- single plan's per-food reject (temporary, plan-scoped). This is an
-- ongoing signal that carries across every future regeneration/swap.
create table if not exists food_preferences (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  food_name     text not null,
  usda_fdc_id   text,
  preference    food_preference_type not null,
  created_at    timestamptz not null default now(),
  unique (user_id, food_name)
);

create index if not exists food_preferences_user_id_idx on food_preferences(user_id);

alter table food_preferences enable row level security;

drop policy if exists "Users can insert their own food preferences" on food_preferences;
create policy "Users can insert their own food preferences"
  on food_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can view their own food preferences" on food_preferences;
create policy "Users can view their own food preferences"
  on food_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can update their own food preferences" on food_preferences;
create policy "Users can update their own food preferences"
  on food_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their own food preferences" on food_preferences;
create policy "Users can delete their own food preferences"
  on food_preferences for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 4. meal_logs — "mark as eaten" for today's date
-- ============================================================

create table if not exists meal_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  meal_plan_id  uuid not null references meal_plans(id) on delete cascade,
  meal_type     meal_plan_meal_type not null,
  log_date      date not null,
  logged_at     timestamptz not null default now(),
  unique (user_id, meal_type, log_date)
);

create index if not exists meal_logs_user_id_log_date_idx on meal_logs(user_id, log_date);

alter table meal_logs enable row level security;

drop policy if exists "Users can insert their own meal logs" on meal_logs;
create policy "Users can insert their own meal logs"
  on meal_logs for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can view their own meal logs" on meal_logs;
create policy "Users can view their own meal logs"
  on meal_logs for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can delete their own meal logs" on meal_logs;
create policy "Users can delete their own meal logs"
  on meal_logs for delete
  to authenticated
  using (user_id = auth.uid());
