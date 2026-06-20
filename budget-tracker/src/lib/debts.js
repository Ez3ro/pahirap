// Pure debt calculations, kept out of the React components so they're easy to
// follow and test.

// The kinds of debt you can tag, for grouping and per-type subtotals. `key` is
// what's stored in the debts.debt_type column. Order here is the display order.
// `color` is a hex used for the composition bar on the Debts page.
export const DEBT_TYPES = [
  { key: "card",     label: "Card",       icon: "💳", color: "#60a5fa" }, // blue-400
  { key: "cash",     label: "Cash loan",  icon: "🪙", color: "#34d399" }, // emerald-400
  { key: "car",      label: "Car loan",   icon: "🚘", color: "#f472b6" }, // pink-400
  { key: "house",    label: "House loan", icon: "🏡", color: "#fbbf24" }, // amber-400
  { key: "personal", label: "Personal",   icon: "🫱", color: "#a78bfa" }, // violet-400
  { key: "other",    label: "Other",      icon: "🧾", color: "#9ca3af" }, // gray-400
]

const DEBT_TYPE_BY_KEY = Object.fromEntries(DEBT_TYPES.map((t) => [t.key, t]))

// Look up a debt type (defaults to "Other" for missing/unknown values).
export function debtType(key) {
  return DEBT_TYPE_BY_KEY[key] ?? DEBT_TYPE_BY_KEY.other
}

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
// lump sum = the amount itself; credit card = its current balance.
export function owedFor(debt) {
  const amount = Number(debt.amount) || 0
  if (debt.kind === "recurring") return amount * (Number(debt.months_left) || 0)
  if (debt.kind === "credit") return Math.max(0, Number(debt.balance) || 0)
  return amount
}

