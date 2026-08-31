-- HAEMIQ: blood report storage + schema
-- Run this whole file in Supabase Dashboard → SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS guards.

-- ============================================================
-- 1. STORAGE BUCKET (private)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('blood-reports', 'blood-reports', false)
on conflict (id) do nothing;

-- Files are stored as {user_id}/{report_id}.pdf — policies below check
-- that the first path segment matches the requesting user's id.

drop policy if exists "Users can upload their own blood reports" on storage.objects;
create policy "Users can upload their own blood reports"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'blood-reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can read their own blood reports" on storage.objects;
create policy "Users can read their own blood reports"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'blood-reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own blood reports" on storage.objects;
create policy "Users can delete their own blood reports"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'blood-reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- 2. ENUM TYPES
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type report_status as enum ('processing', 'completed', 'failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'biomarker_flag') then
    create type biomarker_flag as enum ('normal', 'high', 'low', 'critical');
  end if;
end $$;

-- ============================================================
-- 3. TABLES
-- ============================================================

create table if not exists blood_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  file_path    text not null,
  lab_name     text,
  test_date    date,
  uploaded_at  timestamptz not null default now(),
  status       report_status not null default 'processing',
  notes        text
);

create index if not exists blood_reports_user_id_idx on blood_reports(user_id);

create table if not exists biomarkers (
  id                    uuid primary key default gen_random_uuid(),
  report_id             uuid not null references blood_reports(id) on delete cascade,
  category              text,
  name                  text not null,
  value                 numeric,
  unit                  text,
  reference_range_low   numeric,
  reference_range_high  numeric,
  flag                  biomarker_flag
);

create index if not exists biomarkers_report_id_idx on biomarkers(report_id);

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

alter table blood_reports enable row level security;
alter table biomarkers enable row level security;

-- blood_reports: owner-only insert / select / update / delete
-- (update is needed so the server action can flip status
-- processing -> completed/failed after AI extraction runs).

drop policy if exists "Users can insert their own blood reports" on blood_reports;
create policy "Users can insert their own blood reports"
  on blood_reports for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can view their own blood reports" on blood_reports;
create policy "Users can view their own blood reports"
  on blood_reports for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can update their own blood reports" on blood_reports;
create policy "Users can update their own blood reports"
  on blood_reports for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their own blood reports" on blood_reports;
create policy "Users can delete their own blood reports"
  on blood_reports for delete
  to authenticated
  using (user_id = auth.uid());

-- biomarkers: ownership is via the parent report's user_id.

drop policy if exists "Users can insert biomarkers on their own reports" on biomarkers;
create policy "Users can insert biomarkers on their own reports"
  on biomarkers for insert
  to authenticated
  with check (
    exists (
      select 1 from blood_reports
      where blood_reports.id = biomarkers.report_id
        and blood_reports.user_id = auth.uid()
    )
  );

drop policy if exists "Users can view biomarkers on their own reports" on biomarkers;
create policy "Users can view biomarkers on their own reports"
  on biomarkers for select
  to authenticated
  using (
    exists (
      select 1 from blood_reports
      where blood_reports.id = biomarkers.report_id
        and blood_reports.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete biomarkers on their own reports" on biomarkers;
create policy "Users can delete biomarkers on their own reports"
  on biomarkers for delete
  to authenticated
  using (
    exists (
      select 1 from blood_reports
      where blood_reports.id = biomarkers.report_id
        and blood_reports.user_id = auth.uid()
    )
  );
