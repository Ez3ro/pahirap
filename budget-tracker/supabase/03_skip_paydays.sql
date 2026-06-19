-- Stage 2 follow-up: let a payday be skipped ("I didn't get paid").
-- Run this once in the Supabase SQL editor. Non-destructive.

-- A list of paydays the user has chosen to skip. We store it as an array on the
-- existing settings row rather than a new table, since it's just a set of dates.
alter table salary_settings
  add column if not exists skipped_paydays date[] not null default '{}';
