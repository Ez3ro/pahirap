import { useState } from "react"
import { formatMoney } from "../lib/format"
import { categoryIcon, categoryColor, isDebtPayment } from "../lib/categories"
import { currentPeriod, isDateInPeriod, daysRemaining } from "../lib/period"
import { buildBudgetPlan } from "../lib/budgetPlan"
import { ringStats } from "../lib/ring"
import BudgetRing from "../components/BudgetRing"

// How many days each timeframe spans, used to scale the budget into an allowance.
const TIMEFRAMES = [
  { key: "daily",   label: "Daily",   days: 1 },
  { key: "weekly",  label: "Weekly",  days: 7 },
  { key: "monthly", label: "Monthly", days: null }, // whole pay-day period
]

// Debt payments aren't discretionary spending — they're a committed cost tracked
// on the Debts page — so they never count against the budget. (Includes both
// Pay-button payments and anything filed under the Debt category by hand.)
function isBudgetExpense(t) {
  return t.type === "expense" && !isDebtPayment(t)
}

export default function Budget({
  transactions,
  budgetLimits,
  debts = [],
  loans = [],
  salarySettings,
  onSaveLimit,
  onApplyBudget,
  onSetAutoBudget,
  onSetCadence,
  onAddCategory,
  onRemoveCategory,
}) {
  const today = new Date()
  const period = currentPeriod(today, salarySettings)
  // Every ring is paced toward the next payday (day after the period ends), so
  // "weekly" reads as a week in the run-up to payday, not a calendar-month week.
  const nextPayday = new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate() + 1)
  const daysToPayday = daysRemaining(period, today)

  // The auto-budget waterfall: income → committed costs → needs-first split of the
  // rest. Recomputed every render, so it tracks income/debt/lent/spend changes live.
  const plan = buildBudgetPlan({ transactions, debts, budgetLimits, loans, period })

  // Sum expenses per category within the current pay-day period (used by the
  // category cards, which always reflect the whole period). Debt payments are
  // excluded so paying a loan doesn't look like blowing your budget.
  const spent = {}
  for (const t of transactions) {
    if (!isBudgetExpense(t) || !t.category) continue
    const d = new Date(t.created_at)
    if (isDateInPeriod(d, period)) {
      spent[t.category] = (spent[t.category] || 0) + Number(t.amount)
    }
  }

  // One ring per cadence — each scoped to the categories you budgeted at that
  // cadence (daily food, weekly bills, etc.). A ring only shows if it has
  // categories. Side by side.
  const rings = TIMEFRAMES
    .map((tf) => ({ ...tf, stats: ringStats(transactions, budgetLimits, period, tf.key, today) }))
    .filter((r) => r.stats.hasBudget)
  const hasBudget = rings.length > 0

  const [newCategory, setNewCategory] = useState("")
  const [addingCategory, setAddingCategory] = useState(false)

  async function handleAddCategory(e) {
    e.preventDefault()
    const name = newCategory.trim()
    if (!name) return
    await onAddCategory(name)
    setNewCategory("")
    setAddingCategory(false)
  }

  return (
    <div className="space-y-6">
      {/* Auto-budget plan: income → debt due → split the rest across categories */}
      <AutoBudgetPlan plan={plan} period={period} onApplyBudget={onApplyBudget} />

      {/* Daily / weekly / monthly rings — all three at once */}
      {hasBudget ? (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-sm font-medium text-gray-300">Spending pace</p>
            <p className="text-xs text-gray-500">
              toward next payday · {nextPayday.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ({daysToPayday}d)
            </p>
          </div>
          <div className={`grid gap-4 ${rings.length >= 3 ? "sm:grid-cols-3" : rings.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
            {rings.map((r) => (
              <RingCard key={r.key} label={r.label} stats={r.stats} />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-6 text-center text-sm text-gray-400">
          Set a limit on a category below to start tracking your budget.
        </div>
      )}

      {/* Category cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {budgetLimits.map((b) => (
          <CategoryCard
            key={b.category}
            category={b.category}
            limit={Number(b.monthly_limit)}
            spent={spent[b.category] || 0}
            autoBudget={b.auto_budget !== false}
            cadence={b.cadence || "monthly"}
            onSave={(val) => onSaveLimit(b.category, val)}
            onToggleAuto={onSetAutoBudget ? (on) => onSetAutoBudget(b.category, on) : null}
            onSetCadence={onSetCadence ? (c) => onSetCadence(b.category, c) : null}
            onRemove={() => onRemoveCategory(b.category)}
          />
        ))}
      </div>

      {/* Add category */}
      {addingCategory ? (
        <form onSubmit={handleAddCategory} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Category name"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            autoFocus
            className="flex-1 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-gray-100 placeholder-gray-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setAddingCategory(false)}
            className="text-sm text-gray-500 hover:text-gray-300"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setAddingCategory(true)}
          className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
        >
          <span className="text-lg">+</span> Add custom category
        </button>
      )}
    </div>
  )
}

// ─── Auto-budget plan ─────────────────────────────────────────────────────────

// The waterfall card: income for the period, the committed costs taken off the
// top (debt, lent money, what's already spent), what's left, and the needs-first
// suggested budget across un-budgeted categories — with a button to write those
// suggestions into your limits. Advisory until you apply it; editing any category
// by hand still wins.
function AutoBudgetPlan({ plan, period, onApplyBudget }) {
  const [applying, setApplying] = useState(false)

  // Rows whose number came from the auto-allocation (the unset categories),
  // grouped into needs and wants for display.
  const autoRows = plan.allocations.filter((a) => a.isAuto && a.suggested > 0)
  const needRows = autoRows.filter((a) => a.tier === "need")
  const wantRows = autoRows.filter((a) => a.tier !== "need")
  const canApply = autoRows.length > 0 && !!onApplyBudget

  async function handleApply() {
    setApplying(true)
    await onApplyBudget(autoRows.map((a) => ({ category: a.category, monthly_limit: a.suggested })))
    setApplying(false)
  }

  if (plan.empty) {
    return (
      <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
        <h3 className="font-semibold text-gray-100">Auto-budget</h3>
        <p className="mt-1 text-sm text-gray-400">
          No income recorded for the {period.label} period yet. Record your pay on the
          Income page and your budget will be planned automatically here.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-violet-800 bg-violet-950/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-100">Auto-budget</h3>
          <p className="text-xs text-gray-400">{period.label} period</p>
        </div>
        {canApply && (
          <button
            onClick={handleApply}
            disabled={applying}
            className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {applying ? "Applying…" : "Apply suggested budget"}
          </button>
        )}
      </div>

      {/* Waterfall: income → committed costs → leftover */}
      <div className="space-y-1.5 text-sm">
        <WaterfallRow label="Income this period" value={plan.income} tone="text-green-400" sign="+" />
        {plan.debtPaid > 0 && (
          <WaterfallRow label="Debt paid this period" value={plan.debtPaid} tone="text-red-400" sign="−" />
        )}
        {plan.debtDue > 0 && (
          <WaterfallRow label="Debt still due this period" value={plan.debtDue} tone="text-red-400" sign="−" />
        )}
        {plan.lentOut > 0 && (
          <WaterfallRow label="Lent out this period" value={plan.lentOut} tone="text-amber-400" sign="−" />
        )}
        {plan.alreadySpent > 0 && (
          <WaterfallRow label="Already spent this period" value={plan.alreadySpent} tone="text-gray-300" sign="−" />
        )}
        {plan.manualTotal > 0 && (
          <WaterfallRow label="Your set category budgets" value={plan.manualTotal} tone="text-gray-300" sign="−" />
        )}
        <div className="border-t border-violet-800/60 pt-1.5">
          <WaterfallRow
            label={plan.overcommitted ? "Short this period" : "Left to budget"}
            value={Math.abs(plan.overcommitted ? plan.afterCommitted : plan.leftover)}
            tone={plan.overcommitted ? "text-red-400" : "text-gray-100"}
            bold
          />
        </div>
      </div>

      {plan.overcommitted ? (
        <p className="mt-3 rounded-lg border border-red-900 bg-red-950/50 p-2 text-xs text-red-300">
          Your committed costs this period (debt and lent money) are more than your
          income. Cover those first — there's nothing left to budget for spending.
        </p>
      ) : (
        <>
          {autoRows.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-400">
                Suggested budget for categories with no limit set — essentials funded first:
              </p>
              {needRows.length > 0 && <ChipRow label="Needs" rows={needRows} />}
              {wantRows.length > 0 && <ChipRow label="Wants" rows={wantRows} />}
            </div>
          )}

          {/* Surplus beyond all caps — suggest debt, else savings. */}
          {plan.surplus > 0 && (
            <p className="mt-3 rounded-lg border border-violet-800 bg-violet-900/30 p-2 text-xs text-violet-200">
              💪 You have <span className="font-semibold">{formatMoney(plan.surplus)}</span> spare after
              covering essentials.{" "}
              {plan.killTarget ? (
                <>
                  Throw it at <span className="font-semibold">{plan.killTarget.name}</span> (your
                  kill-order target) to clear debt faster.
                </>
              ) : (
                <>Move it to savings.</>
              )}
            </p>
          )}

          <p className="mt-3 text-[11px] text-gray-500">
            Updates automatically as income, debt, lent money and spending change.
            Applied categories keep the value you set — only un-set ones re-adjust.
          </p>
        </>
      )}
    </div>
  )
}

// A labelled row of category allocation chips (one row for Needs, one for Wants).
function ChipRow({ label, rows }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {rows.map((a) => (
          <span
            key={a.category}
            className="flex items-center gap-1.5 rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300"
          >
            <span aria-hidden>{categoryIcon(a.category)}</span>
            {a.category}
            <span className="font-medium text-gray-100">{formatMoney(a.suggested)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function WaterfallRow({ label, value, tone = "text-gray-300", sign = "", bold = false }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className={`${tone} ${bold ? "text-base font-bold" : "font-medium"}`}>
        {sign}{formatMoney(value)}
      </span>
    </div>
  )
}

// One cadence's ring card (Daily / Weekly / Monthly budget): the segmented ring
// plus spent vs allowance and over/left, for the categories budgeted at that
// cadence. A small per-category list sits under it.
function RingCard({ label, stats }) {
  const { spent, allowance, usedPct, remaining, over, rows, extraRows, label: windowLabel, cadence, pool, poolRemaining } = stats
  // For daily/weekly the allowance is a pace; show the period pool underneath.
  const showPool = cadence !== "monthly"

  return (
    <div className="flex flex-col items-center rounded-xl border border-gray-700 bg-gray-800 p-4 text-center">
      <p className="mb-3 text-sm font-medium text-gray-300">{label} budget</p>
      <BudgetRing
        segments={rows.map((r) => ({ color: categoryColor(r.category), value: r.spent, label: r.category }))}
        allowance={allowance}
        pct={usedPct}
        over={over}
        size={120}
      />
      {/* Hero: budget left for this window (distinct from the dashboard's cash
          "safe to spend"). Goes to "over" when negative; figures reconcile below. */}
      <p className={`mt-3 text-3xl font-bold ${over ? "text-red-400" : "text-green-400"}`}>
        {over ? `${formatMoney(Math.abs(remaining))} over` : formatMoney(remaining)}
      </p>
      <p className="text-xs text-gray-500">
        {over ? `over ${windowLabel}'s budget` : `left in ${windowLabel}'s budget`}
      </p>
      <p className="mt-1 text-[11px] text-gray-500">
        {formatMoney(spent)} spent of {formatMoney(allowance)} {windowLabel}
      </p>
      {showPool && (
        <p className="mt-0.5 text-[11px] text-gray-500">
          {formatMoney(poolRemaining)} of {formatMoney(pool)} left this period
        </p>
      )}

      {/* Categories in this ring. The donut/% covers the ring's OWN cadence; finer
          cadences (e.g. a daily category under the weekly ring) are listed below —
          tagged, but kept out of the ring's totals above. */}
      {(rows.length > 0 || extraRows.length > 0) && (
        <div className="mt-3 w-full space-y-1.5 border-t border-gray-700 pt-3 text-left">
          {rows.map((r) => (
            <RingRow key={r.category} row={r} showCadence={cadence === "monthly"} />
          ))}
          {extraRows.length > 0 && (
            <div className="mt-2 space-y-1.5 border-t border-gray-700/60 pt-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Daily budget on weekly</p>
              {extraRows.map((r) => (
                <RingRow key={r.category} row={r} showCadence />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// One per-category line under a ring: spend, what's left (or over, in red), and a
// small usage bar. Used for both the ring's own categories and the finer ones.
function RingRow({ row, showCadence = false }) {
  const { category, cadence, spent, left, pct, over, limit } = row
  return (
    <div className="flex items-center gap-2 text-xs">
      <span aria-hidden>{categoryIcon(category)}</span>
      <span className="min-w-0 flex-1 truncate text-gray-400">{category}</span>
      {showCadence && (
        <span className="shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-[10px] capitalize text-gray-400">{cadence}</span>
      )}
      {limit > 0 ? (
        <span className={`shrink-0 whitespace-nowrap font-medium ${over ? "text-red-400" : "text-gray-200"}`}>
          {over ? `${formatMoney(-left)} over` : `${formatMoney(left)} left`}
        </span>
      ) : (
        <span className="shrink-0 whitespace-nowrap text-gray-500">{formatMoney(spent)} spent</span>
      )}
      <div className="w-8 shrink-0 overflow-hidden rounded-full bg-gray-700" style={{ height: "3px" }}>
        <div
          className={`h-full rounded-full ${over || pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-green-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Category card ────────────────────────────────────────────────────────────

// Small pill toggle controlling whether a category is part of the auto-budget.
// Off = the auto-budget skips it and shares its money among the rest.
function AutoToggle({ on, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title={on ? "Included in auto-budget — click to exclude" : "Excluded from auto-budget — click to include"}
      className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-200"
    >
      <span className={`relative h-4 w-7 rounded-full transition-colors ${on ? "bg-violet-600" : "bg-gray-600"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`} />
      </span>
      Auto
    </button>
  )
}

function CategoryCard({ category, limit, spent, autoBudget = true, cadence = "monthly", onSave, onToggleAuto, onSetCadence, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(limit || "")
  const [saving, setSaving] = useState(false)

  const remaining    = limit > 0 ? limit - spent : null
  const isOver       = remaining !== null && remaining < 0
  // Bar shows REMAINING budget — starts full, shrinks as you spend.
  const remainingPct = limit > 0 ? Math.max(0, Math.round(((limit - spent) / limit) * 100)) : null

  const barColor =
    remainingPct === null  ? "bg-blue-500"
    : remainingPct <= 10   ? "bg-red-500"
    : remainingPct <= 30   ? "bg-amber-400"
    : "bg-green-500"

  const isGreen = remainingPct !== null && remainingPct > 30

  async function handleSave() {
    setSaving(true)
    await onSave(Number(value) || 0)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className={`rounded-xl border bg-gray-800 p-4 ${autoBudget ? "border-gray-700" : "border-gray-700/60 opacity-80"}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden>{categoryIcon(category)}</span>
          <span className="font-medium text-gray-100">{category}</span>
        </div>
        <div className="flex items-center gap-3">
          {onToggleAuto && (
            <AutoToggle on={autoBudget} onChange={onToggleAuto} />
          )}
          <button
            onClick={onRemove}
            className="text-xs text-gray-600 hover:text-red-400"
            aria-label={`Remove ${category}`}
          >
            ✕
          </button>
        </div>
      </div>

      {!autoBudget && (
        <p className="mb-2 text-[11px] text-gray-500">
          Not auto-budgeted — its share goes to your other categories.
        </p>
      )}

      {/* Remaining vs spent */}
      <div className="mb-2 flex items-end justify-between">
        <div>
          {remaining !== null ? (
            <>
              <p className={`text-lg font-semibold ${isOver ? "text-red-400" : "text-gray-100"}`}>
                {isOver ? `${formatMoney(Math.abs(remaining))} over` : formatMoney(remaining)}
              </p>
              <p className="text-xs text-gray-500">
                {isOver ? "over budget" : "remaining"} · {formatMoney(spent)} spent
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-gray-100">{formatMoney(spent)}</p>
              <p className="text-xs text-gray-500">spent this period</p>
            </>
          )}
        </div>
        {editing ? (
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-400">₱</span>
            <input
              type="number"
              min="0"
              step="1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              className="w-24 rounded-lg border border-gray-600 bg-gray-700 px-2 py-1 text-sm text-gray-100"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-300">
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setValue(limit || ""); setEditing(true) }}
            className="text-sm text-gray-400 hover:text-gray-200"
          >
            {limit > 0 ? `/ ${formatMoney(limit)}` : "Set limit"}
          </button>
        )}
      </div>

      {/* Remaining budget bar — full = 100% remaining, shrinks as you spend */}
      {remainingPct !== null ? (
        <>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
            <div
              className={`h-2 rounded-full transition-all ${barColor} ${isGreen ? "bar-laser" : ""}`}
              style={{ width: `${remainingPct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">{remainingPct}% remaining</p>
        </>
      ) : (
        <div className="h-2 w-full rounded-full bg-gray-700" />
      )}

      {/* Cadence — how often this budget resets. Drives how it's spread on the rings. */}
      {onSetCadence && (
        <div className="mt-3 flex items-center gap-2 border-t border-gray-700 pt-3">
          <span className="text-xs text-gray-500">Resets</span>
          <div className="flex gap-1 rounded-lg bg-gray-900/60 p-0.5">
            {["daily", "weekly", "monthly"].map((c) => (
              <button
                key={c}
                onClick={() => { if (c !== cadence) onSetCadence(c) }}
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize transition-colors ${
                  cadence === c ? "bg-gray-700 text-gray-100" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
