-- Stage 10: let the user choose which days of the month they're paid on.
-- Run this once in the Supabase SQL editor. Non-destructive.
--
-- Previously the paydays were hardcoded to the 5th and the 20th. These two
-- columns store the user's actual paydays (day of month). The defaults keep the
-- old behaviour for anyone who hasn't set them.
--
--   payday_a — the later payday  (was the 20th; pairs with period_a_amount)
--   payday_b — the earlier payday (was the 5th;  pairs with period_b_amount)

alter table salary_settings
  add column if not exists payday_a int not null default 20 check (payday_a between 1 and 31);

alter table salary_settings
  add column if not exists payday_b int not null default 5 check (payday_b between 1 and 31);
