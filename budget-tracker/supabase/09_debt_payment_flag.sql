-- Stage 9: flag debt payments so the budget can exclude them.
-- Run this once in the Supabase SQL editor. Non-destructive.
--
-- When you pay a debt the app logs an expense transaction. Those payments are a
-- committed cost, not discretionary spending, so they shouldn't count against
-- your daily/category budget. This flag lets the app tell them apart from the
-- groceries-and-coffee kind of expense.

alter table transactions
  add column if not exists is_debt_payment boolean not null default false;

-- Backfill: any existing expense named like "Debt: ..." was a debt payment.
update transactions
  set is_debt_payment = true
  where type = 'expense'
    and name like 'Debt: %'
    and is_debt_payment = false;
