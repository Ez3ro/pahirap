import DebtForm from "../components/DebtForm"
import { formatMoney, formatDateISO } from "../lib/format"
import { summariseDebts, debtStatus, owedFor } from "../lib/debts"

export default function Debts({ debts, loading, onAdd, onDelete, onPay }) {
  const today = new Date()
  const summary = summariseDebts(debts, today)

  const recurring = debts.filter((d) => d.kind === "recurring")
  const lumpsums = debts.filter((d) => d.kind === "lumpsum")

  return (
    <div className="space-y-6">
      {/* Late warning */}
      {summary.lateCount > 0 && (
        <div className="rounded-lg border border-red-900 bg-red-950 p-3 text-sm text-red-300">
          ⚠️ You have {summary.lateCount} overdue{" "}
          {summary.lateCount === 1 ? "debt" : "debts"}. Pay them to clear the
          flag.
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Minimum due this month"
          value={summary.minimumThisMonth}
          highlight
        />
        <SummaryCard label="Recurring / month" value={summary.recurringTotal} />
        <SummaryCard label="Total still owed" value={summary.totalOwed} />
      </div>

      <DebtForm onAdd={onAdd} />

      {/* Lists */}
      {loading ? (
        <p className="py-8 text-center text-gray-400">Loading…</p>
      ) : debts.length === 0 ? (
        <p className="py-8 text-center text-gray-500">
          No debts yet. Add one above.
        </p>
      ) : (
        <div className="space-y-6">
          <RecurringGroup
            debts={recurring}
            today={today}
            onPay={onPay}
            onDelete={onDelete}
          />
          <LumpsumGroup debts={lumpsums} onPay={onPay} onDelete={onDelete} />
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, highlight }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-blue-700 bg-blue-950" : "border-gray-700 bg-gray-800"
      }`}
    >
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-100">
        {formatMoney(value)}
      </p>
    </div>
  )
}

function RecurringGroup({ debts, today, onPay, onDelete }) {
  if (debts.length === 0) return null

  return (
    <div>
      <h3 className="mb-3 font-semibold text-gray-300">Recurring (monthly)</h3>
      <ul className="space-y-2">
        {debts.map((d) => {
          const status = debtStatus(d, today)
          return (
            <li
              key={d.id}
              className={`flex items-center justify-between rounded-lg border p-3 ${
                status.isLate
                  ? "border-red-800 bg-red-950/50"
                  : "border-gray-700 bg-gray-800"
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
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
                  {d.months_left != null && ` · ${d.months_left} left`}
                  {status.nextDue && ` · next ${formatDateISO(d.next_due_date)}`}
                  {` · ${formatMoney(owedFor(d))} owed`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {!status.paidOff && (
                  <button
                    onClick={() => onPay(d)}
                    className="whitespace-nowrap rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                  >
                    Pay
                  </button>
                )}
                <button
                  onClick={() => onDelete(d.id)}
                  aria-label={`Delete ${d.name}`}
                  className="text-gray-500 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function LumpsumGroup({ debts, onPay, onDelete }) {
  if (debts.length === 0) return null

  return (
    <div>
      <h3 className="mb-3 font-semibold text-gray-300">Lump sums</h3>
      <ul className="space-y-2">
        {debts.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 p-3"
          >
            <div>
              <p className="font-medium text-gray-100">{d.name}</p>
              <p className="text-xs text-gray-400">
                {d.due_date ? `Due ${formatDateISO(d.due_date)}` : "One-off"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-red-400">
                {formatMoney(d.amount)}
              </span>
              <button
                onClick={() => onPay(d)}
                className="whitespace-nowrap rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
              >
                Pay
              </button>
              <button
                onClick={() => onDelete(d.id)}
                aria-label={`Delete ${d.name}`}
                className="text-gray-500 hover:text-red-400"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
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
