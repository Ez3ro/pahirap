// Streaks — two independent run-counters that reward consistent habits.
//
//   1. Tracking streak    — a day counts if you logged at least one transaction
//                           that day OR tapped "No spending today" (a no-spend
//                           mark). It's about SHOWING UP, not about the money.
//   2. Under-budget streak — a day counts if that day's discretionary spend
//                           (budget expenses; income and debt payments excluded)
//                           stayed at or under that day's daily allowance. A clean
//                           no-spend day passes trivially (₱0 ≤ allowance).
//
// Both are derived from the same raw inputs — transactions + explicit no-spend
// marks + the budget — so there's no separate "streak" counter to keep in sync.
// The ONLY thing we must persist is the no-spend marks: a day with zero
// transactions is indistinguishable from an untracked day otherwise, so an
// explicit mark is what lets the tracking streak survive a genuinely spend-free
// day. See supabase/20_no_spend_days.sql.
//
// All day bucketing is done in LOCAL time (new Date() / getFullYear()…), to match
// period.js and ring.js, which compare a transaction's `created_at` against local
// pay-day boundaries. Using UTC here would misfile late-evening spends.

import { startOfDay } from "./debts"
import { ringStats } from "./ring"

// A stable local-date key, "YYYY-MM-DD", from a Date. NOT toISOString() — that
// converts to UTC and can shift the day across midnight. Mirrors the hand-rolled
// formatter in debts.js so a tx at 23:00 files under its local calendar day.
export function dayKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

// The local-date key for a transaction, derived from its created_at timestamp.
export function txDayKey(t) {
  return dayKey(new Date(t.created_at))
}

// Step a "YYYY-MM-DD" key back one day, staying in local time (parse to a local
// Date, subtract a day, re-key). Avoids fragile string arithmetic across month
// and year ends — new Date(y, mo-1, d-1) normalises automatically.
function prevKey(key) {
  const [y, mo, d] = key.split("-").map(Number)
  return dayKey(new Date(y, mo - 1, d - 1))
}

// Set of local-date keys that have at least one transaction of ANY type. Income,
// debt payments and ordinary expenses all count as "tracked" — the tracking
// streak only cares that you engaged with the app that day.
function trackedDayKeys(transactions) {
  return new Set(transactions.map(txDayKey))
}

// Per-day status for the last `days` days (oldest first), each:
//   { key, tracked, spent, allowance, underBudget, noSpend, future }
// `allowance` is null when no budget is set (under-budget can't be judged). The
// current (in-progress) day is included; `future` is always false here but the
// flag exists so a calendar UI can grey out the rest of the current week.
export function dayStatuses(transactions, budgetLimits, noSpendKeys, periodFor, days = 30, today = new Date()) {
  const tracked = trackedDayKeys(transactions)
  const noSpend = noSpendKeys instanceof Set ? noSpendKeys : new Set(noSpendKeys || [])
  const todayKey = dayKey(today)

  // Build keys newest→oldest, then reverse to oldest-first for display.
  const keys = Array.from({ length: days }).reduce((acc) => {
    const last = acc.length ? acc[acc.length - 1] : todayKey
    acc.push(acc.length ? prevKey(last) : todayKey)
    return acc
  }, [])

  return keys
    .reverse()
    .map((key) => {
      const [y, mo, d] = key.split("-").map(Number)
      const dayStart = new Date(y, mo - 1, d)
      const isNoSpend = noSpend.has(key)
      const isTracked = tracked.has(key) || isNoSpend
      // Judge the day with the SAME daily ring the history strip shows, evaluated
      // as of that day — so the green/under days you SEE are exactly the days that
      // count for the streak. (Previously this used a whole-pool test that could
      // disagree with the ring, making the streak shorter than the strip implied.)
      const period = periodFor(dayStart)
      const ring = ringStats(transactions, budgetLimits, period, "daily", dayStart)
      const allowance = ring.hasBudget ? ring.allowance : null
      // Under budget when there's a daily budget to judge against and the day's
      // daily-ring spend stayed within it. A no-spend / ₱0 day passes.
      const underBudget = ring.hasBudget && !ring.over
      return { key, tracked: isTracked, spent: ring.spent, allowance, underBudget, noSpend: isNoSpend, future: key > todayKey }
    })
}

