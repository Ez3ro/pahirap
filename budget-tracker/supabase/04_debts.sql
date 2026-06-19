-- Stage 3: Debts. Run this once in the Supabase SQL editor. Non-destructive.

create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  -- 'recurring' = same payment every month; 'lumpsum' = one-off due on a date.
  kind text not null check (kind in ('recurring', 'lumpsum')),
  -- recurring: the monthly payment; lumpsum: the total amount due.
  amount numeric not null check (amount > 0),
  due_day int check (due_day between 1 and 31), -- recurring: day of the month
  due_date date,                                -- lumpsum: the specific due date
  balance numeric check (balance >= 0),         -- optional: total still owed
  created_at timestamptz not null default now()
);

alter table debts enable row level security;

drop policy if exists "Users manage their own debts" on debts;
create policy "Users manage their own debts"
  on debts for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
