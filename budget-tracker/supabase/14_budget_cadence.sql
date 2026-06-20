-- Stage 14: per-category budget cadence (how often the limit resets).
-- Run this once in the Supabase SQL editor. Non-destructive.
--
-- Some budgets are naturally daily (food), others monthly (bills, rent). The
-- cadence controls how a category's monthly_limit is interpreted and how its
-- daily allotment is worked out:
--   daily   — the limit is a per-day figure
--   weekly  — a per-week figure
--   monthly — a per-month figure (default; rent/bills live here)
-- Existing categories default to monthly.

alter table budget_limits
  add column if not exists cadence text not null default 'monthly'
  check (cadence in ('daily', 'weekly', 'monthly'));
