-- HAEMIQ: meal plan generator (Phase 1 — core food list only)
-- Run this whole file in Supabase Dashboard → SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS guards.

-- ============================================================
-- 1. ENUM TYPES
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'meal_plan_status') then
    create type meal_plan_status as enum ('draft', 'active', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'meal_plan_food_preparation') then
    create type meal_plan_food_preparation as enum ('raw', 'cooked');
  end if;

  if not exists (select 1 from pg_type where typname = 'meal_plan_food_category') then
    create type meal_plan_food_category as enum ('protein', 'carb', 'vegetable', 'fruit', 'dairy', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'meal_plan_food_status') then
    create type meal_plan_food_status as enum ('proposed', 'accepted', 'rejected');
  end if;
end $$;

-- ============================================================
-- 2. TABLES
-- ============================================================

create table if not exists meal_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  status        meal_plan_status not null default 'draft',
  ai_rationale  text,
  created_at    timestamptz not null default now()
);

create index if not exists meal_plans_user_id_idx on meal_plans(user_id);

-- quantity_grams/calories/macros are always populated from a real USDA
-- lookup server-side, never from the AI's own output — see
-- lib/actions/meal-plan.ts. usda_fdc_id is nullable to cover foods the
-- USDA lookup couldn't match (flagged, not silently dropped).
create table if not exists meal_plan_foods (
  id              uuid primary key default gen_random_uuid(),
  meal_plan_id    uuid not null references meal_plans(id) on delete cascade,
  food_name       text not null,
  usda_fdc_id     text,
  quantity_grams  numeric,
  preparation     meal_plan_food_preparation,
  calories        numeric,
  protein_g       numeric,
  carbs_g         numeric,
  fat_g           numeric,
  category        meal_plan_food_category not null default 'other',
  rationale       text,
  status          meal_plan_food_status not null default 'proposed',
  is_user_added   boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists meal_plan_foods_meal_plan_id_idx on meal_plan_foods(meal_plan_id);

-- Read-through cache for USDA FoodData Central lookups, keyed by a
-- normalized "food name + preparation" search term so repeat foods
-- (chicken breast, cooked) across users/plans skip the API entirely.
-- Not user-scoped data, so no RLS — it only ever holds public USDA
-- nutrition facts.
create table if not exists food_reference (
  search_key    text primary key,
  usda_fdc_id   text not null,
  food_name     text not null,
  raw_json      jsonb not null,
  cached_at     timestamptz not null default now()
);

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

alter table meal_plans enable row level security;
alter table meal_plan_foods enable row level security;

drop policy if exists "Users can insert their own meal plans" on meal_plans;
create policy "Users can insert their own meal plans"
  on meal_plans for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can view their own meal plans" on meal_plans;
create policy "Users can view their own meal plans"
  on meal_plans for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can update their own meal plans" on meal_plans;
create policy "Users can update their own meal plans"
  on meal_plans for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their own meal plans" on meal_plans;
create policy "Users can delete their own meal plans"
  on meal_plans for delete
  to authenticated
  using (user_id = auth.uid());

-- meal_plan_foods: ownership is via the parent plan's user_id.

drop policy if exists "Users can insert foods on their own meal plans" on meal_plan_foods;
create policy "Users can insert foods on their own meal plans"
  on meal_plan_foods for insert
  to authenticated
  with check (
    exists (
      select 1 from meal_plans
      where meal_plans.id = meal_plan_foods.meal_plan_id
        and meal_plans.user_id = auth.uid()
    )
  );

drop policy if exists "Users can view foods on their own meal plans" on meal_plan_foods;
create policy "Users can view foods on their own meal plans"
  on meal_plan_foods for select
  to authenticated
  using (
    exists (
      select 1 from meal_plans
      where meal_plans.id = meal_plan_foods.meal_plan_id
        and meal_plans.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update foods on their own meal plans" on meal_plan_foods;
create policy "Users can update foods on their own meal plans"
  on meal_plan_foods for update
  to authenticated
  using (
    exists (
      select 1 from meal_plans
      where meal_plans.id = meal_plan_foods.meal_plan_id
        and meal_plans.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from meal_plans
      where meal_plans.id = meal_plan_foods.meal_plan_id
        and meal_plans.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete foods on their own meal plans" on meal_plan_foods;
create policy "Users can delete foods on their own meal plans"
  on meal_plan_foods for delete
  to authenticated
  using (
    exists (
      select 1 from meal_plans
      where meal_plans.id = meal_plan_foods.meal_plan_id
        and meal_plans.user_id = auth.uid()
    )
  );
