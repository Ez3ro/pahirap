# Push notifications — setup

The app (a PWA on Vercel) shows notifications even when it's closed, driven by
**Supabase**. Vercel just serves the static site; Supabase stores subscriptions,
runs the scheduled checks, and sends the pushes.

You only have to do this once. Steps marked **(secret)** must not be committed.

## 1. Generate VAPID keys

VAPID is the keypair that authorises your server to push to a browser.

```bash
npx web-push generate-vapid-keys
```

You'll get a **Public Key** and a **Private Key**.

## 2. Frontend env (Vercel + local)

- Add the **public** key to `.env` locally:
  ```
  VITE_VAPID_PUBLIC_KEY=<public key>
  ```
- Add the same var in **Vercel → Project → Settings → Environment Variables**, then
  redeploy. (The public key is safe to expose; that's the whole point of VAPID.)

## 3. Run the SQL migrations

In **Supabase → SQL Editor**, run, in order:

- `supabase/16_push_subscriptions.sql` — tables for subscriptions + a sent-log.
- `supabase/17_push_schedule.sql` — the cron schedule. **Before running it**, edit
  the two `vault.create_secret(...)` lines to your real project URL and
  **service-role key (secret)** (Dashboard → Project Settings → API).

## 4. Deploy the Edge Function

With the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase functions deploy send-push
```

Then set its **secrets**:

```bash
supabase secrets set VAPID_PUBLIC_KEY="<public key>"
supabase secrets set VAPID_PRIVATE_KEY="<private key>"   # (secret)
supabase secrets set VAPID_SUBJECT="mailto:you@example.com"
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to the function
automatically — you don't set those.)

## 5. Turn it on, on your phone

- **iPhone:** open the app in Safari → Share → **Add to Home Screen**, then open it
  from the home-screen icon (not the Safari tab). Requires iOS 16.4+.
- **Android:** Chrome will offer **Install app** / Add to Home Screen.
- In the app's sidebar, flip **🔔 Notifications** on and accept the prompt.

## 6. Test it

Send yourself a one-off test push (bypasses the budget logic):

```bash
curl -X POST "https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-push" \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

Your phone should buzz with a test notification. After that, the cron schedule
(07:00 / 13:00 / 19:00 Manila) handles payday reminders and overspend roasts
automatically.

## What triggers what

| Trigger | When |
|---|---|
| Payday reminder | It's a payday and you haven't logged that paycheck yet |
| Category roast | A specific budget pool (Food, Shopping, …) is over for the period |
| Daily/weekly/period over | The matching budget ring is past its safe pace |

Each alert is de-duped (one payday nudge per payday, one roast per blown pool per
period), so the thrice-daily schedule never spams you.

## Editing the messages

All the notification copy lives in **two mirrored files** — change both:
- `src/lib/notifyMessages.js` (client)
- `supabase/functions/_shared/messages.ts` (server — this is the one that actually
  fires the scheduled pushes)

Add/remove/reword lines freely; the logic just picks one.
