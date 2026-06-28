// Budget rings, one per cadence (daily / weekly / monthly).
//
// Each category is budgeted at a cadence you choose (food daily, bills monthly,
// etc.). A category's limit is its POOL for the whole pay-day period. A ring is
// scoped to ONE cadence and shows the safe spending PACE so the pool lasts until
// the next paycheck:
//   • daily   — allowance = remaining pool ÷ days left;  spent = today
//   • weekly  — allowance = remaining pool ÷ weeks left; spent = this week
//   • monthly — allowance = the whole pool;              spent = this period
//
// So "Food ₱4,000 daily" means ₱4,000 for food until payday, and the daily ring
// tells you roughly how much you can spend today. Overspend and the pace tightens.

import { startOfDay } from "./debts"
import { windowsInPeriod } from "./period"
import { isDebtPayment } from "./categories"

// Money that counts against the budget: expenses that aren't debt payments.
export function isBudgetExpense(t) {
  return t.type === "expense" && !isDebtPayment(t)
}

// Monday at 00:00 of the calendar week `date` falls in. Weeks are Mon–Sun (JS
// getDay() is 0=Sun..6=Sat, so Sunday maps back 6 days, Monday 0). Used so the
// weekly ring reads as a fixed calendar week rather than a rolling 7 days.
export function startOfWeek(date) {
  const d = startOfDay(date)
  const dow = d.getDay() // 0=Sun … 6=Sat
  const backToMonday = (dow + 6) % 7 // Sun→6, Mon→0, Tue→1, …
  d.setDate(d.getDate() - backToMonday)
  return d
}

// The [start, end] window for a cadence, and a friendly label:
//   daily   — today
//   weekly  — this CALENDAR week (Monday → today), clamped to the pay period
//   monthly — the whole pay-day period
export function windowFor(cadence, period, today = new Date()) {
  const startToday = startOfDay(today)
  const end = new Date(startToday.getFullYear(), startToday.getMonth(), startToday.getDate(), 23, 59, 59)

  if (cadence === "monthly") {
    return { start: period.start, end, label: "this period" }
  }
  if (cadence === "weekly") {
    // Fixed Monday–Sunday calendar week containing `today`.
    const weekStart = startOfWeek(startToday)
    // Don't reach back past the start of the pay period: spend before payday was
    // funded by the previous paycheck and belongs to that period's budget, so
    // counting it under "this week" would double it against this period's pool.
    const start = weekStart < period.start ? new Date(period.start) : weekStart
    return { start, end, label: "this week" }
  }
  return { start: startToday, end, label: "today" } // daily
}

// Which budgeted categories a ring's MATH covers. The monthly ring is the whole-
// period overview, so it totals every category. The daily/weekly rings track only
// their OWN cadence, so each ring's pace % stays meaningful — mixing a daily pool
// into the weekly pace would distort it and mask an overspend.
function catsForRing(budgetLimits, cadence) {
  if (cadence === "monthly") return budgetLimits
  return budgetLimits.filter((b) => (b.cadence || "monthly") === cadence)
}

// Categories budgeted at a FINER cadence than this ring — listed beneath it for
// reference, but kept OUT of the ring's pool/allowance/percentage. So a daily
// category shows under the weekly ring without diluting its weekly pace. Nothing
// is finer than daily, and the monthly ring already totals everything.
const CADENCE_RANK = { daily: 0, weekly: 1, monthly: 2 }
function finerCats(budgetLimits, cadence) {
  if (cadence === "monthly") return []
  const ringRank = CADENCE_RANK[cadence] ?? 2
  return budgetLimits.filter((b) => (CADENCE_RANK[b.cadence] ?? 2) < ringRank)
}

// Per-category rows for a ring, at a FIXED per-window budget. A category's limit
// is its total for the whole period; the per-window allowance is that limit spread
// evenly across the windows the period contains (₱/day = limit ÷ days in period).
// `divisor` is windowsInPeriod for the ring's cadence — the SAME for every day of
// the period, so the allowance never moves and never reacts to spending. `spent`
// is this window's spend, `left` what's still spendable this window (negative =
// over), `over` stable because the allowance is fixed.
function buildRows(transactions, cats, win, divisor, period) {
  const windowSpent = {}
  for (const t of transactions) {
    if (!isBudgetExpense(t) || !t.category) continue
    const d = new Date(t.created_at)
    if (d >= win.start && d <= win.end) windowSpent[t.category] = (windowSpent[t.category] || 0) + (Number(t.amount) || 0)
  }

  return cats
    .map((b) => {
      // `limit` here is what this PERIOD is funded (monthly budget ÷ paychecks),
      // not the raw monthly figure, so the per-window allowance never exceeds the
      // money this paycheck actually provides.
      const limit = fundedLimit(b, period)
      const spent = windowSpent[b.category] || 0
      const allowance = limit / divisor // fixed per-window budget (no re-tightening)
      const left = allowance - spent
      const pct = allowance > 0 ? Math.min(100, Math.round((spent / allowance) * 100)) : spent > 0 ? 100 : 0
      return { category: b.category, cadence: b.cadence || "monthly", limit, spent, allowance, left, over: limit > 0 && left < 0, pct }
    })
    .filter((r) => r.limit > 0 || r.spent > 0)
    .sort((a, b) => b.spent - a.spent)
}

