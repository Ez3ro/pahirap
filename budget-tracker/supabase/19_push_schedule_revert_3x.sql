-- Stage 19: revert the schedule from hourly (stage 18) back to 3×/day.
-- Run this once in the Supabase SQL editor, AFTER 18. Re-runnable.
--
-- 3×/day is enough now that overspend also fires instantly on save. These runs
-- also send the daily "doing fine" message (once a day max — see the function).
-- Times in UTC; comments show Manila (UTC+8). notification_log de-dupes.

-- Drop the hourly job from stage 18 (no-op if already gone).
select cron.unschedule('send-push-hourly') where exists (select 1 from cron.job where jobname = 'send-push-hourly');

-- Drop the three daily jobs too, so re-running this file just refreshes them.
select cron.unschedule('send-push-morning') where exists (select 1 from cron.job where jobname = 'send-push-morning');
select cron.unschedule('send-push-midday')  where exists (select 1 from cron.job where jobname = 'send-push-midday');
select cron.unschedule('send-push-evening') where exists (select 1 from cron.job where jobname = 'send-push-evening');

select cron.schedule('send-push-morning', '0 23 * * *', $$select public.invoke_send_push();$$); -- 07:00 Manila
select cron.schedule('send-push-midday',  '0 5  * * *', $$select public.invoke_send_push();$$); -- 13:00 Manila
select cron.schedule('send-push-evening', '0 11 * * *', $$select public.invoke_send_push();$$); -- 19:00 Manila

-- Check it:  select * from cron.job;
