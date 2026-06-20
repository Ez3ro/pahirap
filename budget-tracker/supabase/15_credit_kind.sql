-- Stage 15: allow the 'credit' debt kind (credit cards).
-- Run this once in the Supabase SQL editor. Non-destructive.
--
-- The debts.kind check constraint originally only allowed 'recurring' and
-- 'lumpsum'. Credit cards use kind = 'credit', so the old constraint rejects them
-- ("new row ... violates check constraint debts_kind_check"). This widens it.

alter table debts
  drop constraint if exists debts_kind_check;

alter table debts
  add constraint debts_kind_check
  check (kind in ('recurring', 'lumpsum', 'credit'));
