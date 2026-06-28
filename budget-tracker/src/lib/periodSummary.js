// Pay-period recap: "how did the last paycheck go?"
//
// One pure summary per pay period, used in three places — the Transactions list
// (a recap header on each period group), the Income page (under each recorded
// payday), and a dashboard banner when a new paycheck lands. Everything is derived
// from data already in the app; nothing is stored.
//
// Two lenses, because the user wanted both:
//   • BUDGET view  — spent vs the period's total budget (sum of fixed limits).
//                    over/under and "saved" (budget − spent) measure plan
//                    adherence, matching the fixed daily/weekly/monthly rings.
//   • CASH view    — income − spend − debt − lent = what's actually left of the
//                    paycheck. A truer "what stayed in the bank" figure.
// Each also has a per-DAY figure (÷ days in period) so you can see the daily pace.

import { startOfDay } from "./debts"
import { currentPeriod, daysInPeriod, daysRemaining } from "./period"
import {
  incomeForPeriod,
  spentDiscretionaryForPeriod,
  debtPaidForPeriod,
  debtDueForPeriod,
  lentOutForPeriod,
} from "./budgetPlan"

// The total budget FUNDED by a period. Budgets are set monthly; a month holds
// more than one paycheck, so a monthly budget contributes only its per-paycheck
// share (monthly ÷ paychecks in the month, carried on the period). Same figure
// the Dashboard budget bar uses — the money this paycheck actually provides.
function totalBudgetOf(budgetLimits, period) {
  // Every budget is MONTHLY; this period is funded its share (monthly ÷ paychecks
  // in the month). Cadence is only the view, so the split applies to all.
  const per = Math.max(1, period.paychecksPerMonth || 1)
  return budgetLimits.reduce((s, b) => s + (Number(b.monthly_limit) || 0) / per, 0)
}

// Build the recap for one period.
//   spent        — discretionary spend (debt excluded) in the period
//   budget       — total period budget
//   overBudget   — spent − budget when over (else 0)
//   savedBudget  — budget − spent when under (else 0)
//   income       — paycheck(s) recorded for the period
//   debtPaid     — debt payments made in the period
//   lentOut      — money lent out in the period
//   cashSaved    — income − spent − debtPaid − lentOut (negative = overspent pay)
//   days         — days in the period
//   per-day      — spentPerDay / budgetPerDay / savedPerDay (figures ÷ days)
//   isOverBudget / hasBudget
export function periodSummary(transactions, debts, loans, budgetLimits, period) {
  const spent = spentDiscretionaryForPeriod(transactions, period)
  const budget = totalBudgetOf(budgetLimits, period)
  const income = incomeForPeriod(transactions, period)
  const debtPaid = debtPaidForPeriod(transactions, period)
  const debtDue = debtDueForPeriod(debts, period)
  const lentOut = lentOutForPeriod(loans, period)
  const days = Math.max(1, daysInPeriod(period))

  const isOverBudget = budget > 0 && spent > budget
  const overBudget = isOverBudget ? spent - budget : 0
  const savedBudget = budget > 0 && spent < budget ? budget - spent : 0
  // Cash left of the paycheck: income minus everything that left your pocket.
  const cashSaved = income - spent - debtPaid - lentOut

  return {
    period,
    days,
    spent,
    budget,
    hasBudget: budget > 0,
    isOverBudget,
    overBudget,
    savedBudget,
    income,
    debtPaid,
    debtDue,
    lentOut,
    cashSaved,
    spentPerDay: spent / days,
    budgetPerDay: budget / days,
    savedPerDay: savedBudget / days,
  }
}

// Walk back `count` pay periods ending with the one `today` is in (newest first).
// Used to group the transaction history by period. Each returned period is the
// usual { start, end, payDay, label } from period.js.
export function recentPeriods(salarySettings, today = new Date(), count = 12) {
  const periods = []
  let cursor = startOfDay(today)
  for (let i = 0; i < count; i++) {
    const period = currentPeriod(cursor, salarySettings)
    periods.push(period)
    // Hop to the day before this period's start → the previous period.
    const before = new Date(period.start)
    before.setDate(before.getDate() - 1)
    cursor = startOfDay(before)
  }
  return periods
}

// Runway: will the cash from THIS paycheck last until the next one? This is the
// safety net the fixed budget deliberately doesn't provide — the budget stays
// fixed and honest (it never silently shrinks), and this WARNS instead when your
// spending pace is on track to run you dry before payday.
//
//   cashLeft   — income this period − (spend + debt paid + lent) so far
//   daysLeft   — days from today to the next payday (inclusive)
//   safePerDay — cashLeft ÷ daysLeft (what you can spend/day and still make it)
//   recentPerDay — your actual spend pace so far this period (spend ÷ days elapsed)
//   willRunShort — recentPerDay > safePerDay AND cashLeft > 0 (pace outruns cash)
//   shortfallDay — roughly how many days before payday you'd run out at this pace
// Returns { hasIncome, cashLeft, daysLeft, safePerDay, recentPerDay, willRunShort,
//           daysCovered, shortBy } — or hasIncome:false when no paycheck recorded.
export function runwayStatus(transactions, debts, loans, period, today = new Date()) {
  const income = incomeForPeriod(transactions, period)
  if (income <= 0) return { hasIncome: false }

  const spent = spentDiscretionaryForPeriod(transactions, period)
  const debtPaid = debtPaidForPeriod(transactions, period)
  const lentOut = lentOutForPeriod(loans, period)
  const cashLeft = income - spent - debtPaid - lentOut

  const totalDays = Math.max(1, daysInPeriod(period))
  const daysLeft = daysRemaining(period, today) // clamped ≥ 1
  const daysElapsed = Math.max(1, totalDays - daysLeft + 1)

  const safePerDay = cashLeft / daysLeft
  const recentPerDay = spent / daysElapsed
  // How many more days the remaining cash covers at your recent pace.
  const daysCovered = recentPerDay > 0 ? Math.floor(cashLeft / recentPerDay) : daysLeft
  const willRunShort = cashLeft > 0 && recentPerDay > safePerDay
  const shortBy = Math.max(0, daysLeft - daysCovered)

  return {
    hasIncome: true,
    cashLeft,
    daysLeft,
    safePerDay,
    recentPerDay,
    daysCovered,
    willRunShort: willRunShort && shortBy > 0,
    // Already out of cash before payday.
    alreadyShort: cashLeft <= 0 && daysLeft > 0,
    shortBy,
  }
}

// Cumulative surplus KEPT across recorded paychecks — the sum of each period's
// cashSaved (income − debt − lent − actual spend). Only periods you actually got
// paid for (income recorded) count, so unpaid/skipped paydays don't drag it. This
// is the "savings building up period over period" figure. `periods` is a list of
// period objects (e.g. from recentPeriods); we total the surplus of the ones with
// income. Returns { total, periodsCounted }.
export function cumulativeSurplus(transactions, debts, loans, budgetLimits, periods) {
  return periods.reduce(
    (acc, period) => {
      const s = periodSummary(transactions, debts, loans, budgetLimits, period)
      if (s.income <= 0) return acc // skip periods with no paycheck recorded
      return { total: acc.total + s.cashSaved, periodsCounted: acc.periodsCounted + 1 }
    },
    { total: 0, periodsCounted: 0 }
  )
}

// Which period a transaction belongs to, as a stable key "YYYY-MM-DD" of the
// period start. Lets the Transactions list bucket rows without re-running
// currentPeriod for every row.
export function periodKey(period) {
  const d = startOfDay(period.start)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