// Walk a day-keyed predicate backwards from today to find the CURRENT streak and
// the LONGEST streak in the window. The current day is "grace": if today doesn't
// yet satisfy the predicate it does NOT break the streak (the day's still going)
// — we just start counting from yesterday. Once today qualifies it's included.
//
// `qualifies(key)` → boolean. `todayPending` is true when today hasn't been
// DECIDED yet (the day's still open — no activity recorded), false once it has
// (you logged a spend / the day failed). Pure; no Date.now / Math.random here.
function streakStats(qualifies, todayKey, windowDays, todayPending) {
  // Current streak: today counts if it qualifies; otherwise skip today (grace) and
  // count consecutive qualifying days ending yesterday. Functional accumulation
  // via a recursive walk so we don't reassign a render-scope variable.
  function countFrom(key, acc) {
    return qualifies(key) ? countFrom(prevKey(key), acc + 1) : acc
  }
  // Grace only applies to an UNDECIDED today (day still in progress): start from
  // yesterday so an as-yet-empty today doesn't read as a break. But once today is
  // decided and DOESN'T qualify — e.g. you've already overspent — it's a genuine
  // break: the streak is 0, not yesterday's count. Without this, overspending
  // today would still show the streak as "1" (yesterday) instead of resetting.
  const start =
    qualifies(todayKey) ? todayKey
    : todayPending      ? prevKey(todayKey)
    : null // today decided & failed → no grace, streak ends here
  const current = start === null ? 0 : countFrom(start, 0)

  // Longest run anywhere in the window (today back windowDays). reduce keeps a
  // {run, longest, key} accumulator so nothing in render scope is mutated.
  const { longest } = Array.from({ length: windowDays }).reduce(
    (state) => {
      const run = qualifies(state.key) ? state.run + 1 : 0
      return { run, longest: Math.max(state.longest, run), key: prevKey(state.key) }
    },
    { run: 0, longest: 0, key: todayKey }
  )

  return { current, longest }
}

// The two streaks, plus the per-day status array for sparkline/calendar UIs.
// Returns:
//   tracking:    { current, longest }
//   underBudget: { current, longest }
//   days:        Array<dayStatus>  (oldest first, length `windowDays`)
//   hasBudget:   whether any limit is set (under-budget is meaningless without one)
export function streaks(transactions, budgetLimits, noSpendKeys, periodFor, windowDays = 60, today = new Date()) {
  const days = dayStatuses(transactions, budgetLimits, noSpendKeys, periodFor, windowDays, today)
  const byKey = new Map(days.map((s) => [s.key, s]))
  const todayKey = dayKey(today)
  const pool = budgetLimits.reduce((s, b) => s + (Number(b.monthly_limit) || 0), 0)

  // A day qualifies for the TRACKING streak if it was tracked (a tx or a no-spend
  // mark). A key outside the computed window (byKey miss) ends the walk.
  const trackedQ = (key) => byKey.get(key)?.tracked === true

  // A day qualifies for the UNDER-BUDGET streak only if it was actually TRACKED
  // (a transaction or a no-spend mark) AND its spend stayed within allowance. The
  // `tracked` guard matters: an untracked day has ₱0 spend, which is trivially
  // "under" any allowance, so without it every day before you started using the
  // app would count as a win and inflate the streak. No data ≠ a good day.
  const underQ = (key) => {
    const s = byKey.get(key)
    return s?.underBudget === true && s?.tracked === true
  }

  // Today is "pending" (the day's still open) only while it has NO activity yet —
  // no transaction and no no-spend mark. The moment you log something, today is
  // decided: it either keeps the streak (tracked / under budget) or breaks it
  // (e.g. overspent). So a tracked-but-over today must NOT be graced.
  const todayPending = byKey.get(todayKey)?.tracked !== true

  return {
    tracking: streakStats(trackedQ, todayKey, windowDays, todayPending),
    underBudget: streakStats(underQ, todayKey, windowDays, todayPending),
    days,
    hasBudget: pool > 0,
  }
}

// Has today already been accounted for — either a real transaction or an existing
// no-spend mark? Makes the "No spending today" button idempotent and decides
// whether to even offer it (only when the day is genuinely empty).
export function isTodayLogged(transactions, noSpendKeys, today = new Date()) {
  const key = dayKey(today)
  const noSpend = noSpendKeys instanceof Set ? noSpendKeys : new Set(noSpendKeys || [])
  if (noSpend.has(key)) return true
  return transactions.some((t) => txDayKey(t) === key)
}

// Whether to show the "No spending today" button: only when today has no
// transactions AND no existing no-spend mark, so the action is meaningful and the
// button is the single way to mark the day. startOfDay keeps it time-agnostic.
export function canMarkNoSpend(transactions, noSpendKeys, today = new Date()) {
  return !isTodayLogged(transactions, noSpendKeys, startOfDay(today))
}
