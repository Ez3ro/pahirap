-- Stage 5: Budget feature.
-- Run both statements in the Supabase SQL editor. Non-destructive.

-- 1. Add a category column to transactions so spending can be tracked per
--    category. Existing rows default to 'Other'.
alter table transactions
  add column if not exists category text not null default 'Other';

-- 2. Per-user monthly spending limits, one row per category.
--    upsert on (user_id, category) so saving a limit is always safe to re-run.
create table if not exists budget_limits (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  category      text        not null,
  monthly_limit numeric(12,2) not null default 0,
  constraint budget_limits_user_category unique (user_id, category)
);

alter table budget_limits enable row level security;

drop policy if exists "Users manage own budget limits" on budget_limits;
create policy "Users manage own budget limits"
  on budget_limits for all
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