// A category's budget FUNDED by this pay period. EVERY budget amount is a MONTHLY
// figure (cadence is only the ring you VIEW it in, not what the number means). A
// month holds more than one paycheck, so only this period's share is spendable now
// — the rest arrives with the next paycheck. Dividing the monthly budget by
// paychecks-per-month is what stops the rings from showing money you haven't been
// paid yet. The cadence does NOT change this; it only decides how this funded
// amount is later spread into a daily/weekly window (the divisor in ringStats).
function fundedLimit(b, period) {
  const limit = Number(b.monthly_limit) || 0
  return limit / Math.max(1, period.paychecksPerMonth || 1)
}

// Sum spend in a set of categories over [start, end].
function sumSpend(transactions, catNames, start, end) {
  let total = 0
  for (const t of transactions) {
    if (!isBudgetExpense(t) || !catNames.has(t.category)) continue
    const d = new Date(t.created_at)
    if (d >= start && d <= end) total += Number(t.amount)
  }
  return total
}

// Stats for one cadence's ring, as a FIXED per-window budget (no adaptive pace).
// A category's limit is its total for the whole period; the per-window allowance
// is that pool spread evenly across the windows the period contains:
//   daily   — pool ÷ days in period   (same every day, e.g. ₱4,000 ÷ 15 = ₱266/day)
//   weekly  — pool ÷ weeks in period
//   monthly — the whole pool          (one window)
// Crucially the divisor uses the period's TOTAL days/weeks (not days LEFT) and
// ignores spending, so the allowance is the same all period and a past window's
// over/under verdict never flips — that's the "fixed budget" you wanted.
//   allowance     — the fixed budget for one window of this cadence
//   spent          — spend in this window (today / this week / this period)
//   pool          — the cadence's whole-period budget (sum of its limits)
//   poolSpent     — spend in those categories across the WHOLE period so far
//   poolRemaining — pool − poolSpent (what's left of the period's total)
//   usedPct / remaining / over / hasBudget / label / rows
export function ringStats(transactions, budgetLimits, period, cadence, today = new Date()) {
  const win = windowFor(cadence, period, today)
  const cats = catsForRing(budgetLimits, cadence)
  const catNames = new Set(cats.map((b) => b.category))

  // The pool FUNDED by this period for this cadence (a monthly budget contributes
  // only its per-paycheck share), and the FIXED divisor = number of this cadence's
  // windows in the period. Same all period, independent of spending — so the
  // per-window allowance never moves and never exceeds this paycheck's money.
  const pool = cats.reduce((s, b) => s + fundedLimit(b, period), 0)
  const divisor = windowsInPeriod(cadence, period)
  const allowance = pool / divisor

  const periodEnd = new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate(), 23, 59, 59)
  const spent = sumSpend(transactions, catNames, win.start, win.end)
  const poolSpent = sumSpend(transactions, catNames, period.start, periodEnd)
  const poolRemaining = Math.max(0, pool - poolSpent)

  const hasBudget = pool > 0
  const usedPct = hasBudget && allowance > 0 ? Math.min(100, Math.round((spent / allowance) * 100)) : 0

  return {
    cadence,
    label: win.label,
    pool,
    poolSpent,
    poolRemaining,
    allowance,
    spent,
    usedPct,
    remaining: allowance - spent,
    over: hasBudget && allowance > 0 && spent > allowance,
    hasBudget,
    rows: buildRows(transactions, cats, win, divisor, period),
    // Finer-cadence categories shown beneath the ring, spread at THIS ring's
    // cadence too (so a daily category reads as a weekly figure under the weekly
    // ring), using the same fixed divisor.
    extraRows: buildRows(transactions, finerCats(budgetLimits, cadence), win, divisor, period),
  }
}

// Convenience kept for callers that want the daily ring directly.
export function dailyRingStats(transactions, budgetLimits, period, today = new Date()) {
  return ringStats(transactions, budgetLimits, period, "daily", today)
}
