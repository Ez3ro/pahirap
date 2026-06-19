-- Stage 2: Income. Run this once in the Supabase SQL editor.
-- It's non-destructive (no drops) so your existing transactions are safe.

-- 1. Tag salary income rows with the payday they cover. This lets us show a
--    salary history and stops the same payday being recorded twice.
alter table transactions
  add column if not exists paid_for date;

-- A given payday can only be recorded once per user. The "where" makes this a
-- partial index: it only applies to salary rows (paid_for set), so ordinary
-- transactions (paid_for null) are unaffected.
create unique index if not exists transactions_user_payday_unique
  on transactions (user_id, paid_for)
  where paid_for is not null;

-- 2. Per-user salary settings: the two semi-monthly amounts.
--    Period A = 1st-15th (paid on the 20th); Period B = 16th-end (paid on the 5th).
create table if not exists salary_settings (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  period_a_amount numeric not null default 0 check (period_a_amount >= 0),
  period_b_amount numeric not null default 0 check (period_b_amount >= 0),
  updated_at timestamptz not null default now()
);

alter table salary_settings enable row level security;

drop policy if exists "Users manage their own salary settings" on salary_settings;
create policy "Users manage their own salary settings"
  on salary_settings for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
