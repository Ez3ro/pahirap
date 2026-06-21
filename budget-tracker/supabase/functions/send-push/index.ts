// Supabase Edge Function: send-push
//
// Invoked on a schedule by pg_cron (see supabase/17_push_schedule.sql) and also
// callable by hand for a test. For every user that has at least one push
// subscription it:
//   1. recomputes their current pay-period + budget rings in Asia/Manila time
//      (mirroring the client maths in _shared/budget.ts),
//   2. decides which alerts to send — payday reminder, daily/weekly/period
//      overspend, specific blown-category roast,
//   3. de-dupes against notification_log so the same alert isn't re-sent every run,
//   4. delivers each via Web Push (VAPID) to all of that user's devices.
//
// Secrets it expects (set with `supabase secrets set ...`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (a "mailto:" you control)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "npm:@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"
import {
  manilaNow,
  currentPeriod,
  ringStats,
  overCategories,
  isoOf,
  type SalarySettings,
  type Tx,
  type BudgetLimit,
} from "../_shared/budget.ts"
import { MESSAGES, pickFrom, fill, categoryMessage } from "../_shared/messages.ts"

const PESO = "₱"
function money(n: number): string {
  return PESO + Math.round(Math.abs(n)).toLocaleString("en-US")
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
)

interface Subscription {
  endpoint: string
  p256dh: string
  auth: string
  user_id: string
}

interface Alert {
  tag: string
  dedupeKey: string
  title: string
  body: string
}

// Decide the alerts for ONE user given their data and "now" in Manila.
function alertsForUser(
  txs: Tx[],
  limits: BudgetLimit[],
  salary: SalarySettings | null,
  now: { y: number; m: number; d: number; date: Date },
  seed: number,
): Alert[] {
  const today = now.date
  const period = currentPeriod(today, salary)
  const alerts: Alert[] = []
  const todayISO = isoOf(now.y, now.m, now.d)

  // --- payday reminder: is today a payday, and have we not recorded salary for it? ---
  const paydays = [salary?.payday_b, salary?.payday_a]
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x >= 1 && x <= 31)
  const isPaydayToday = paydays.includes(now.d)
  const skipped = new Set(salary?.skipped_paydays ?? [])
  const recordedToday = txs.some((t) => t.type === "income" && (t as any).paid_for === todayISO)
  if (isPaydayToday && !skipped.has(todayISO) && !recordedToday) {
    alerts.push({
      tag: "payday",
      dedupeKey: `payday:${todayISO}`,
      title: "💰 Payday",
      body: pickFrom(MESSAGES.payday, seed),
    })
  }

  // --- overspend rings (only if the user actually has a budget set) ---
  const daily = ringStats(txs, limits, period, "daily", today)
  const weekly = ringStats(txs, limits, period, "weekly", today)
  const monthly = ringStats(txs, limits, period, "monthly", today)

  // Specific blown category beats a generic "you're over" — roast the worst one.
  const blown = overCategories(txs, limits, period)
  if (blown.length > 0) {
    const worst = blown[0]
    alerts.push({
      tag: `over-cat-${worst.category}`,
      // Dedupe per category per period so each blown pool roasts once per period.
      dedupeKey: `over:cat:${worst.category}:${isoOf(period.start.getFullYear(), period.start.getMonth(), period.start.getDate())}`,
      title: "💀 Over budget",
      body: categoryMessage(worst.category, money(worst.over), seed),
    })
  } else if (daily.over) {
    alerts.push({
      tag: "over-daily",
      // Daily dedupe by the day itself.
      dedupeKey: `over:daily:${todayISO}`,
      title: "💸 Easy today",
      body: fill(pickFrom(MESSAGES.dailyOver, seed), { amount: money(daily.spent - daily.allowance) }),
    })
  } else if (weekly.over) {
    alerts.push({
      tag: "over-weekly",
      dedupeKey: `over:weekly:${todayISO}`,
      body: fill(pickFrom(MESSAGES.weeklyOver, seed), { amount: money(weekly.spent - weekly.allowance) }),
      title: "📉 Over for the week",
    })
  } else if (monthly.over) {
    alerts.push({
      tag: "over-period",
      dedupeKey: `over:period:${isoOf(period.start.getFullYear(), period.start.getMonth(), period.start.getDate())}`,
      body: fill(pickFrom(MESSAGES.periodOver, seed), { amount: money(monthly.spent - monthly.allowance) }),
      title: "⛽ Over budget",
    })
  }

  return alerts
}

