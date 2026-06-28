// Pay-day periods.
//
// You get paid twice a month. A "period" runs from one payday up to (but not
// including) the next one, so the money from each paycheck is budgeted against
// the days it has to last. With the default paydays (5th and 20th):
//
//   - the 5th  starts a period that runs  5th → 19th  (same month)
//   - the 20th starts a period that runs 20th → 4th   (into the NEXT month)
//
// The two paydays are configurable (Salary settings). These helpers are shared by
// the Budget and Dashboard views so the boundary logic lives in one place.
// Everything is plain Date math (no time-of-day) to match the rest of the app.

import { startOfDay } from "./debts"

// Default paydays if the user hasn't set their own.
const DEFAULT_PAYDAYS = [5, 20]

// Clamp a day-of-month to a real date in the given month (e.g. the 31st in Feb
// becomes the 28th/29th), so a payday of 31 still works every month.
function dateOnDay(year, monthIndex, day) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(day, lastDay))
}

// Pull the paydays out of salary settings, falling back to 5th & 20th only when
// none are set. One valid payday is fine — it just means a single monthly period;
// two give the usual twice-monthly split. De-duplicated and sorted ascending so
// the period maths is predictable.
export function paydaysFromSettings(settings) {
  const raw = [settings?.payday_b, settings?.payday_a]
    .map((d) => Number(d))
    .filter((d) => Number.isFinite(d) && d >= 1 && d <= 31)
  const days = raw.length > 0 ? raw : DEFAULT_PAYDAYS
  return [...new Set(days)].sort((a, b) => a - b)
}

// The period that `today` falls inside, as { start, end, payDay, label }.
//   start    — midnight on the payday that opened the period
//   end       — midnight on the day BEFORE the next payday (last day of the period)
//   payDay    — the day-of-month this period is funded by
//   label     — e.g. "5th → 20th", for headers
export function currentPeriod(today, settings) {
  const paydays = paydaysFromSettings(settings)
  const ref = startOfDay(today)
  const y = ref.getFullYear()
  const m = ref.getMonth()

  // Build every payday from last month through next month, in order, then find
  // the latest one that's on or before today — that's the start of our period.
  // The one after it is the next payday (end = day before it).
  const candidates = []
  for (let offset = -1; offset <= 1; offset++) {
    for (const day of paydays) {
      candidates.push(dateOnDay(y, m + offset, day))
    }
  }
  candidates.sort((a, b) => a - b)

  let start = candidates[0]
  let nextStart = candidates[candidates.length - 1]
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i] <= ref) {
      start = candidates[i]
      nextStart = candidates[i + 1] ?? nextStart
    }
  }

  // Last day of the period is the day before the next payday.
  const end = new Date(nextStart)
  end.setDate(end.getDate() - 1)

  return {
    start,
    end,
    payDay: start.getDate(),
    label: `${ordinal(start.getDate())} → ${ordinal(nextStart.getDate())}`,
    // How many paychecks fund the month this period sits in. Carried on the period
    // so ring/summary math can split a MONTHLY budget across paychecks (this
    // period's share = monthly ÷ this) without re-threading settings everywhere.
    paychecksPerMonth: Math.max(1, paydays.length),
  }
}

// 1 -> "1st", 2 -> "2nd", 20 -> "20th", etc.
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Inclusive count of days in a period (used to spread a budget into a daily allowance).
export function daysInPeriod(period) {
  const ms = startOfDay(period.end) - startOfDay(period.start)
  return Math.round(ms / 86400000) + 1
}

// How many weeks a period is worth for BUDGETING — i.e. the divisor that turns a
// funded period amount into a weekly figure. We round to the nearest whole week
// (15 days → round(2.14) = 2 weeks), not ceil, so a ~2-week paycheck reads as
// 2 weeks: ₱2,000 funded ÷ 2 = ₱1,000/week, matching how you think of it. (ceil
// gave 3 → ₱666/week, which was the surprising result.) Clamped to ≥1 for very
// short periods.
export function weeksInPeriod(period) {
  return Math.max(1, Math.round(daysInPeriod(period) / 7))
}

// How many windows of a given cadence a period contains: daily → days in period,
// weekly → weeks in period, monthly → 1. The ring divides a category's period
// limit by this to get a FIXED per-window budget (₱/day = pool ÷ days in period),
// which stays the same all period and never reacts to spending.
export function windowsInPeriod(cadence, period) {
  if (cadence === "daily") return daysInPeriod(period)
  if (cadence === "weekly") return weeksInPeriod(period)
  return 1 // monthly — the limit already IS the whole-period budget
}

// How many paychecks land in a month — i.e. how many distinct paydays you've
// configured. A MONTHLY budget is funded across these, so each pay period only
// gets its share. With the default 5th & 20th that's 2; one payday set = 1.
export function paychecksPerMonth(settings) {
  return Math.max(1, paydaysFromSettings(settings).length)
}

// The portion of a budget that THIS pay period is funded by. EVERY budget amount
// is a MONTHLY figure (the cadence is only which ring you VIEW it in, not what the
// number means). A month has more than one paycheck, so this period is funded only
// its share — the rest arrives with the next paycheck and isn't spendable yet.
// This is what stops a budget from letting you spend money you haven't been paid.
//   funded this period = monthly amount ÷ paychecks per month
// The `cadence` arg is intentionally ignored here — cadence affects only how this
// funded amount is later spread into a daily/weekly window (see windowsInPeriod).
export function fundedThisPeriod(limit, _cadence, settings) {
  return (Number(limit) || 0) / paychecksPerMonth(settings)
}

// Days left in the period counting today (today through the last day, inclusive).
// Used to spread the money you have left across the days it still has to cover —
// so a daily allowance re-tightens as the period runs down.
export function daysRemaining(period, today = new Date()) {
  const ms = startOfDay(period.end) - startOfDay(today)
  return Math.max(1, Math.round(ms / 86400000) + 1)
}

// Is a "YYYY-MM-DD" date string inside the period? Compared as plain dates so the
// time zone never shifts the day.
export function isISOInPeriod(iso, period) {
  if (!iso) return false
  const [y, mo, d] = iso.split("-").map(Number)
  const date = new Date(y, mo - 1, d)
  return date >= startOfDay(period.start) && date <= startOfDay(period.end)
}

// Is a Date (e.g. a transaction's created_at) inside the period? End is pushed to
// the last moment of its day so a transaction logged at 11pm still counts.
export function isDateInPeriod(date, period) {
  const endOfLastDay = new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate(), 23, 59, 59)
  return date >= period.start && date <= endOfLastDay
}
