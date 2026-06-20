// Salary is paid semi-monthly. The two paydays default to the 5th and the 20th
// but are configurable in Salary settings:
//   - period A (period_a_amount) lands on payday_a — the later day  (default 20th)
//   - period B (period_b_amount) lands on payday_b — the earlier day (default 5th)
//
// These helpers figure out which payday is most recently due and which is next,
// so the Income screen can nudge you to record a paycheck. Paydays are described
// by their date (e.g. "the 5th"), not by the pay period they cover.

// How many days before a payday you can record it in advance — covers pay that
// lands early (a few days to a week before the official payday).
const RECORD_LEAD_DAYS = 7

function isoDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// 1 -> "the 1st", 5 -> "the 5th", 20 -> "the 20th".
function paydayLabel(day) {
  const s = ["th", "st", "nd", "rd"]
  const v = day % 100
  return `the ${day}${s[(v - 20) % 10] || s[v] || s[0]}`
}

function makePayday(year, monthIndex, day, amount) {
  // new Date() handles month overflow/underflow (e.g. monthIndex -1 = last Dec).
  const date = new Date(year, monthIndex, day)
  // The earliest date you can record this payday in advance.
  const recordableFrom = new Date(year, monthIndex, day - RECORD_LEAD_DAYS)
  return {
    date,
    dateISO: isoDate(date),
    amount: Number(amount) || 0,
    periodLabel: paydayLabel(day),
    recordableFrom,
  }
}

// Build every payday in a window around `today` so the search never misses one
// near a month boundary. payday_b pairs with period_b_amount, payday_a with
// period_a_amount; if a user sets equal days we still want both amounts, so we
// build from the raw (a, b) pairing rather than the de-duped period list.
function paydaysAround(today, settings) {
  const year = today.getFullYear()
  const month = today.getMonth()
  const [dayB, dayA] = [Number(settings.payday_b) || 5, Number(settings.payday_a) || 20]
  const list = []
  for (let m = month - 2; m <= month + 2; m++) {
    list.push(makePayday(year, m, dayB, settings.period_b_amount))
    list.push(makePayday(year, m, dayA, settings.period_a_amount))
  }
  return list
}

// The latest payday on or before today (what you might still need to record).
export function getMostRecentPayday(today, settings) {
  if (!settings) return null
  const past = paydaysAround(today, settings)
    .filter((p) => p.date <= today)
    .sort((a, b) => b.date - a.date)
  return past[0] ?? null
}

// The next payday after today.
export function getNextPayday(today, settings) {
  if (!settings) return null
  const future = paydaysAround(today, settings)
    .filter((p) => p.date > today)
    .sort((a, b) => a.date - b.date)
  return future[0] ?? null
}

