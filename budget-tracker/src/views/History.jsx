import { useState } from "react"
import { formatMoney } from "../lib/format"
import { spendingHistory, historyRingColor } from "../lib/history"
import { currentPeriod, daysRemaining } from "../lib/period"
import HistoryRings from "../components/HistoryRings"

// The full Spending History page: daily / weekly / monthly rings over a longer
// range than the dashboard block, each with a scrubbable ring strip and a
// detail list of every window (spend vs allowance, % and over/under). Read-only —
// everything is derived from transactions + the budget, so no mutations, no
// offline plumbing, no new table.
export default function History({ transactions = [], budgetLimits = [], salarySettings }) {
  const today = new Date()
  const period = currentPeriod(today, salarySettings)
  const daysToPayday = daysRemaining(period, today)
  const nextPayday = new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate() + 1)

  const history = spendingHistory(transactions, budgetLimits, salarySettings, today, {
    daily: 30,
    weekly: 12,
    monthly: 12,
  })

  if (!history.hasBudget) {
    return (
      <div className="rounded-xl border border-gray-700 bg-gray-800 p-6 text-center text-sm text-gray-400">
        Set a limit on a category on the Budget page to start tracking your spending history.
      </div>
    )
  }

  const SECTIONS = [
    { key: "daily", label: "Daily", data: history.daily },
    { key: "weekly", label: "Weekly", data: history.weekly },
    { key: "monthly", label: "Monthly", data: history.monthly },
  ]

  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500">
        Spend vs budget pace, each window. Paced toward next payday ·{" "}
        {nextPayday.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ({daysToPayday}d)
      </p>

      {SECTIONS.map((section) => (
        <HistorySection key={section.key} section={section} />
      ))}
    </div>
  )
}

// One cadence section (Daily / Weekly / Monthly): the rings are always shown; the
// row-by-row detail LIST below collapses behind a toggle (it's the long part).
function HistorySection({ section }) {
  const [showList, setShowList] = useState(false)

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-200">{section.label} history</h3>

      {/* Scrubbable rings locked to this section's cadence (no toggle). */}
      <HistoryRings
        daily={section.data}
        weekly={section.data}
        monthly={section.data}
        cadence={section.key}
        hasBudget
      />

      {/* Detail list — collapsible. Hidden by default so the page leads with the
          rings; tap to reveal the row-by-row breakdown. */}
      {section.data.length > 0 && (
        <div className="mt-4 border-t border-gray-700 pt-3">
          <button
            onClick={() => setShowList((v) => !v)}
            className="flex w-full items-center justify-between py-1 text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={showList}
          >
            <span>Breakdown ({section.data.length} {section.key === "daily" ? "days" : section.key === "weekly" ? "weeks" : "periods"})</span>
            <span className={`transition-transform ${showList ? "rotate-180" : ""}`} aria-hidden>▼</span>
          </button>
          {showList && (
            <div className="mt-2 space-y-1.5">
              {[...section.data].reverse().map((p, i) => (
                <DetailRow key={`${p.label}-${i}`} point={p} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// One window's line: label, spend of allowance, % and over/under, with a small
// pace bar coloured by the same green/amber/red rule the rings use.
function DetailRow({ point }) {
  const { label, spent, allowance, pct, over } = point
  const color = historyRingColor(pct, over)
  const barPct = Math.min(100, pct)
  const delta = allowance - spent

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-gray-400">{label}</span>
      <span className="min-w-0 flex-1 truncate text-gray-500" title={`${formatMoney(spent)} of ${formatMoney(allowance)}`}>
        {formatMoney(spent)} <span className="text-gray-600">of {formatMoney(allowance)}</span>
      </span>
      <span className={`shrink-0 whitespace-nowrap font-medium ${over ? "text-red-400" : "text-gray-200"}`}>
        {over ? `${formatMoney(-delta)} over` : `${formatMoney(delta)} under`}
      </span>
      <div className="w-10 shrink-0 overflow-hidden rounded-full bg-gray-700" style={{ height: "3px" }}>
        <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: color }} />
      </div>
    </div>
  )
}
