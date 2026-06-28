// Spending history — Apple-Fitness-style closing rings for PAST windows.
//
// The live rings (ring.js) answer "what's my safe pace for TODAY / THIS week /
// THIS period?". History answers the retrospective question: "how did each of
// the last N days / weeks / months actually go against its budget?" — one ring
// per past window you can scrub through, like Activity's day-by-day history.
//
// Each point is { label, spent, allowance, pct, over, start, end }:
//   spent     — discretionary spend (budget expenses, debt excluded) in the window
//   allowance — the budget that window was meant to fit inside
//   pct       — spent / allowance, 0–100 (or >100 conceptually; callers cap)
//   over      — true when spent exceeded the allowance
//
// "Closed ring" = spent met the allowance. Over fills the ring and wraps a red
// outer arc (BudgetRing's overflow), exactly like the live rings.
//
// Design choices that keep this PURE and reconcilable:
//   • `today` is always passed in (never Date.now here) so it's deterministic and
//     testable, matching ring.js's signature.
//   • A window's spend + allowance come straight from ring.js's `ringStats`,
//     evaluated AS OF that window's date. So a past day's allowance is exactly the
//     adaptive daily pace the live "Today" ring showed that day (remaining pool ÷
//     days left to payday, re-tightening as you overspend earlier in the period),
//     the past week matches the live weekly ring, etc. History is therefore a true
//     record of the SAME numbers you saw live — not a second, flatter formula that
//     disagrees with the dashboard. Each cadence is scoped exactly as ring.js
//     scopes it (daily/weekly to their own-cadence categories, monthly to the
//     whole pool), so big monthly bills don't smear into the daily allowance.
//   • The budget (budgetLimits) is taken as today's for every past window — we
//     don't store historical limits, so this treats your current budget as the
//     yardstick throughout ("how would the last 8 weeks look against what I budget
//     now?"). Stable and intuitive.

import { startOfDay } from "./debts"
import { ringStats, startOfWeek } from "./ring"
import { currentPeriod } from "./period"

// ── Date helpers (plain local-date maths, no time zone shifts) ─────────────────

// Midnight at the START of the day `n` days before `from` (n>0 = past).
function dayMinus(from, n) {
  const d = startOfDay(from)
  d.setDate(d.getDate() - n)
  return d
}

// The last moment of a day, so an expense logged at 23:00 still counts in it.
function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

// Total budget pool across all categories (the monthly_limit is the per-period
// pool, same convention ring.js uses). Pure sum, no cadence filtering: history
// rings are whole-budget overviews, like ring.js's monthly ring.
function poolOf(budgetLimits) {
  return budgetLimits.reduce((s, b) => s + (Number(b.monthly_limit) || 0), 0)
}

// The earliest transaction's start-of-day, or null if there are none. History
// shouldn't show windows BEFORE you started using the app — those are phantom
// "₱0 of budget → under" days that were never real. Every history builder clamps
// to this so the oldest ring/row is your first day of data, not an arbitrary
// count of empty days before it. Any transaction type counts as "you were here".
function firstActivityDay(transactions) {
  let earliest = null
  for (const t of transactions) {
    const d = startOfDay(new Date(t.created_at))
    if (earliest === null || d < earliest) earliest = d
  }
  return earliest
}

// Build a point by delegating to ring.js's `ringStats` for a given cadence,
// evaluated AS OF `refDate` — so the spend/allowance/over are identical to what
// the live ring of that cadence showed (or would have shown) on that date. This
// is what keeps history and the dashboard rings in lock-step. `start`/`end` are
// the display range for the detail rows (the builder computes them; ringStats
// derives its own window internally from refDate).
function pointFromRing(label, start, end, refDate, transactions, budgetLimits, salarySettings, cadence) {
  const period = currentPeriod(refDate, salarySettings)
  const r = ringStats(transactions, budgetLimits, period, cadence, refDate)
  return { label, start, end, spent: r.spent, allowance: r.allowance, pct: r.usedPct, over: r.over }
}

// ── Per-day history ────────────────────────────────────────────────────────────
//
// The last `count` days ending today (today last). A day's allowance is the
// pool of the PERIOD that day falls in, spread across that period's days — so a
// day inside a 15-day period and a day inside a 16-day period get slightly
// different daily allowances, which is correct (the same pool, more days).
export function dailyHistory(transactions, budgetLimits, salarySettings, today = new Date(), count = 14) {
  const base = startOfDay(today)
  const firstDay = firstActivityDay(transactions)
  // Oldest first so the scrubber reads left-to-right as time moving forward.
  // Drop any day before your first-ever transaction — those were never real.
  return Array.from({ length: count }, (_, i) => count - 1 - i)
    .map((back) => {
      const dayStart = dayMinus(base, back)
      const label = dayStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      // Delegate to the live daily ring AS OF this day — same adaptive pace
      // (remaining pool ÷ days left to payday) the dashboard "Today" ring shows.
      const point = pointFromRing(label, dayStart, endOfDay(dayStart), dayStart, transactions, budgetLimits, salarySettings, "daily")
      return { point, dayStart }
    })
    .filter((x) => firstDay === null || x.dayStart >= firstDay)
    .map((x) => x.point)
}

