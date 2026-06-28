// Auto-budget waterfall.
//
// The idea: your income for the period is a pot. Money comes off the top in
// priority order, and whatever's left is budgeted across day-to-day spending —
// but NOT evenly. It funds "needs" first (Food, Transport, Bills, Health,
// Housing) up to sensible caps, then lets the remainder spill into "wants"
// (Shopping, Entertainment, Other). See BUDGET_MODEL in categories.js.
//
//   income this period
//     − debt this period (due + already paid)   committed, budgeted first
//     − money lent out this period               gone until repaid
//     − what you've already spent on categories  already allocated
//     = leftover
//         → needs-first, capped allocation across categories with no limit set
//         → anything above all caps = surplus (suggest toward debt, else savings)
//
// This is a pure calculation — the Budget view turns it into a UI and lets the
// user apply or edit it. Nothing here writes to the database.

import { isDueInWindow, snowballOrder } from "./debts"
import { isISOInPeriod, isDateInPeriod } from "./period"
import { isDebtPayment, budgetRuleFor } from "./categories"

// Income recorded for the current period. Salary rows are tagged with the payday
// they cover (paid_for); other income is matched on when it was logged.
export function incomeForPeriod(transactions, period) {
  let total = 0
  for (const t of transactions) {
    if (t.type !== "income") continue
    const inPeriod = t.paid_for
      ? isISOInPeriod(t.paid_for, period)
      : isDateInPeriod(new Date(t.created_at), period)
    if (inPeriod) total += Number(t.amount) || 0
  }
  return total
}

// Total debt that falls due within the period (recurring + lump sums), using the
// same "still due, not yet paid" rule as the rest of the app.
export function debtDueForPeriod(debts, period) {
  let total = 0
  for (const d of debts) {
    if (isDueInWindow(d, period.start, period.end)) total += Number(d.amount) || 0
  }
  return total
}

// Debt you've ALREADY paid during the period — debt-payment expenses logged in
// the window. Paying a debt advances its due date out of the period, so without
// this the money you spent on debt would silently vanish from the waterfall.
export function debtPaidForPeriod(transactions, period) {
  let total = 0
  for (const t of transactions) {
    if (t.type !== "expense" || !isDebtPayment(t)) continue
    if (isDateInPeriod(new Date(t.created_at), period)) total += Number(t.amount) || 0
  }
  return total
}

// Money lent out DURING this period that hasn't been repaid yet. It's left your
// pocket, so it comes off the pot — but only loans dated in this period, so an
// old loan doesn't keep suppressing the budget every period. As a borrower repays
// (amount_paid rises) the unpaid portion shrinks and the pot recovers.
export function lentOutForPeriod(loans, period) {
  let total = 0
  for (const l of loans) {
    if (l.written_off) continue
    if (!isISOInPeriod(l.lent_date, period)) continue
    const unpaid = Math.max(0, Number(l.amount) - Number(l.amount_paid))
    total += unpaid
  }
  return total
}

// What you've already spent on ordinary budget categories this period (debt
// payments excluded — those are handled separately above). This is money already
// allocated, so the suggestion only plans what's genuinely still free.
export function spentDiscretionaryForPeriod(transactions, period) {
  let total = 0
  for (const t of transactions) {
    if (t.type !== "expense" || isDebtPayment(t)) continue
    if (isDateInPeriod(new Date(t.created_at), period)) total += Number(t.amount) || 0
  }
  return total
}

// Needs-first, capped allocation by weight.
//
// Given a pot and the categories to fill, fund the "need" tier first, then let
// the remainder flow to "wants". Within a tier the pot is shared in proportion to
// each category's weight, but no category exceeds its cap — freed-up cap money is
// re-shared among the others (water-filling) until nothing changes. Returns a
// { category: amount } map plus the leftover that no category could absorb.
export function allocateByTier(pot, categories) {
  const alloc = {}
  for (const c of categories) alloc[c.category] = 0

  let remaining = pot
  for (const tier of ["need", "want"]) {
    const inTier = categories.filter((c) => c.rule.tier === tier)
    if (inTier.length === 0 || remaining <= 0) continue
    remaining = fillTier(inTier, remaining, alloc)
  }
  return { alloc, surplus: Math.max(0, remaining) }
}

