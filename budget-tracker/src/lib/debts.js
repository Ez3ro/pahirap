// Pure debt calculations, kept out of the React components so they're easy to
// follow and test.

function parseISODate(iso) {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function isoFromDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// Midnight today — used so comparisons ignore the current time of day.
export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

// A date on `dueDay` of the given month, clamped to the last day of short months
// (e.g. due day 31 in February becomes the 28th/29th).
function dateOnDay(year, monthIndex, dueDay) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(dueDay, lastDay))
}

// First due date for a brand-new recurring debt: the next `dueDay` on or after today.
export function firstDueDate(dueDay, today) {
  const thisMonth = dateOnDay(today.getFullYear(), today.getMonth(), dueDay)
  if (thisMonth >= startOfDay(today)) return isoFromDate(thisMonth)
  return isoFromDate(dateOnDay(today.getFullYear(), today.getMonth() + 1, dueDay))
}

// Move a due date forward one month, keeping it anchored to `dueDay`.
export function advanceDue(currentISO, dueDay) {
  const current = parseISODate(currentISO)
  return isoFromDate(dateOnDay(current.getFullYear(), current.getMonth() + 1, dueDay))
}

// What's still owed on a debt: recurring = months left * monthly payment;
// lump sum = the amount itself.
export function owedFor(debt) {
  const amount = Number(debt.amount) || 0
  if (debt.kind === "recurring") return amount * (Number(debt.months_left) || 0)
  return amount
}

// Payment status for a recurring debt: is the next payment overdue, and by how
// many months? `paidOff` is true once there are no payments left.
export function debtStatus(debt, today) {
  const monthsLeft = Number(debt.months_left) || 0

  if (debt.kind !== "recurring") {
    return { nextDue: null, isLate: false, overdue: 0, paidOff: false }
  }
  if (monthsLeft <= 0) {
    return { nextDue: null, isLate: false, overdue: 0, paidOff: true }
  }
  if (!debt.next_due_date) {
    return { nextDue: null, isLate: false, overdue: 0, paidOff: false }
  }

  const start = startOfDay(today)
  const nextDue = parseISODate(debt.next_due_date)
  const isLate = nextDue < start

  // Count how many due dates have slipped past (capped by months remaining).
  let overdue = 0
  if (isLate) {
    const dueDay = debt.due_day ?? nextDue.getDate()
    let cursor = nextDue
    while (cursor < start && overdue < monthsLeft) {
      overdue++
      cursor = dateOnDay(cursor.getFullYear(), cursor.getMonth() + 1, dueDay)
    }
  }

  return { nextDue, isLate, overdue, paidOff: false }
}

// Estimated pay-off date for a debt.
// Recurring: today + months_left months. Lump sum: the due_date itself.
export function payoffDate(debt, today) {
  if (debt.kind === "lumpsum" && debt.due_date) return parseISODate(debt.due_date)
  const months = Number(debt.months_left) || 0
  if (!months) return null
  return new Date(today.getFullYear(), today.getMonth() + months, 1)
}

// "4 months" / "1y 4mo" / "4 years"
export function formatMonthsLeft(months) {
  if (!months || months <= 0) return "Done"
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (!rem) return `${years} year${years === 1 ? "" : "s"}`
  return `${years}y ${rem}mo`
}

// Snowball order: sort active debts by months remaining, shortest first.
// Lump sums are treated as their months-until-due.
export function snowballOrder(debts, today) {
  function urgencyMonths(d) {
    if (d.kind === "recurring") return Number(d.months_left) || Infinity
    if (!d.due_date) return Infinity
    const due = parseISODate(d.due_date)
    const m = (due.getFullYear() - today.getFullYear()) * 12 + (due.getMonth() - today.getMonth())
    return Math.max(0, m)
  }
  return [...debts]
    .filter((d) => owedFor(d) > 0)
    .sort((a, b) => urgencyMonths(a) - urgencyMonths(b))
}

// Headline figures across all debts.
export function summariseDebts(debts, today) {
  const year = today.getFullYear()
  const month = today.getMonth()

  let recurringTotal = 0
  let lumpsumDueThisMonth = 0
  let totalOwed = 0
  let lateCount = 0

  for (const debt of debts) {
    const amount = Number(debt.amount) || 0

    if (debt.kind === "recurring") {
      recurringTotal += amount
      if (debtStatus(debt, today).isLate) lateCount++
    } else if (debt.kind === "lumpsum" && debt.due_date) {
      const due = parseISODate(debt.due_date)
      if (due.getFullYear() === year && due.getMonth() === month) {
        lumpsumDueThisMonth += amount
      }
    }

    totalOwed += owedFor(debt)
  }

  return {
    recurringTotal,
    lumpsumDueThisMonth,
    minimumThisMonth: recurringTotal + lumpsumDueThisMonth,
    totalOwed,
    lateCount,
  }
}