async function deliver(sub: Subscription, alert: Alert): Promise<boolean> {
  const payload = JSON.stringify({ title: alert.title, body: alert.body, tag: alert.tag, url: "/" })
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    )
    return true
  } catch (err: any) {
    // 404/410 = the subscription is dead (app uninstalled, permission revoked).
    // Prune it so we stop trying.
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint)
    } else {
      console.error("push failed", sub.endpoint, err?.statusCode, err?.body)
    }
    return false
  }
}

// CORS: the in-app "Test (server)" button calls this from the browser, which
// triggers a preflight and requires these headers on every response. The cron
// caller (server-to-server) ignores them, so they're harmless there.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  })
}

Deno.serve(async (req) => {
  // Answer the browser's CORS preflight before doing anything else.
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  const now = manilaNow(new Date())
  // A per-run seed so the rotating message lines vary day to day without random.
  const seed = now.y * 372 + now.m * 31 + now.d

  // Optional: POST { test: true } fires a one-off test push, bypassing the budget
  // logic. When a logged-in user invokes it from the app we scope the test to just
  // their own devices (testUserId); the cron caller has no user, so test mode there
  // would hit everyone — but cron never sets test:true, so that can't happen.
  let testMode = false
  let testUserId: string | null = null
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}))
      testMode = body?.test === true
    }
  } catch { /* ignore */ }

  // Identify the caller (if a user JWT was sent) so a browser test only pings
  // that user's devices, not the whole table.
  if (testMode) {
    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.replace(/^Bearer\s+/i, "")
    if (token) {
      const { data: userData } = await supabase.auth.getUser(token)
      testUserId = userData?.user?.id ?? null
    }
  }

  // Pull subscriptions. (Service role bypasses RLS.) A user-initiated test is
  // scoped to that user's own devices; the scheduled run covers everyone.
  let subsQuery = supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, user_id")
  if (testMode && testUserId) subsQuery = subsQuery.eq("user_id", testUserId)
  const { data: subs, error } = await subsQuery
  if (error) return json({ error: error.message }, 500)

  const byUser = new Map<string, Subscription[]>()
  for (const s of subs ?? []) {
    const list = byUser.get(s.user_id) ?? []
    list.push(s as Subscription)
    byUser.set(s.user_id, list)
  }

  let sent = 0
  for (const [userId, devices] of byUser) {
    let alerts: Alert[]

    if (testMode) {
      alerts = [{ tag: "test", dedupeKey: `test:${Date.now()}`, title: "🔔 Test", body: "notifications work, bestie. carry on 😎" }]
    } else {
      // Load this user's data. RLS is bypassed by service role, so filter by hand.
      const [{ data: txs }, { data: limits }, { data: salary }] = await Promise.all([
        supabase.from("transactions").select("type, amount, category, is_debt_payment, created_at, paid_for").eq("user_id", userId),
        supabase.from("budget_limits").select("category, monthly_limit, cadence").eq("user_id", userId),
        supabase.from("salary_settings").select("*").eq("user_id", userId).maybeSingle(),
      ])
      alerts = alertsForUser((txs ?? []) as Tx[], (limits ?? []) as BudgetLimit[], salary as SalarySettings | null, now, seed)

      // Drop any alert we've already sent this user (dedupe).
      if (alerts.length) {
        const { data: already } = await supabase
          .from("notification_log")
          .select("dedupe_key")
          .eq("user_id", userId)
          .in("dedupe_key", alerts.map((a) => a.dedupeKey))
        const seen = new Set((already ?? []).map((r) => r.dedupe_key))
        alerts = alerts.filter((a) => !seen.has(a.dedupeKey))
      }
    }

    for (const alert of alerts) {
      const results = await Promise.all(devices.map((d) => deliver(d, alert)))
      const delivered = results.some(Boolean)
      if (delivered) {
        sent++
        if (!testMode) {
          // Record so we don't re-send. Ignore conflict (another run beat us).
          await supabase.from("notification_log").insert({ user_id: userId, dedupe_key: alert.dedupeKey })
        }
      }
    }
  }

  return json({ ok: true, users: byUser.size, sent, testMode })
})
