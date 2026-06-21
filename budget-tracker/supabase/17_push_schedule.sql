-- Stage 17: schedule the send-push Edge Function with pg_cron.
-- Run this once in the Supabase SQL editor, AFTER you've deployed the function
-- and set its secrets. Re-running is safe (it unschedules first).
--
-- pg_cron schedules are in UTC. We're targeting Asia/Manila (UTC+8), so:
--   07:00 Manila = 23:00 UTC (previous day)
--   13:00 Manila = 05:00 UTC
--   19:00 Manila = 11:00 UTC
-- The morning run catches paydays; the afternoon/evening runs catch overspend
-- after you've actually done some spending. notification_log de-dupes, so running
-- three times a day never double-sends the same alert.

-- 1) Enable the extensions (no-ops if already on).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Store your project URL + service-role key in Vault so the schedule can call
--    the function. REPLACE the two values below before running. The service-role
--    key is sensitive — this is why it lives in Vault, not in the SQL text history.
--    create_secret errors if the name already exists, so create-or-update: update
--    the existing secret by id when present, otherwise create it. Re-runnable.
do $$
declare
  existing uuid;
begin
  -- project_url
  select id into existing from vault.secrets where name = 'project_url';
  if existing is null then
    perform vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
  else
    perform vault.update_secret(existing, 'https://YOUR-PROJECT-REF.supabase.co', 'project_url');
  end if;

  -- service_role_key
  select id into existing from vault.secrets where name = 'service_role_key';
  if existing is null then
    perform vault.create_secret('YOUR-SERVICE-ROLE-KEY', 'service_role_key');
  else
    perform vault.update_secret(existing, 'YOUR-SERVICE-ROLE-KEY', 'service_role_key');
  end if;
end $$;

-- 3) A helper that POSTs to the Edge Function using the stored secrets.
create or replace function public.invoke_send_push()
returns void
language plpgsql
security definer
as $$
declare
  base_url text;
  svc_key text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into svc_key  from vault.decrypted_secrets where name = 'service_role_key';

  perform net.http_post(
    url := base_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
end;
$$;

-- 4) (Re)schedule three runs a day. Unschedule first so re-running this file is safe.
select cron.unschedule('send-push-morning')  where exists (select 1 from cron.job where jobname = 'send-push-morning');
select cron.unschedule('send-push-midday')   where exists (select 1 from cron.job where jobname = 'send-push-midday');
select cron.unschedule('send-push-evening')  where exists (select 1 from cron.job where jobname = 'send-push-evening');

select cron.schedule('send-push-morning', '0 23 * * *', $$select public.invoke_send_push();$$); -- 07:00 Manila
select cron.schedule('send-push-midday',  '0 5  * * *', $$select public.invoke_send_push();$$); -- 13:00 Manila
select cron.schedule('send-push-evening', '0 11 * * *', $$select public.invoke_send_push();$$); -- 19:00 Manila

-- To see scheduled jobs:        select * from cron.job;
-- To see recent run results:    select * from cron.job_run_details order by start_time desc limit 10;
