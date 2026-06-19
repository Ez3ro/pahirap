-- Stage 4: Track original loan length on recurring debts so progress bars can
-- show "X of Y months paid" rather than just months remaining.
-- Run this once in the Supabase SQL editor. Non-destructive.

alter table debts
  add column if not exists original_months int check (original_months >= 0);

-- Backfill existing rows: set original_months = months_left (i.e. 0 months paid).
-- Run BEFORE recording any further payments, otherwise months_left will already
-- have decreased and the starting total will be wrong.
update debts
  set original_months = months_left
  where original_months is null
    and kind = 'recurring';
