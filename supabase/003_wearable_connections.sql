-- HAEMIQ: wearable integrations (Oura first)
-- Run this whole file in Supabase Dashboard → SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS guards.

-- ============================================================
-- 1. TABLES
-- ============================================================

-- One row per user per provider. Tokens are stored plainly (never
-- exposed client-side — only ever read by server actions/route
-- handlers) and protected by RLS below, matching the rest of this app's
-- MVP security posture. last_synced_at drives the "sync if last pull
-- was >6h ago" rule on dashboard load.
create table if not exists wearable_connections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  provider          text not null default 'oura',
  access_token      text not null,
  refresh_token     text not null,
  token_expires_at  timestamptz not null,
  connected_at      timestamptz not null default now(),
  last_synced_at    timestamptz,
  unique (user_id, provider)
);

create index if not exists wearable_connections_user_id_idx on wearable_connections(user_id);

-- One row per user per provider per day. raw_json keeps the untouched
-- API response around for future fields without another migration.
create table if not exists wearable_daily_data (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  provider              text not null default 'oura',
  date                  date not null,
  sleep_score           integer,
  readiness_score       integer,
  activity_score        integer,
  resting_heart_rate    numeric,
  hrv_avg               numeric,
  raw_json              jsonb,
  created_at            timestamptz not null default now(),
  unique (user_id, provider, date)
);

create index if not exists wearable_daily_data_user_id_idx on wearable_daily_data(user_id);
create index if not exists wearable_daily_data_user_date_idx on wearable_daily_data(user_id, date);

-- ============================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================

alter table wearable_connections enable row level security;
alter table wearable_daily_data enable row level security;

-- wearable_connections: owner-only insert / select / update / delete.
-- update + delete are needed so the sync action can refresh tokens and
-- the disconnect action can remove a revoked/expired connection.

drop policy if exists "Users can insert their own wearable connection" on wearable_connections;
create policy "Users can insert their own wearable connection"
  on wearable_connections for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can view their own wearable connection" on wearable_connections;
create policy "Users can view their own wearable connection"
  on wearable_connections for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can update their own wearable connection" on wearable_connections;
create policy "Users can update their own wearable connection"
  on wearable_connections for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their own wearable connection" on wearable_connections;
create policy "Users can delete their own wearable connection"
  on wearable_connections for delete
  to authenticated
  using (user_id = auth.uid());

-- wearable_daily_data: owner-only insert / select / update / delete.
-- update is needed for the upsert-on-sync flow.

drop policy if exists "Users can insert their own wearable daily data" on wearable_daily_data;
create policy "Users can insert their own wearable daily data"
  on wearable_daily_data for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can view their own wearable daily data" on wearable_daily_data;
create policy "Users can view their own wearable daily data"
  on wearable_daily_data for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can update their own wearable daily data" on wearable_daily_data;
create policy "Users can update their own wearable daily data"
  on wearable_daily_data for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their own wearable daily data" on wearable_daily_data;
create policy "Users can delete their own wearable daily data"
  on wearable_daily_data for delete
  to authenticated
  using (user_id = auth.uid());
