-- HAEMIQ: calorie targets (BMR/TDEE) + daily meal plan summary
-- Run this whole file in Supabase Dashboard → SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS guards.

alter table user_profiles add column if not exists goal_intensity text;

-- Marks whether a food's quantity may be proportionally scaled to help a
-- generated/swapped meal converge on the day's calorie target — false for
-- discrete-unit foods (an egg, a tbsp of oil, a supplement) and anything
-- the user typed in themselves. See lib/nutrition/food-scaling.ts.
alter table meal_plan_foods add column if not exists is_scalable boolean not null default true;
