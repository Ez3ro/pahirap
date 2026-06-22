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
import { daysRemaining } from "./period"
import { isDebtPayment } from "./categories"

// Money that counts against the budget: expenses that aren't debt payments.
export function isBudgetExpense(t) {
  return t.type === "expense" && !isDebtPayment(t)
}

// The [start, end] window for a cadence, and a friendly label:
//   daily   — today
//   weekly  — the last 7 days (rolling)
//   monthly — the whole pay-day period
export function windowFor(cadence, period, today = new Date()) {
  const startToday = startOfDay(today)
  const end = new Date(startToday.getFullYear(), startToday.getMonth(), startToday.getDate(), 23, 59, 59)

  if (cadence === "monthly") {
    return { start: period.start, end, label: "this period" }
  }
  if (cadence === "weekly") {
    const rollingStart = new Date(startToday)
    rollingStart.setDate(rollingStart.getDate() - 6) // last 7 days inclusive
    // Don't reach back past the start of the pay period: spend before payday was
    // funded by the previous paycheck and belongs to that period's budget, so
    // counting it under "this week" would double it against this period's pool.
    const start = rollingStart < period.start ? new Date(period.start) : rollingStart
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

// How many cadence-windows are left in the period, used to spread a remaining pool
// into a per-window pace. weekly → whole weeks left; daily → days left; monthly →
// 1 (the whole period is one window).
function windowsLeft(cadence, period, today) {
  const daysLeft = daysRemaining(period, today)
  if (cadence === "weekly") return Math.max(1, Math.ceil(daysLeft / 7))
  if (cadence === "daily") return Math.max(1, daysLeft)
  return 1 // monthly
}

// Per-category rows for a ring. Every category — whether budgeted at the ring's own
// cadence or a finer one — is shown AT THE RING'S cadence: its limit becomes a
// per-window allowance, so a daily Food reads as a weekly figure inside the weekly
// ring. `spent` is this window's spend, `allowance` the per-window budget, and
// `left` what's still spendable this window (negative = over the pace).
function buildRows(transactions, cats, cadence, period, periodEnd, win, divisor) {
  const periodSpent = {}
  const windowSpent = {}
  for (const t of transactions) {
    if (!isBudgetExpense(t) || !t.category) continue
    const d = new Date(t.created_at)
    const amt = Number(t.amount) || 0
    if (d >= period.start && d <= periodEnd) periodSpent[t.category] = (periodSpent[t.category] || 0) + amt
    if (d >= win.start && d <= win.end) windowSpent[t.category] = (windowSpent[t.category] || 0) + amt
  }

  return cats
    .map((b) => {
      const limit = Number(b.monthly_limit) || 0
      const spent = windowSpent[b.category] || 0
      // This window's budget for the category: limit minus what was spent EARLIER in
      // the period, spread across the windows left. (Monthly → divisor 1 → the whole
      // limit.) Excluding this window's own spend keeps spent vs allowance coherent.
      const allowance = Math.max(0, limit - ((periodSpent[b.category] || 0) - spent)) / divisor
      const left = allowance - spent
      const pct = allowance > 0 ? Math.min(100, Math.round((spent / allowance) * 100)) : spent > 0 ? 100 : 0
      return { category: b.category, cadence: b.cadence || "monthly", limit, spent, allowance, left, over: limit > 0 && left < 0, pct }
    })
    .filter((r) => r.limit > 0 || r.spent > 0)
    .sort((a, b) => b.spent - a.spent)
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

// Stats for one cadence's ring, as a spending PACE.
//   pool          — the cadence's total budget for the period (sum of limits)
//   poolSpent     — spend in those categories across the WHOLE period so far
//   poolRemaining — pool − poolSpent (what's left to last until payday)
//   allowance     — the pace for this window (daily: remaining ÷ days left, etc.)
//   spent          — spend in this window (today / this week / this period)
//   usedPct / remaining / over / hasBudget / label / rows
export function ringStats(transactions, budgetLimits, period, cadence, today = new Date()) {
  const win = windowFor(cadence, period, today)
  const cats = catsForRing(budgetLimits, cadence)
  const pool = cats.reduce((s, b) => s + (Number(b.monthly_limit) || 0), 0)
  const catNames = new Set(cats.map((b) => b.category))

  // Spend across the whole period (for the remaining pool) and in the window.
  const periodEnd = new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate(), 23, 59, 59)
  const poolSpent = sumSpend(transactions, catNames, period.start, periodEnd)
  const poolRemaining = Math.max(0, pool - poolSpent)
  const spent = sumSpend(transactions, catNames, win.start, win.end)

  // This window's budget: spread what was available at the START of the window —
  // the pool minus spending from EARLIER in the period — across the windows left.
  // Adding this window's own spend back (pool − (poolSpent − spent)) avoids
  // double-counting it, so the figures reconcile (spent vs allowance) while staying
  // adaptive: overspending an earlier week still shrinks the later weeks.
  const divisor = windowsLeft(cadence, period, today)
  const available = Math.max(0, pool - (poolSpent - spent))
  const allowance = available / divisor

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
    rows: buildRows(transactions, cats, cadence, period, periodEnd, win, divisor),
    // Finer-cadence categories shown beneath the ring, at this ring's cadence too.
    extraRows: buildRows(transactions, finerCats(budgetLimits, cadence), cadence, period, periodEnd, win, divisor),
  }
}

// Convenience kept for callers that want the daily ring directly.
export function dailyRingStats(transactions, budgetLimits, period, today = new Date()) {
  return ringStats(transactions, budgetLimits, period, "daily", today)
}
