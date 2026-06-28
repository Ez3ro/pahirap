-- Stage 20: explicit "no spending today" marks, one row per user per local day.
-- Run this once in the Supabase SQL editor. Non-destructive.
--
-- A day with zero transactions can't be told apart from a day you simply didn't
-- open the app, so the TRACKING streak needs an explicit signal that you checked
-- in and had nothing to spend. The "No spending today" button writes one row here.
-- `day` is the LOCAL calendar date (YYYY-MM-DD) the app computed, NOT derived from
-- a UTC timestamp, so a late-evening tap files under the right day exactly like
-- transactions are bucketed against local pay-day boundaries elsewhere.
--
-- unique (user_id, day) makes the button idempotent: a second tap (or an offline
-- write replayed twice) upserts the same row instead of duplicating it. RLS scopes
-- each row to its owner, mirroring push_subscriptions / every other table here.

create table if not exists no_spend_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  -- The local calendar day marked as spend-free, e.g. '2026-06-28'.
  day date not null,
  created_at timestamptz not null default now(),
  unique (user_id, day) 
);

create index if not exists no_spend_days_user_idx on no_spend_days (user_id);

alter table no_spend_days enable row level security;

drop policy if exists "Users manage their own no-spend days" on no_spend_days;
create policy "Users manage their own no-spend days"
  on no_spend_days for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
