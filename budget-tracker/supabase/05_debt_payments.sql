-- Stage 3 follow-up: track payment progress on recurring debts.
-- Run this once in the Supabase SQL editor. Non-destructive.

alter table debts
  -- How many monthly payments are still to be made. Owed = months_left * amount.
  add column if not exists months_left int check (months_left >= 0);

alter table debts
  -- The date the next payment is due. Paying advances this by one month;
  -- if today passes it while months remain, the debt is overdue.
  add column if not exists next_due_date date;
