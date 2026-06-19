-- Run this in your Supabase dashboard: SQL Editor -> New query -> Run.
--
-- IMPORTANT: if you already ran the earlier version of this file, your table
-- exists WITHOUT a user_id column, and "create table if not exists" below will
-- skip it. Since you only have test data, uncomment the drop line to start clean.

-- drop table if exists transactions;

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  -- Links each row to a logged-in user. Defaults to the current user (auth.uid())
  -- so the app never has to set it by hand. on delete cascade removes a user's
  -- transactions if their account is ever deleted.
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  amount numeric not null check (amount > 0),
  type text not null check (type in ('income', 'expense')),
  -- For salary rows: which payday this income covers (null for normal entries).
  paid_for date,
  created_at timestamptz not null default now()
);

-- A given payday can only be recorded once per user (partial index: salary rows only).
create unique index if not exists transactions_user_payday_unique
  on transactions (user_id, paid_for)
  where paid_for is not null;

-- Row Level Security: with this on, Postgres filters every query by the policies below.
alter table transactions enable row level security;

-- Remove the old open policy from the previous version (no-op if it isn't there).
drop policy if exists "Allow anon full access" on transactions;

-- One policy covering all actions. "to authenticated" = only logged-in users.
--   using       -> which existing rows you can see/change/delete (your own)
--   with check  -> what you're allowed to write (rows owned by you)
drop policy if exists "Users manage their own transactions" on transactions;
create policy "Users manage their own transactions"
  on transactions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Per-user salary settings: the two semi-monthly amounts.
-- Period A = 1st-15th (paid on the 20th); Period B = 16th-end (paid on the 5th).
create table if not exists salary_settings (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  period_a_amount numeric not null default 0 check (period_a_amount >= 0),
  period_b_amount numeric not null default 0 check (period_b_amount >= 0),
  -- Paydays the user chose to skip ("I didn't get paid"), so they stop nudging.
  skipped_paydays date[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table salary_settings enable row level security;

drop policy if exists "Users manage their own salary settings" on salary_settings;
create policy "Users manage their own salary settings"
  on salary_settings for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Debts: recurring monthly payments and one-off lump sums.
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  kind text not null check (kind in ('recurring', 'lumpsum')),
  amount numeric not null check (amount > 0),     -- recurring: monthly payment; lumpsum: total due
  due_day int check (due_day between 1 and 31),   -- recurring: day of the month
  due_date date,                                  -- lumpsum: the specific due date
  months_left int check (months_left >= 0),       -- recurring: payments remaining (owed = months_left * amount)
  next_due_date date,                             -- recurring: date the next payment is due
  balance numeric check (balance >= 0),           -- optional: total still owed
  created_at timestamptz not null default now()
);

alter table debts enable row level security;

drop policy if exists "Users manage their own debts" on debts;
create policy "Users manage their own debts"
  on debts for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
