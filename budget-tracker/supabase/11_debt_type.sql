-- Stage 11: categorise debts by type (card, cash, car loan, house loan, etc).
-- Run this once in the Supabase SQL editor. Non-destructive.
--
-- This lets the app group debts and show a per-type monthly subtotal, so a card
-- balance is visible separately from a car or house loan. Existing debts default
-- to 'other' until you set their type.

alter table debts
  add column if not exists debt_type text not null default 'other'
  check (debt_type in ('card', 'cash', 'car', 'house', 'personal', 'other'));
