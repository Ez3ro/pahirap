-- Stage 16: web-push subscriptions, one row per device that opted in.
-- Run this once in the Supabase SQL editor. Non-destructive.
--
-- The browser's PushManager gives us an endpoint + two keys per device. The
-- `send-push` Edge Function reads these to deliver notifications. RLS scopes each
-- row to its owner exactly like every other table here; the Edge Function uses
-- the service-role key, which bypasses RLS, so it can read everyone's rows when a
-- cron job fans out — but a logged-in user can still only see/manage their own.

create table if not exists push_subscriptions (
  -- The push endpoint is globally unique per device+browser, so it's the natural
  -- key: re-subscribing the same device upserts instead of duplicating.
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  p256dh text not null,   -- public key from the subscription (for payload encryption)
  auth text not null,     -- auth secret from the subscription
  user_agent text,        -- hint so you can tell devices apart
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "Users manage their own push subscriptions" on push_subscriptions;
create policy "Users manage their own push subscriptions"
  on push_subscriptions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Remembers which one-off alerts we've already sent, so a cron job that runs every
-- few hours doesn't roast you for the same overspend (or remind you of the same
-- payday) over and over. `dedupe_key` is built by the Edge Function, e.g.
--   "payday:2026-06-20"  or  "over:daily:2026-06-21".
create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  dedupe_key text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

alter table notification_log enable row level security;

drop policy if exists "Users see their own notification log" on notification_log;
create policy "Users see their own notification log"
  on notification_log for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
