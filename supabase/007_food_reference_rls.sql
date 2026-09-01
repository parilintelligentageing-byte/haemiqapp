-- HAEMIQ: fix food_reference caching (Phase 2 follow-up)
-- Run this whole file in Supabase Dashboard → SQL Editor.
-- Safe to re-run.
--
-- food_reference (004_meal_plans.sql) was designed with no RLS — it only
-- ever holds public USDA nutrition facts, not user-scoped data. In
-- practice this project's database has RLS enabled on it anyway (likely
-- Supabase's "secure by default" behavior for new tables) with zero
-- policies, which silently blocks every read and write: every food
-- lookup falls back to a live USDA API call, and the batched-cache work
-- in lib/actions/meal-plan.ts has never actually been able to cache
-- anything. Rather than fight that default, add explicit policies so the
-- cache works as designed — every logged-in user shares the same read/
-- write access, since the data isn't scoped to any one user.

alter table food_reference enable row level security;

drop policy if exists "Authenticated users can read the food reference cache" on food_reference;
create policy "Authenticated users can read the food reference cache"
  on food_reference for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can add to the food reference cache" on food_reference;
create policy "Authenticated users can add to the food reference cache"
  on food_reference for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update the food reference cache" on food_reference;
create policy "Authenticated users can update the food reference cache"
  on food_reference for update
  to authenticated
  using (true)
  with check (true);
