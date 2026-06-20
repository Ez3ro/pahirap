-- Stage 12: let a category opt out of the auto-budget.
-- Run this once in the Supabase SQL editor. Non-destructive.
--
-- When auto_budget is false, the auto-budget skips this category entirely and
-- shares its money among the categories that are still included — so removing
-- (e.g.) Bills or Housing reallocates that cash instead of suggesting it back.
-- The category still appears and still tracks any spending you log in it.

alter table budget_limits
  add column if not exists auto_budget boolean not null default true;
