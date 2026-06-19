// Salary is paid semi-monthly:
//   - the 20th pays the 1st-15th period            (period A)
//   - the 5th  pays the 16th-end of the PREVIOUS month (period B)
//
// These helpers figure out which payday is most recently due and which is next,
// so the Income screen can nudge you to record a paycheck.

function isoDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function makePayday(year, monthIndex, day, amount, periodLabel, recordableFromDay) {
  // new Date() handles month overflow/underflow (e.g. monthIndex -1 = last Dec).
  const date = new Date(year, monthIndex, day)
  // The earliest date you can record this payday in advance — the day after the
  // pay period closes. e.g. the 1st-15th period closes on the 15th, so the 20th
  // payday becomes recordable from the 16th.
  const recordableFrom = new Date(year, monthIndex, recordableFromDay)
  return {
    date,
    dateISO: isoDate(date),
    amount: Number(amount) || 0,
    periodLabel,
    recordableFrom,
  }
}

// Build every payday in a window around `today` so the search never misses one
// near a month boundary.
function paydaysAround(today, settings) {
  const year = today.getFullYear()
  const month = today.getMonth()
  const list = []
  for (let m = month - 2; m <= month + 2; m++) {
    // The 5th pays the previous month's 16th-end period; recordable from the 1st.
    list.push(makePayday(year, m, 5, settings.period_b_amount, "16th-end (previous month)", 1))
    // The 20th pays this month's 1st-15th period; recordable from the 16th.
    list.push(makePayday(year, m, 20, settings.period_a_amount, "1st-15th", 16))
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
