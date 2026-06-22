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

// Which budgeted categories a ring covers. Daily/weekly rings cover only their
// own cadence; the MONTHLY ring is the whole-period view, so it covers ALL
// categories regardless of cadence.
function catsForRing(budgetLimits, cadence) {
  if (cadence === "monthly") return budgetLimits
  return budgetLimits.filter((b) => (b.cadence || "monthly") === cadence)
}

// Per-category rows for one cadence's window: each category the ring covers with
// its spend vs its own limit. (No cross-cadence normalisation — the limit is
// taken as-is, so Food's ₱4,000 stays ₱4,000.)
export function categoryRows(transactions, budgetLimits, cadence, windowStart, windowEnd) {
  const cats = catsForRing(budgetLimits, cadence)

  const spentByCat = {}
  for (const t of transactions) {
    if (!isBudgetExpense(t) || !t.category) continue
    const d = new Date(t.created_at)
    if (d >= windowStart && d <= windowEnd) {
      spentByCat[t.category] = (spentByCat[t.category] || 0) + Number(t.amount)
    }
  }

  return cats
    .map((b) => {
      const limit = Number(b.monthly_limit) || 0
      const spent = spentByCat[b.category] || 0
      const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0
      // Carry the category's OWN cadence (not the ring's), so the monthly ring can
      // tag each row with how it's actually budgeted.
      return { category: b.category, cadence: b.cadence || "monthly", spent, allotment: limit, pct, over: limit > 0 && spent > limit }
    })
    .filter((r) => r.allotment > 0 || r.spent > 0)
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

  // Allowance is the pace for this window so the remaining pool lasts to payday.
  const daysLeft = daysRemaining(period, today)
  let allowance
  if (cadence === "monthly") {
    allowance = pool // the whole period IS the month here
  } else if (cadence === "weekly") {
    const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7))
    allowance = poolRemaining / weeksLeft
  } else {
    allowance = poolRemaining / daysLeft // daily
  }

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
    rows: categoryRows(transactions, budgetLimits, cadence, win.start, win.end),
  }
}

// Convenience kept for callers that want the daily ring directly.
export function dailyRingStats(transactions, budgetLimits, period, today = new Date()) {
  return ringStats(transactions, budgetLimits, period, "daily", today)
}