// ── Per-week history (fixed Monday–Sunday calendar weeks) ──────────────────────
//
// Each "week" is a fixed Mon–Sun calendar week, evaluated through the live WEEKLY
// ring as of that week's last day — so it matches the dashboard weekly ring (also
// Mon–Sun now). We anchor to each week's Monday and step back 7 days at a time.
// The reference day handed to ringStats is the week's SUNDAY (its full window),
// except the CURRENT week, where we clamp to today so it shows spend-so-far. The
// label is "week of <Monday>". We drop weeks ending before your first transaction.
export function weeklyHistory(transactions, budgetLimits, salarySettings, today = new Date(), count = 8) {
  const base = startOfDay(today)
  const thisMonday = startOfWeek(base)
  const firstDay = firstActivityDay(transactions)

  return Array.from({ length: count }, (_, i) => count - 1 - i)
    .map((back) => {
      const monday = dayMinus(thisMonday, back * 7)
      const sunday = dayMinus(monday, -6) // monday + 6 days
      // Past weeks use their Sunday (full week); the current week uses today.
      const refDay = sunday < base ? sunday : base
      const label = monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      const point = pointFromRing(label, monday, endOfDay(sunday), refDay, transactions, budgetLimits, salarySettings, "weekly")
      return { point, sunday }
    })
    // Drop weeks that ended before your first transaction — phantom data.
    .filter((x) => firstDay === null || x.sunday >= firstDay)
    .map((x) => x.point)
}

// ── Per-month history (pay periods) ────────────────────────────────────────────
//
// One ring per pay PERIOD (payday-to-payday), which is what "monthly" means in
// this app — with twice-monthly paydays you get two periods a calendar month,
// each its own ring. Allowance is the whole period pool (the monthly cadence
// uses the pool directly). We walk back `count` periods from today.
export function monthlyHistory(transactions, budgetLimits, salarySettings, today = new Date(), count = 6) {
  const base = startOfDay(today)
  const firstDay = firstActivityDay(transactions)

  const periods = []
  let cursor = base
  for (let i = 0; i < count; i++) {
    const period = currentPeriod(cursor, salarySettings)
    const pStart = startOfDay(period.start)
    const pEndDay = startOfDay(period.end)
    // Stop once we've walked back past your first-ever transaction — earlier
    // periods are phantom (₱0 of budget) windows from before you used the app.
    if (firstDay !== null && pEndDay < firstDay) break
    // Evaluate the live monthly ring AS OF this period. For a PAST period that's
    // its last day (full window); for the CURRENT period it's today, so the ring
    // reflects spend-so-far rather than a phantom full window. ringStats's
    // monthly window is [period.start, refDay], matching the dashboard exactly.
    const refDay = pEndDay < base ? pEndDay : base
    const point = pointFromRing(period.label, pStart, endOfDay(refDay), refDay, transactions, budgetLimits, salarySettings, "monthly")
    periods.push(point)
    // Hop to the period before this one.
    cursor = dayMinus(pStart, 1)
  }

  return periods.reverse() // oldest-first
}

// ── One call for all three cadences ────────────────────────────────────────────
//
// Convenience for the History page / dashboard block: returns the three arrays
// plus the "latest" point of each (the live-ish window) so a caller can show a
// headline without re-deriving it. Counts are tunable per cadence.
export function spendingHistory(transactions, budgetLimits, salarySettings, today = new Date(), counts = {}) {
  const daily = dailyHistory(transactions, budgetLimits, salarySettings, today, counts.daily ?? 14)
  const weekly = weeklyHistory(transactions, budgetLimits, salarySettings, today, counts.weekly ?? 8)
  const monthly = monthlyHistory(transactions, budgetLimits, salarySettings, today, counts.monthly ?? 6)
  return {
    daily,
    weekly,
    monthly,
    latest: {
      daily: daily[daily.length - 1] ?? null,
      weekly: weekly[weekly.length - 1] ?? null,
      monthly: monthly[monthly.length - 1] ?? null,
    },
    hasBudget: poolOf(budgetLimits) > 0,
  }
}

// Green under / amber near-limit / red over — the single source of truth for a
// history ring's colour, mirroring BudgetRing's simple-mode thresholds so the
// history rings read identically to the budget rings.
export function historyRingColor(pct, over) {
  if (over || pct >= 90) return "#ef4444" // red-500
  if (pct >= 70) return "#f59e0b" // amber-500
  return "#22c55e" // green-500
}