// Water-fill one tier: hand out `budget` across `cats` by weight, respecting caps,
// re-sharing any capped overflow. Mutates `alloc`. Returns money left unspent
// (everyone hit their cap before the budget ran out).
function fillTier(cats, budget, alloc) {
  let pool = budget
  // Categories still able to take more money (under cap). Caps of null = no limit.
  let open = cats.map((c) => ({
    category: c.category,
    weight: c.rule.weight > 0 ? c.rule.weight : 1,
    cap: c.rule.cap == null ? Infinity : c.rule.cap,
  }))

  // A handful of passes converges; the guard stops any pathological loop.
  for (let pass = 0; pass < 20 && pool > 0.5 && open.length > 0; pass++) {
    const totalWeight = open.reduce((s, c) => s + c.weight, 0)
    let distributed = 0
    const stillOpen = []

    for (const c of open) {
      const room = c.cap - alloc[c.category]
      const share = (pool * c.weight) / totalWeight
      const give = Math.min(share, room)
      alloc[c.category] += give
      distributed += give
      // Still open if it hasn't hit its cap (allowing for float dust).
      if (c.cap - alloc[c.category] > 0.5) stillOpen.push(c)
    }

    pool -= distributed
    open = stillOpen
    // If a full pass distributed essentially nothing, everyone's capped — stop.
    if (distributed < 0.5) break
  }

  return pool
}

