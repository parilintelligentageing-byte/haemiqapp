-- HAEMIQ: meal plan preferences — allergies column (Phase 1.5)
-- Run this whole file in Supabase Dashboard → SQL Editor.
-- Safe to re-run.

-- Kept separate from health_conditions: allergies are a hard safety
-- exclusion for meal plan generation, not a general health signal.
alter table user_profiles add column if not exists allergies text[];
