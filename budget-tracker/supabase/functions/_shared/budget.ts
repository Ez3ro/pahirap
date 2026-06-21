// Server-side port of the client budget maths (src/lib/period.js + ring.js).
//
// WHY this duplicates the client: the cron-driven `send-push` function has to
// decide "is this user over budget right now?" even when no app is open, so it
// can't reuse the React code. The logic below mirrors the client function-for-
// function — if you change a rule in src/lib/period.js or ring.js, mirror it here.
//
// TIMEZONE: the client computes "today" with local `new Date()` on a phone set to
// PH time. The server runs in UTC. To keep period/window boundaries identical we
// derive "now" as a *Manila* wall-clock date and do all the date maths on that,
// exactly as the client would. See manilaNow().

export const TZ = "Asia/Manila"

// ---- date helpers (Manila wall-clock, no real timezone objects needed) ----

// A plain {y, m, d} for "today" in Manila, plus a Date at local-midnight we can do
// arithmetic on. We build the Date from the Manila Y/M/D so getDate()/getMonth()
// match what the phone shows, regardless of the server's own zone.
export function manilaNow(reference: Date): { y: number; m: number; d: number; date: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(reference)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const y = get("year")
  const m = get("month") - 1 // 0-based to match JS Date
  const d = get("day")
  return { y, m, d, date: new Date(y, m, d) }
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function dateOnDay(year: number, monthIndex: number, day: number): Date {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(day, lastDay))
}

// ---- period.js port ----

const DEFAULT_PAYDAYS = [5, 20]

export interface SalarySettings {
  payday_a?: number | null
  payday_b?: number | null
  period_a_amount?: number | null
  period_b_amount?: number | null
  skipped_paydays?: string[] | null
}

export function paydaysFromSettings(settings: SalarySettings | null): number[] {
  const raw = [settings?.payday_b, settings?.payday_a]
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x >= 1 && x <= 31)
  const days = raw.length === 2 ? raw : DEFAULT_PAYDAYS
  return [...new Set(days)].sort((a, b) => a - b)
}

export interface Period {
  start: Date
  end: Date
  payDay: number
}

export function currentPeriod(today: Date, settings: SalarySettings | null): Period {
  const paydays = paydaysFromSettings(settings)
  const ref = startOfDay(today)
  const y = ref.getFullYear()
  const m = ref.getMonth()

  const candidates: Date[] = []
  for (let offset = -1; offset <= 1; offset++) {
    for (const day of paydays) candidates.push(dateOnDay(y, m + offset, day))
  }
  candidates.sort((a, b) => +a - +b)

  let start = candidates[0]
  let nextStart = candidates[candidates.length - 1]
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i] <= ref) {
      start = candidates[i]
      nextStart = candidates[i + 1] ?? nextStart
    }
  }

  const end = new Date(nextStart)
  end.setDate(end.getDate() - 1)
  return { start, end, payDay: start.getDate() }
}

export function daysRemaining(period: Period, today: Date): number {
  const ms = +startOfDay(period.end) - +startOfDay(today)
  return Math.max(1, Math.round(ms / 86400000) + 1)
}

// ---- ring.js port ----

export interface Tx {
  type: string
  amount: number | string
  category?: string | null
  is_debt_payment?: boolean | null
  created_at: string
}

export interface BudgetLimit {
  category: string
  monthly_limit: number | string | null
  cadence?: string | null
}

const DEBT_CATEGORY = "Debt"

function isDebtPayment(t: Tx): boolean {
  return Boolean(t.is_debt_payment) || t.category === DEBT_CATEGORY
}
function isBudgetExpense(t: Tx): boolean {
  return t.type === "expense" && !isDebtPayment(t)
}

type Cadence = "daily" | "weekly" | "monthly"

function windowFor(cadence: Cadence, period: Period, today: Date): { start: Date; end: Date } {
  const startToday = startOfDay(today)
  const end = new Date(startToday.getFullYear(), startToday.getMonth(), startToday.getDate(), 23, 59, 59)
  if (cadence === "monthly") return { start: period.start, end }
  if (cadence === "weekly") {
    const start = new Date(startToday)
    start.setDate(start.getDate() - 6)
    return { start, end }
  }
  return { start: startToday, end }
}

function catsForRing(budgetLimits: BudgetLimit[], cadence: Cadence): BudgetLimit[] {
  if (cadence === "monthly") return budgetLimits
  return budgetLimits.filter((b) => (b.cadence || "monthly") === cadence)
}

function sumSpend(transactions: Tx[], catNames: Set<string>, start: Date, end: Date): number {
  let total = 0
  for (const t of transactions) {
    if (!isBudgetExpense(t) || !catNames.has(t.category ?? "")) continue
    const d = new Date(t.created_at)
    if (d >= start && d <= end) total += Number(t.amount)
  }
  return total
}

export interface RingStats {
  cadence: Cadence
  pool: number
  poolSpent: number
  poolRemaining: number
  allowance: number
  spent: number
  over: boolean
  usedPct: number
  hasBudget: boolean
}

export function ringStats(
  transactions: Tx[],
  budgetLimits: BudgetLimit[],
  period: Period,
  cadence: Cadence,
  today: Date,
): RingStats {
  const win = windowFor(cadence, period, today)
  const cats = catsForRing(budgetLimits, cadence)
  const pool = cats.reduce((s, b) => s + (Number(b.monthly_limit) || 0), 0)
  const catNames = new Set(cats.map((b) => b.category))

  const periodEnd = new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate(), 23, 59, 59)
  const poolSpent = sumSpend(transactions, catNames, period.start, periodEnd)
  const poolRemaining = Math.max(0, pool - poolSpent)
  const spent = sumSpend(transactions, catNames, win.start, win.end)

  const daysLeft = daysRemaining(period, today)
  let allowance: number
  if (cadence === "monthly") allowance = pool
  else if (cadence === "weekly") allowance = poolRemaining / Math.max(1, Math.ceil(daysLeft / 7))
  else allowance = poolRemaining / daysLeft

  const hasBudget = pool > 0
  const usedPct = hasBudget && allowance > 0 ? Math.min(100, Math.round((spent / allowance) * 100)) : 0

  return {
    cadence,
    pool,
    poolSpent,
    poolRemaining,
    allowance,
    spent,
    over: hasBudget && allowance > 0 && spent > allowance,
    usedPct,
    hasBudget,
  }
}

// Per-category overspend for the whole period (which specific pools are blown).
// Returns the categories where period spend exceeds the category's own limit.
export function overCategories(
  transactions: Tx[],
  budgetLimits: BudgetLimit[],
  period: Period,
): Array<{ category: string; over: number }> {
  const periodEnd = new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate(), 23, 59, 59)
  const spentByCat: Record<string, number> = {}
  for (const t of transactions) {
    if (!isBudgetExpense(t) || !t.category) continue
    const d = new Date(t.created_at)
    if (d >= period.start && d <= periodEnd) {
      spentByCat[t.category] = (spentByCat[t.category] || 0) + Number(t.amount)
    }
  }
  const out: Array<{ category: string; over: number }> = []
  for (const b of budgetLimits) {
    const limit = Number(b.monthly_limit) || 0
    const spent = spentByCat[b.category] || 0
    if (limit > 0 && spent > limit) out.push({ category: b.category, over: spent - limit })
  }
  return out.sort((a, b) => b.over - a.over)
}

// ---- salary.js port (just the "is today a payday we haven't recorded?" bit) ----

// ISO "YYYY-MM-DD" for a Manila Y/M/D.
export function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}
