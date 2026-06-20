import { useState } from "react"
import DebtForm from "../components/DebtForm"
import { formatMoney, formatDateISO, formatMonthYear } from "../lib/format"
import {
  summariseDebts,
  summariseDebtsByType,
  debtStatus,
  owedFor,
  payoffDate,
  formatMonthsLeft,
  killOrder,
  KILL_STRATEGIES,
  debtType,
  DEBT_TYPES,
} from "../lib/debts"

export default function Debts({ debts, loading, onAdd, onDelete, onPay, onUpdate }) {
  const today = new Date()
  const summary = summariseDebts(debts, today)
  const byType = summariseDebtsByType(debts)
  const [expandedId, setExpandedId] = useState(null)

  // Payoff strategy, remembered across visits.
  const [strategy, setStrategy] = useState(
    () => localStorage.getItem("kill-strategy") || "snowball"
  )
  function chooseStrategy(key) {
    setStrategy(key)
    localStorage.setItem("kill-strategy", key)
  }

  const recurring = debts.filter((d) => d.kind === "recurring")
  const lumpsums = debts.filter((d) => d.kind === "lumpsum")
  const cards = debts.filter((d) => d.kind === "credit")

  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="space-y-6">
      {/* Late warning */}
      {summary.lateCount > 0 && (
        <div className="rounded-lg border border-red-900 bg-red-950 p-3 text-sm text-red-300">
          ⚠️ You have {summary.lateCount} overdue{" "}
          {summary.lateCount === 1 ? "debt" : "debts"}. Pay them to clear the flag.
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Still due this month" value={summary.dueNow} highlight />
        <SummaryCard label="Recurring / month" value={summary.recurringTotal} />
        <SummaryCard label="Total still owed" value={summary.totalOwed} />
      </div>

      {/* Composition by type — separates car/house/card etc. without changing the
          grand total above. */}
      {byType.length > 1 && <DebtComposition byType={byType} total={summary.totalOwed} />}

      <DebtForm onAdd={onAdd} />

      {/* Strategy */}
      {debts.length > 0 && (
        <StrategySection debts={debts} today={today} strategy={strategy} onChooseStrategy={chooseStrategy} />
      )}

      {/* Lists */}
      {loading ? (
        <p className="py-8 text-center text-gray-400">Loading…</p>
      ) : debts.length === 0 ? (
        <p className="py-8 text-center text-gray-500">No debts yet. Add one above.</p>
      ) : (
        <div className="space-y-6">
          <RecurringGroup
            debts={recurring}
            today={today}
            expandedId={expandedId}
            onToggle={toggleExpand}
            onPay={onPay}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
          <CreditGroup
            debts={cards}
            expandedId={expandedId}
            onToggle={toggleExpand}
            onPay={onPay}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
          <LumpsumGroup
            debts={lumpsums}
            today={today}
            expandedId={expandedId}
            onToggle={toggleExpand}
            onPay={onPay}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        </div>
      )}
    </div>
  )
}

// ─── Composition by type ───────────────────────────────────────────────────────

// Shows where your debt is concentrated: a single stacked bar of the whole
// balance, then one row per type with its share. Makes "the car loan is 90% of
// it" obvious at a glance, rather than a flat list of numbers.
function DebtComposition({ byType, total }) {
  // Largest first, so the biggest chunk leads both the bar and the list.
  const rows = [...byType].sort((a, b) => b.owed - a.owed)
  const pctOf = (v) => (total > 0 ? (v / total) * 100 : 0)

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-sm font-medium text-gray-300">Where it's owed</p>
        <p className="text-sm text-gray-500">
          {formatMoney(total)} <span className="text-xs">total</span>
        </p>
      </div>

      {/* Stacked composition bar */}
      <div className="mb-4 flex h-2.5 w-full overflow-hidden rounded-full bg-gray-700">
        {rows.map((t) => {
          const pct = pctOf(t.owed)
          if (pct <= 0) return null
          return (
            <div
              key={t.type}
              style={{ width: `${pct}%`, backgroundColor: debtType(t.type).color }}
              title={`${debtType(t.type).label}: ${formatMoney(t.owed)}`}
            />
          )
        })}
      </div>

      {/* Per-type rows */}
      <div className="space-y-2.5">
        {rows.map((t) => {
          const meta = debtType(t.type)
          const pct = Math.round(pctOf(t.owed))
          return (
            <div key={t.type} className="flex items-center gap-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base"
                style={{ backgroundColor: `${meta.color}22` }}
                aria-hidden
              >
                {meta.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm text-gray-200">
                    {meta.label}
                    <span className="ml-1 text-xs text-gray-500">
                      · {t.count} {t.count === 1 ? "debt" : "debts"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-gray-100">{formatMoney(t.owed)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-700">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
                  </div>
                  <span className="w-9 shrink-0 text-right text-xs text-gray-500">{pct}%</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Strategy ────────────────────────────────────────────────────────────────

function StrategySection({ debts, today, strategy, onChooseStrategy }) {
  const ordered = killOrder(debts, today, strategy)
  if (ordered.length === 0) return null

  const isAvalanche = strategy === "avalanche"

  // Walk the kill order and track the cash freed up by each cleared debt.
  let freed = 0
  const steps = ordered.map((d, i) => {
    const step = { debt: d, freed, index: i }
    freed += Number(d.amount) || 0
    return step
  })

  return (
    <div className="rounded-xl border border-violet-800 bg-violet-950/30 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-gray-100">Debt kill order</h3>
        {/* Snowball / Avalanche toggle */}
        <div className="flex gap-1 rounded-lg bg-gray-900/60 p-1">
          {KILL_STRATEGIES.map((s) => (
            <button
              key={s.key}
              onClick={() => onChooseStrategy(s.key)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                strategy === s.key ? "bg-violet-600 text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-sm text-gray-400">
        <strong className="text-gray-300">{isAvalanche ? "Avalanche" : "Snowball"} strategy:</strong>{" "}
        {isAvalanche
          ? "pay minimums on everything, then throw any spare cash at the highest-interest debt first. Costs the least interest overall."
          : "pay minimums on everything, then throw any spare cash at the shortest debt first. Every one you clear frees up money to hit the next one harder."}
      </p>

      {isAvalanche && debts.every((d) => d.interest_rate == null) && (
        <p className="mb-4 rounded-lg border border-amber-900/60 bg-amber-950/30 p-2 text-xs text-amber-300">
          No interest rates set yet — add an APR to your debts (edit a debt) so avalanche
          can rank by rate. For now they're shown in snowball order.
        </p>
      )}

      <ol className="space-y-3">
        {steps.map(({ debt, freed: freeBefore, index }) => {
          const finish = payoffDate(debt, today)
          const months =
            debt.kind === "recurring"
              ? Number(debt.months_left) || 0
              : finish
              ? Math.max(
                  0,
                  (finish.getFullYear() - today.getFullYear()) * 12 +
                    (finish.getMonth() - today.getMonth())
                )
              : null
          const rate = debt.interest_rate == null ? null : Number(debt.interest_rate)

          return (
            <li key={debt.id} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  index === 0
                    ? "bg-green-500 text-white"
                    : "bg-gray-700 text-gray-300"
                }`}
              >
                {index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-100">{debt.name}</span>
                  {index === 0 && (
                    <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-400">
                      Target now
                    </span>
                  )}
                  {/* In avalanche mode, lead with the rate since that's the sort key. */}
                  {isAvalanche && rate != null && (
                    <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300">
                      {rate}% APR
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400">
                  {debt.kind === "credit"
                    ? `${formatMoney(owedFor(debt))} balance`
                    : months != null
                    ? formatMonthsLeft(months)
                    : "One-off"}
                  {finish && debt.kind !== "credit" && ` · Done ~${formatMonthYear(finish)}`}
                  {freeBefore > 0 && (
                    <span className="text-violet-400">
                      {" "}· +{formatMoney(freeBefore)}/mo freed up
                    </span>
                  )}
                </p>
              </div>
              <span className="shrink-0 font-semibold text-red-400">
                {formatMoney(Number(debt.amount))}/mo
              </span>
            </li>
          )
        })}
      </ol>

      <p className="mt-4 text-xs text-gray-500">
        Once all cleared, you'll have{" "}
        <span className="text-gray-300 font-medium">{formatMoney(freed)}/mo</span>{" "}
        back in your pocket.
      </p>
    </div>
  )
}

// ─── Recurring debts ─────────────────────────────────────────────────────────

function RecurringGroup({ debts, today, expandedId, onToggle, onPay, onDelete, onUpdate }) {
  if (debts.length === 0) return null

  // Group debts by their type, keeping DEBT_TYPES order and skipping empty types.
  const byType = DEBT_TYPES.map((dt) => ({
    type: dt,
    items: debts.filter((d) => debtType(d.debt_type).key === dt.key),
  })).filter((g) => g.items.length > 0)

  return (
    <div>
      <h3 className="mb-3 font-semibold text-gray-300">Recurring (monthly)</h3>
      <div className="space-y-5">
        {byType.map(({ type, items }) => {
          const monthlySubtotal = items.reduce((s, d) => s + (Number(d.amount) || 0), 0)
          return (
            <div key={type.key}>
              {/* Type subheader with monthly subtotal */}
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <span aria-hidden>{type.icon}</span>
                  {type.label}
                  <span className="text-xs text-gray-500">
                    ({items.length})
                  </span>
                </span>
                <span className="text-sm font-semibold text-gray-200">
                  {formatMoney(monthlySubtotal)}<span className="text-xs font-normal text-gray-500">/mo</span>
                </span>
              </div>
              <ul className="space-y-2">
                {items.map((d) => (
                  <RecurringRow
                    key={d.id}
                    debt={d}
                    today={today}
                    isExpanded={expandedId === d.id}
                    onToggle={onToggle}
                    onPay={onPay}
                    onDelete={onDelete}
                    onUpdate={onUpdate}
                  />
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// A single recurring-debt row (collapsed summary + expandable detail).
function RecurringRow({ debt: d, today, isExpanded, onToggle, onPay, onDelete, onUpdate }) {
  const status = debtStatus(d, today)
  const monthsLeft = Number(d.months_left) || 0
  const originalMonths = Number(d.original_months) || 0
  const monthsPaid = originalMonths > 0 ? originalMonths - monthsLeft : 0
  const paidPercent = originalMonths > 0 ? Math.round((monthsPaid / originalMonths) * 100) : null
  const finish = payoffDate(d, today)

  return (
    <li
      className={`rounded-lg border ${
        status.isLate ? "border-red-800 bg-red-950/50" : "border-gray-700 bg-gray-800"
      }`}
    >
      {/* Row */}
      <div
        className="flex cursor-pointer items-center justify-between p-3"
        onClick={() => onToggle(d.id)}
        role="button"
        aria-expanded={isExpanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-gray-100">{d.name}</p>
            {status.paidOff ? (
              <Badge tone="green">Paid off</Badge>
            ) : status.isLate ? (
              <Badge tone="red">
                {status.overdue} month{status.overdue === 1 ? "" : "s"} late
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-gray-400">
            {formatMoney(d.amount)}/month
            {monthsLeft > 0 && ` · ${formatMonthsLeft(monthsLeft)}`}
            {status.nextDue && ` · next ${formatDateISO(d.next_due_date)}`}
          </p>
        </div>

        <div className="ml-3 flex shrink-0 items-center gap-2">
          {!status.paidOff && (
            <button
              onClick={(e) => { e.stopPropagation(); onPay(d) }}
              className="whitespace-nowrap rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              Pay
            </button>
          )}
          <DeleteButton name={d.name} onDelete={() => onDelete(d.id)} />
          <span className="text-xs text-gray-500">{isExpanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-gray-700 px-3 pb-4 pt-3">
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <DetailStat label="Still owed" value={formatMoney(owedFor(d))} />
            <DetailStat label="Monthly payment" value={formatMoney(d.amount)} />
            <DetailStat label="Finish date" value={finish ? `~${formatMonthYear(finish)}` : "—"} />
          </div>

          {/* Change debt type */}
          <DebtTypeEditor debt={d} onUpdate={onUpdate} />

          {/* Progress bar + total months editor */}
          <TotalMonthsEditor
            debt={d}
            monthsLeft={monthsLeft}
            originalMonths={originalMonths}
            monthsPaid={monthsPaid}
            paidPercent={paidPercent}
            onUpdate={onUpdate}
          />
        </div>
      )}
    </li>
  )
}

// ─── Debt type + rate inline editor ───────────────────────────────────────────

// Expanded-row controls to re-classify a debt and set its interest rate (the rate
// drives the avalanche order). Type writes immediately; rate writes on blur/Enter.
function DebtTypeEditor({ debt, onUpdate }) {
  const current = debtType(debt.debt_type).key
  const [rate, setRate] = useState(debt.interest_rate == null ? "" : String(debt.interest_rate))

  function saveRate() {
    const next = rate === "" ? null : Math.max(0, Number(rate))
    const prev = debt.interest_rate == null ? null : Number(debt.interest_rate)
    if (next !== prev) onUpdate(debt.id, { interest_rate: next })
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2 text-xs text-gray-400">
        Type
        <select
          value={current}
          onChange={(e) => { if (e.target.value !== current) onUpdate(debt.id, { debt_type: e.target.value }) }}
          className="rounded-lg border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100"
        >
          {DEBT_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs text-gray-400">
        Interest %
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="—"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          onBlur={saveRate}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
          className="w-20 rounded-lg border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100"
        />
      </label>
    </div>
  )
}

// ─── Total months inline editor ───────────────────────────────────────────────

function TotalMonthsEditor({ debt, monthsLeft, originalMonths, monthsPaid, paidPercent, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(originalMonths || "")
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const total = Number(value)
    if (!total || total < monthsLeft) return
    setSaving(true)
    await onUpdate(debt.id, { original_months: total })
    setSaving(false)
    setEditing(false)
  }

  if (editing || !originalMonths) {
    return (
      <div className="mt-2">
        <p className="mb-1 text-xs text-gray-400">
          {originalMonths ? "Edit total loan months:" : "How many months is this loan in total?"}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={monthsLeft}
            step="1"
            placeholder={`min ${monthsLeft}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-24 rounded-lg border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-gray-100"
          />
          <button
            onClick={handleSave}
            disabled={saving || !value || Number(value) < monthsLeft}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {originalMonths && (
            <button
              onClick={() => setEditing(false)}
              className="text-sm text-gray-500 hover:text-gray-300"
            >
              Cancel
            </button>
          )}
        </div>
        {Number(value) > 0 && Number(value) < monthsLeft && (
          <p className="mt-1 text-xs text-red-400">Must be at least {monthsLeft} (months remaining).</p>
        )}
      </div>
    )
  }

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
        <span>{monthsPaid} of {originalMonths} months paid</span>
        <div className="flex items-center gap-2">
          <span>{paidPercent}%</span>
          <button
            onClick={() => { setValue(originalMonths); setEditing(true) }}
            className="text-gray-500 hover:text-gray-300"
          >
            edit
          </button>
        </div>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-700">
        <div
          className="h-3 rounded-full bg-green-500 transition-all"
          style={{ width: `${paidPercent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-gray-500">{formatMonthsLeft(monthsLeft)} left</p>
    </div>
  )
}

// ─── Lump sums ────────────────────────────────────────────────────────────────

function LumpsumGroup({ debts, today, expandedId, onToggle, onPay, onDelete, onUpdate }) {
  if (debts.length === 0) return null

  return (
    <div>
      <h3 className="mb-3 font-semibold text-gray-300">Lump sums</h3>
      <ul className="space-y-2">
        {debts.map((d) => {
          const isExpanded = expandedId === d.id
          const finish = payoffDate(d, today)

          return (
            <li key={d.id} className="rounded-lg border border-gray-700 bg-gray-800">
              {/* Row */}
              <div
                className="flex cursor-pointer items-center justify-between p-3"
                onClick={() => onToggle(d.id)}
                role="button"
                aria-expanded={isExpanded}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-100">{d.name}</p>
                  <p className="text-xs text-gray-400">
                    {d.due_date ? `Due ${formatDateISO(d.due_date)}` : "One-off"}
                  </p>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  <span className="font-semibold text-red-400">{formatMoney(d.amount)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onPay(d) }}
                    className="whitespace-nowrap rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                  >
                    Pay
                  </button>
                  <DeleteButton name={d.name} onDelete={() => onDelete(d.id)} />
                  <span className="text-xs text-gray-500">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-gray-700 px-3 pb-4 pt-3">
                  <div className="mb-3 grid grid-cols-2 gap-3">
                    <DetailStat label="Amount due" value={formatMoney(d.amount)} />
                    <DetailStat
                      label="Due date"
                      value={finish ? formatMonthYear(finish) : "—"}
                    />
                  </div>
                  <DebtTypeEditor debt={d} onUpdate={onUpdate} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─── Credit cards ──────────────────────────────────────────────────────────────

function CreditGroup({ debts, expandedId, onToggle, onPay, onDelete, onUpdate }) {
  if (debts.length === 0) return null

  return (
    <div>
      <h3 className="mb-3 font-semibold text-gray-300">Credit cards</h3>
      <ul className="space-y-2">
        {debts.map((d) => (
          <CreditRow
            key={d.id}
            debt={d}
            isExpanded={expandedId === d.id}
            onToggle={onToggle}
            onPay={onPay}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        ))}
      </ul>
    </div>
  )
}

function CreditRow({ debt: d, isExpanded, onToggle, onPay, onDelete, onUpdate }) {
  const balance = owedFor(d)
  const minimum = Number(d.amount) || 0
  const rate = d.interest_rate == null ? null : Number(d.interest_rate)
  const cleared = balance <= 0

  // Custom payment amount, defaulting to the minimum.
  const [payAmount, setPayAmount] = useState("")
  const [paying, setPaying] = useState(false)

  // New charge to add onto the balance when the card is swiped again.
  const [chargeAmount, setChargeAmount] = useState("")
  const [charging, setCharging] = useState(false)

  async function handlePay(amount) {
    setPaying(true)
    await onPay(d, amount)
    setPaying(false)
    setPayAmount("")
  }

  // Add a new purchase onto the revolving balance. This isn't logged as a
  // transaction — it grows what you owe, and the eventual payment is the expense.
  async function handleCharge() {
    const add = Number(chargeAmount)
    if (!(add > 0)) return
    setCharging(true)
    await onUpdate(d.id, { balance: (Number(d.balance) || 0) + add })
    setCharging(false)
    setChargeAmount("")
  }

  return (
    <li className={`rounded-lg border ${cleared ? "border-green-800/40 bg-gray-800" : "border-gray-700 bg-gray-800"}`}>
      <div
        className="flex cursor-pointer items-center justify-between p-3"
        onClick={() => onToggle(d.id)}
        role="button"
        aria-expanded={isExpanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-gray-100">{d.name}</p>
            {cleared && <Badge tone="green">Cleared</Badge>}
            {rate != null && (
              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300">{rate}% APR</span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {formatMoney(minimum)}/mo minimum
            {d.due_day && ` · due the ${ordinal(d.due_day)}`}
          </p>
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2">
          <div className="text-right">
            <p className={`font-semibold ${cleared ? "text-green-400" : "text-red-400"}`}>{formatMoney(balance)}</p>
            <p className="text-xs text-gray-500">balance</p>
          </div>
          {!cleared && (
            <button
              onClick={(e) => { e.stopPropagation(); handlePay(minimum) }}
              disabled={paying}
              className="whitespace-nowrap rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Pay min
            </button>
          )}
          <DeleteButton name={d.name} onDelete={() => onDelete(d.id)} />
          <span className="text-xs text-gray-500">{isExpanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-700 px-3 pb-4 pt-3">
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <DetailStat label="Balance" value={formatMoney(balance)} />
            <DetailStat label="Minimum / mo" value={formatMoney(minimum)} />
            <DetailStat label="Interest" value={rate != null ? `${rate}% APR` : "—"} />
          </div>

          <DebtTypeEditor debt={d} onUpdate={onUpdate} />

          {/* Custom payment */}
          {!cleared && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                step="0.01"
                placeholder={`Amount (min ${formatMoney(minimum)})`}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-48 rounded-lg border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500"
              />
              <button
                onClick={() => handlePay(Number(payAmount) > 0 ? Number(payAmount) : minimum)}
                disabled={paying}
                className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
              >
                {paying ? "Saving…" : "Pay this amount"}
              </button>
            </div>
          )}
          {/* New charge — when you swipe the card again. */}
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="New charge amount"
              value={chargeAmount}
              onChange={(e) => setChargeAmount(e.target.value)}
              className="w-48 rounded-lg border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500"
            />
            <button
              onClick={handleCharge}
              disabled={charging || !(Number(chargeAmount) > 0)}
              className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {charging ? "Adding…" : "Add charge"}
            </button>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            Paying reduces the balance; adding a charge grows it. A charge isn't logged as
            spending — the payment is.
          </p>
        </div>
      )}
    </li>
  )
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

// "1st", "2nd", "3rd", "21st"… for a day-of-month.
function ordinal(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return `${n}${["th", "st", "nd", "rd"][n % 10] || "th"}`
}

function SummaryCard({ label, value, highlight }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-blue-700 bg-blue-950" : "border-gray-700 bg-gray-800"
      }`}
    >
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-100">{formatMoney(value)}</p>
    </div>
  )
}

function DetailStat({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-medium text-gray-100">{value}</p>
    </div>
  )
}

function Badge({ tone, children }) {
  const tones = {
    red: "bg-red-500/20 text-red-400",
    green: "bg-green-500/20 text-green-400",
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

// Delete control that asks for confirmation first, so a debt (and its payment
// history) can't be wiped with a single mis-click. Click ✕ to arm, then confirm.
function DeleteButton({ name, onDelete }) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <span className="flex items-center gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
        <span className="text-gray-400">Delete?</span>
        <button
          onClick={() => onDelete()}
          className="font-medium text-red-400 hover:text-red-300"
        >
          Yes
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-gray-500 hover:text-gray-300"
        >
          No
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setConfirming(true) }}
      aria-label={`Delete ${name}`}
      className="text-gray-500 hover:text-red-400"
    >
      ✕
    </button>
  )
}
