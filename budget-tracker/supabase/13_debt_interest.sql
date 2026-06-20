-- Stage 13: store an interest rate per debt, for the avalanche kill strategy.
-- Run this once in the Supabase SQL editor. Non-destructive.
--
-- interest_rate is the annual rate (APR) as a percentage, e.g. 36 for 36%/year.
-- It's optional (null = unknown); the avalanche order sorts highest-rate first
-- and pushes debts with no rate to the end. Snowball ignores it entirely.

alter table debts
  add column if not exists interest_rate numeric check (interest_rate >= 0);
