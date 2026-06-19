import { useState } from "react"
import DebtForm from "../components/DebtForm"
import { formatMoney, formatDateISO, formatMonthYear } from "../lib/format"
import {
  summariseDebts,
  debtStatus,
  owedFor,
  payoffDate,
  formatMonthsLeft,
  snowballOrder,
} from "../lib/debts"

export default function Debts({ debts, loading, onAdd, onDelete, onPay, onUpdate }) {
  const today = new Date()
  const summary = summariseDebts(debts, today)
  const [expandedId, setExpandedId] = useState(null)

  const recurring = debts.filter((d) => d.kind === "recurring")
  const lumpsums = debts.filter((d) => d.kind === "lumpsum")

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
        <SummaryCard label="Minimum due this month" value={summary.minimumThisMonth} highlight />
        <SummaryCard label="Recurring / month" value={summary.recurringTotal} />
        <SummaryCard label="Total still owed" value={summary.totalOwed} />
      </div>

      <DebtForm onAdd={onAdd} />

      {/* Strategy */}
      {debts.length > 0 && <StrategySection debts={debts} today={today} />}

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
          <LumpsumGroup
            debts={lumpsums}
            today={today}
            expandedId={expandedId}
            onToggle={toggleExpand}
            onPay={onPay}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  )
}

// ─── Strategy ────────────────────────────────────────────────────────────────

function StrategySection({ debts, today }) {
  const ordered = snowballOrder(debts, today)
  if (ordered.length === 0) return null

  // Walk the kill order and track the cash freed up by each cleared debt.
  let freed = 0
  const steps = ordered.map((d, i) => {
    const step = { debt: d, freed, index: i }
    freed += Number(d.amount) || 0
    return step
  })

  return (
    <div className="rounded-xl border border-violet-800 bg-violet-950/30 p-4">
      <h3 className="mb-1 font-semibold text-gray-100">Debt kill order</h3>
      <p className="mb-4 text-sm text-gray-400">
        <strong className="text-gray-300">Snowball strategy:</strong> pay minimums on
        everything, then throw any spare cash at the shortest debt first. Every one you
        clear frees up money to hit the next one harder.
      </p>

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
                </div>
                <p className="text-sm text-gray-400">
                  {months != null ? formatMonthsLeft(months) : "One-off"}
                  {finish && ` · Done ~${formatMonthYear(finish)}`}
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

  return (
    <div>
      <h3 className="mb-3 font-semibold text-gray-300">Recurring (monthly)</h3>
      <ul className="space-y-2">
        {debts.map((d) => {
          const status = debtStatus(d, today)
          const isExpanded = expandedId === d.id
          const monthsLeft = Number(d.months_left) || 0
          const originalMonths = Number(d.original_months) || 0
          const monthsPaid = originalMonths > 0 ? originalMonths - monthsLeft : 0
          const paidPercent = originalMonths > 0 ? Math.round((monthsPaid / originalMonths) * 100) : null
          const finish = payoffDate(d, today)

          return (
            <li
              key={d.id}
              className={`rounded-lg border ${
                status.isLate
                  ? "border-red-800 bg-red-950/50"
                  : "border-gray-700 bg-gray-800"
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
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(d.id) }}
                    aria-label={`Delete ${d.name}`}
                    className="text-gray-500 hover:text-red-400"
                  >
                    ✕
                  </button>
                  <span className="text-xs text-gray-500">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-gray-700 px-3 pb-4 pt-3">
                  <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <DetailStat label="Still owed" value={formatMoney(owedFor(d))} />
                    <DetailStat label="Monthly payment" value={formatMoney(d.amount)} />
                    <DetailStat
                      label="Finish date"
                      value={finish ? `~${formatMonthYear(finish)}` : "—"}
                    />
                  </div>

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
        })}
      </ul>
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

function LumpsumGroup({ debts, today, expandedId, onToggle, onPay, onDelete }) {
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
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(d.id) }}
                    aria-label={`Delete ${d.name}`}
                    className="text-gray-500 hover:text-red-400"
                  >
                    ✕
                  </button>
                  <span className="text-xs text-gray-500">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-gray-700 px-3 pb-4 pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <DetailStat label="Amount due" value={formatMoney(d.amount)} />
                    <DetailStat
                      label="Due date"
                      value={finish ? formatMonthYear(finish) : "—"}
                    />
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

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