// Build the plan. `budgetLimits` is the saved [{ category, monthly_limit }] list,
// `loans` the lent-money rows. Returns everything the Budget view needs to render
// and to apply. Recomputed from live data on every render, so the moment income,
// debt, lent money, or spending changes, the suggested budget updates with it.
export function buildBudgetPlan({ transactions, debts, budgetLimits, loans = [], period }) {
  const income = incomeForPeriod(transactions, period)
  const debtDue = debtDueForPeriod(debts, period)
  const debtPaid = debtPaidForPeriod(transactions, period)
  const lentOut = lentOutForPeriod(loans, period)
  const alreadySpent = spentDiscretionaryForPeriod(transactions, period)

  // Money committed before any discretionary budgeting.
  const committed = debtDue + debtPaid + lentOut
  const afterCommitted = income - committed

  // A category can opt OUT of the auto-budget (auto_budget === false). Those are
  // skipped entirely: no money is reserved for them and none is auto-allocated to
  // them, so their share flows to the categories still in. (auto_budget is
  // undefined for legacy rows — treated as in.)
  const optedOut = (b) => b.auto_budget === false
  const included = budgetLimits.filter((b) => !optedOut(b))

  // Budgets are set MONTHLY but income arrives per paycheck, so a monthly limit
  // only reserves its per-paycheck share this period (monthly ÷ paychecks in the
  // month, carried on the period). Otherwise a ₱4,000/mo budget would over-reserve
  // against a single paycheck's income. daily/weekly limits are already per-period.
  // Every budget amount is MONTHLY; a month has more than one paycheck, so this
  // period reserves only its share (monthly ÷ paychecks). Cadence is just the view,
  // not the funding unit, so the split applies to every category regardless.
  const perPaycheck = Math.max(1, period.paychecksPerMonth || 1)
  const fundedOf = (b) => (Number(b.monthly_limit) || 0) / perPaycheck

  // Among included categories: those with a manual limit (>0) are respected as-is;
  // the rest are "unset" and get auto-allocated. Money already spent this period is
  // taken off the pot too, so the suggestion only plans what's genuinely still free.
  const manual = included.filter((b) => Number(b.monthly_limit) > 0)
  const unset = included.filter((b) => Number(b.monthly_limit) <= 0)
  const manualTotal = manual.reduce((s, b) => s + fundedOf(b), 0)

  // Per-category discretionary spend this period, so we can tell spend that's
  // already covered by a manual reservation apart from spend that isn't.
  const spentByCat = {}
  for (const t of transactions) {
    if (t.type !== "expense" || isDebtPayment(t)) continue
    if (!isDateInPeriod(new Date(t.created_at), period)) continue
    const cat = t.category || "Other"
    spentByCat[cat] = (spentByCat[cat] || 0) + (Number(t.amount) || 0)
  }

  // Reserve each manual category at its limit — or at what's already been spent in
  // it, if that's more (overspend has to come from somewhere). Spend that stays
  // within the limit is already inside the reservation, so it isn't charged twice.
  const manualCats = new Set(manual.map((b) => b.category))
  const manualReserved = manual.reduce(
    (s, b) => s + Math.max(fundedOf(b), spentByCat[b.category] || 0),
    0
  )

  // Spend in categories with no manual reservation (the unset ones, plus anything
  // filed under a removed/unbudgeted category). Nothing else accounts for that
  // money, so it comes off the free pot.
  const spentUnreserved = Object.entries(spentByCat)
    .filter(([cat]) => !manualCats.has(cat))
    .reduce((s, [, amt]) => s + amt, 0)

  // The pot the auto-allocator gets to share across the unset categories.
  const leftover = Math.max(0, afterCommitted - manualReserved - spentUnreserved)

  // Needs-first, capped allocation (see allocateByTier) instead of an even split.
  const unsetWithRules = unset.map((b) => ({ category: b.category, rule: budgetRuleFor(b.category) }))
  const { alloc, surplus } = allocateByTier(leftover, unsetWithRules)

  const allocations = budgetLimits.map((b) => {
    const current = Number(b.monthly_limit)
    const excluded = optedOut(b)
    const isAuto = !excluded && current <= 0
    // The allocator works in per-PAYCHECK money (leftover = this period's income),
    // but budgets are stored as MONTHLY amounts. So an auto suggestion is scaled
    // up by paychecks-per-month before it's shown/stored, matching how a manual
    // monthly limit is funded (monthly ÷ paychecks) elsewhere. Manual categories
    // keep their existing monthly value. Rounded — nobody budgets to the centavo.
    const suggested = isAuto ? Math.round((alloc[b.category] || 0) * perPaycheck) : current
    return { category: b.category, current, suggested, isAuto, excluded, tier: budgetRuleFor(b.category).tier }
  })

  // Kill-order target for the "throw extra at debt" suggestion.
  const target = snowballOrder(debts, period.start)[0] ?? null

  // "True spare" this paycheck: what's genuinely free after EVERYTHING — committed
  // costs, the money still reserved by your set budgets that you haven't spent yet,
  // and any unbudgeted spend. = afterCommitted − manualReserved − spentUnreserved,
  // which is exactly `leftover` before it's clamped at 0; expose it so a dashboard
  // stat can show real spare (and go negative as a warning) without the clamp.
  const trueSpare = afterCommitted - manualReserved - spentUnreserved

  return {
    income,
    debtDue,
    debtPaid,
    lentOut,
    alreadySpent,
    // Spend in categories with NO budget set — the only spend the waterfall shows
    // as its own line. Spend INSIDE a budgeted category is folded into that
    // category's reservation (manualTotal/manualReserved), so it isn't subtracted
    // twice (the bug that made "Left to budget" read too low).
    spentUnreserved,
    afterCommitted,
    manualTotal,
    // What your set budgets actually hold back this period: each category at its
    // funded limit, OR what's been spent in it if that's more (overspend has to be
    // covered). Using this in the waterfall (not manualTotal) makes the rows sum
    // exactly to "Left to budget" even when a category is over.
    manualReserved,
    leftover,
    trueSpare: Math.round(trueSpare),
    allocations,
    surplus: Math.round(surplus),
    killTarget: target ? { name: target.name, amount: Number(target.amount) || 0 } : null,
    // True when there's genuinely nothing to budget yet (no income recorded).
    empty: income <= 0,
    // True when committed costs alone exceed income for the period — a real warning.
    overcommitted: afterCommitted < 0,
  }
}
