-- Stage 18: tighten the push schedule from 3×/day to hourly during waking hours.
-- Run this once in the Supabase SQL editor, AFTER 17_push_schedule.sql (it reuses
-- the invoke_send_push() helper and Vault secrets set up there). Re-runnable.
--
-- The instant on-save alert (client-side) is the primary path; this cron is the
-- backstop for overspend logged on another device or while the app was closed.
-- Manila waking hours 08:00–22:00 = 00:00–14:00 UTC, so we don't buzz at 3am.
-- notification_log still de-dupes, so hourly runs never re-send the same alert.

-- Drop the old thrice-daily jobs (no-ops if they're already gone).
select cron.unschedule('send-push-morning')  where exists (select 1 from cron.job where jobname = 'send-push-morning');
select cron.unschedule('send-push-midday')   where exists (select 1 from cron.job where jobname = 'send-push-midday');
select cron.unschedule('send-push-evening')  where exists (select 1 from cron.job where jobname = 'send-push-evening');
-- And drop the hourly one too, so re-running this file just refreshes it.
select cron.unschedule('send-push-hourly')   where exists (select 1 from cron.job where jobname = 'send-push-hourly');

-- Every hour on the hour, 00:00–14:00 UTC inclusive (08:00–22:00 Manila).
select cron.schedule('send-push-hourly', '0 0-14 * * *', $$select public.invoke_send_push();$$);

-- Check it:  select * from cron.job;
--            select * from cron.job_run_details order by start_time desc limit 10;