// Payment status for a recurring debt: is the next payment overdue, and by how
// many months? `paidOff` is true once there are no payments left.
export function debtStatus(debt, today) {
  const monthsLeft = Number(debt.months_left) || 0

  // Credit card: revolving, so no overdue-months concept. "Paid off" = zero balance.
  if (debt.kind === "credit") {
    return { nextDue: null, isLate: false, overdue: 0, paidOff: owedFor(debt) <= 0 }
  }

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

// The two payoff strategies the app supports.
export const KILL_STRATEGIES = [
  { key: "snowball",  label: "Snowball",  blurb: "Smallest balance first — quick wins to stay motivated." },
  { key: "avalanche", label: "Avalanche", blurb: "Highest interest first — pays the least interest overall." },
]

// Is a debt part of the payoff strategy? Lump sums are excluded — they're a
// one-off payment with a fixed due date, not something you accelerate by throwing
// spare cash at in sequence. Only ongoing debts (recurring loans, credit cards)
// belong in the kill order.
function inKillOrder(debt) {
  return (debt.kind === "recurring" || debt.kind === "credit") && owedFor(debt) > 0
}

// Snowball order: sort active ongoing debts by months remaining, shortest first.
// (Callers may pass `today` for signature parity with the other order helpers;
// it's ignored — extra args are harmless — now that lump sums are excluded.)
export function snowballOrder(debts) {
  function urgencyMonths(d) {
    if (d.kind === "recurring") return Number(d.months_left) || Infinity
    if (d.kind === "credit") {
      // Months to clear the balance paying just the minimum (rough; ignores interest).
      const min = Number(d.amount) || 0
      const bal = owedFor(d)
      return min > 0 ? bal / min : Infinity
    }
    return Infinity
  }
  return [...debts]
    .filter(inKillOrder)
    .sort((a, b) => urgencyMonths(a) - urgencyMonths(b))
}

// Avalanche order: sort active debts by interest rate, highest first. Debts with
// no rate set sink to the bottom; ties fall back to snowball urgency so the order
// is still sensible. Saves the most interest when rates are filled in.
export function avalancheOrder(debts, today) {
  const rate = (d) => (d.interest_rate == null ? -1 : Number(d.interest_rate))
  const snow = snowballOrder(debts, today) // already filtered to owed > 0
  const urgency = new Map(snow.map((d, i) => [d.id, i]))
  return snow.sort((a, b) => {
    const diff = rate(b) - rate(a)
    if (diff !== 0) return diff
    return (urgency.get(a.id) ?? 0) - (urgency.get(b.id) ?? 0)
  })
}

// Unified entry point: order active debts by the chosen strategy.
export function killOrder(debts, today, strategy = "snowball") {
  return strategy === "avalanche" ? avalancheOrder(debts, today) : snowballOrder(debts, today)
}

// Is this debt still due within [start, end]?
//
// Paying a recurring debt advances its next_due_date to the following month, so a
// debt counts as "still due" only while its next_due_date sits inside the window
// AND there are payments left. Once you pay, next_due_date moves past the window
// and it stops counting — which is what makes "due this period" drop to 0 after
// you've paid, instead of always showing the full recurring total.
//
// `start`/`end` are Date objects (inclusive). A debt that's overdue (next_due_date
// before the window) still counts, since it remains unpaid and owed.
export function isDueInWindow(debt, start, end) {
  const lo = startOfDay(start)
  const hi = startOfDay(end)

  if (debt.kind === "recurring") {
    if ((Number(debt.months_left) || 0) <= 0) return false
    if (!debt.next_due_date) return false
    const due = parseISODate(debt.next_due_date)
    // Overdue (before the window) or falling inside it — both are still owed now.
    return due <= hi
  }

  if (debt.kind === "lumpsum" && debt.due_date) {
    const due = parseISODate(debt.due_date)
    return due >= lo && due <= hi
  }

  // Credit card. If a due day is set, anchor the payment to that day of the
  // month and only count it when that day falls inside the window (like a
  // recurring debt). With no due day, fall back to "due in any window covering
  // today" — an unpaid card owes its minimum every period.
  if (debt.kind === "credit") {
    if (owedFor(debt) <= 0) return false
    if (debt.due_day) {
      // The due date in the window's own month; counts if it lands in [lo, hi].
      const due = dateOnDay(hi.getFullYear(), hi.getMonth(), debt.due_day)
      return due >= lo && due <= hi
    }
    const now = startOfDay(new Date())
    return now >= lo && now <= hi
  }

  return false
}

// Headline figures across all debts.
//
// `dueWindow` (optional) is a { start, end } pair — when given, "due now" only
// counts debts whose payment falls in that window and hasn't been made yet. The
// Dashboard passes the current pay-day period here. Without it, the window
// defaults to the whole current calendar month.
export function summariseDebts(debts, today, dueWindow) {
  const windowStart = dueWindow?.start ?? new Date(today.getFullYear(), today.getMonth(), 1)
  const windowEnd =
    dueWindow?.end ?? new Date(today.getFullYear(), today.getMonth() + 1, 0)

  let recurringTotal = 0
  let dueNow = 0
  let totalOwed = 0
  let lateCount = 0

  for (const debt of debts) {
    const amount = Number(debt.amount) || 0

    if (debt.kind === "recurring") {
      recurringTotal += amount
      if (debtStatus(debt, today).isLate) lateCount++
    } else if (debt.kind === "credit" && owedFor(debt) > 0) {
      // A card with a balance is a monthly commitment too — its minimum payment.
      recurringTotal += amount
    }

    // Only the amount genuinely still due in the window — drops to 0 once paid.
    // For a card this is its minimum payment (the `amount` field), not the balance.
    if (isDueInWindow(debt, windowStart, windowEnd)) {
      dueNow += amount
    }

    totalOwed += owedFor(debt)
  }

  return {
    recurringTotal,
    // Kept for any callers still reading the old name; now reflects "due now".
    lumpsumDueThisMonth: dueNow,
    minimumThisMonth: dueNow,
    dueNow,
    totalOwed,
    lateCount,
  }
}

// Per-type breakdown for grouping and subtotals. Returns one entry per debt type
// that has at least one debt, in DEBT_TYPES order, each with:
//   monthly — sum of recurring monthly payments of that type
//   owed     — total still owed (recurring + lump sums) of that type
//   count    — how many debts of that type
// Lump sums contribute to `owed` (and `count`) but not `monthly`.
export function summariseDebtsByType(debts) {
  const totals = {}
  for (const debt of debts) {
    const key = debtType(debt.debt_type).key
    const t = totals[key] ?? (totals[key] = { type: key, monthly: 0, owed: 0, count: 0 })
    t.count++
    t.owed += owedFor(debt)
    if (debt.kind === "recurring") t.monthly += Number(debt.amount) || 0
  }
  // Emit in the canonical DEBT_TYPES order, skipping types with no debts.
  return DEBT_TYPES.map((dt) => totals[dt.key]).filter(Boolean)
}
