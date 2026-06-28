import { formatMoney } from "../lib/format"

// A compact recap of one pay period, shared by the Transactions period headers,
// the Income page, and the dashboard payday banner. Shows both lenses the user
// asked for — budget (over/under vs plan) and cash (what's left of the paycheck)
// — each with its per-day figure.
//
// `summary` is a periodSummary() result. `compact` trims it to the headline stats
// for tight spots (the Income list); the full version adds the cash breakdown.
export default function PeriodRecap({ summary, compact = false }) {
  const {
    days,
    spent,
    budget,
    hasBudget,
    isOverBudget,
    overBudget,
    savedBudget,
    income,
    debtPaid,
    lentOut,
    cashSaved,
    spentPerDay,
    budgetPerDay,
  } = summary

  return (
    <div className="space-y-2">
      {/* Headline: what you actually KEPT this paycheck — income minus everything
          that truly left your pocket (debt + lent + real spend). Unspent budget
          counts as kept, so this rises the less you spend. This is the surplus the
          user cares about, distinct from the budget under/over below. */}
      {income > 0 && (
        <p className={`text-lg font-bold ${cashSaved >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {cashSaved >= 0 ? `${formatMoney(cashSaved)} kept` : `${formatMoney(-cashSaved)} short`}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">this paycheck</span>
        </p>
      )}

      {/* Budget lens */}
      {hasBudget ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">
            Spent <span className="font-semibold text-gray-200" title={formatMoney(spent)}>{formatMoney(spent)}</span>
            {" "}of {formatMoney(budget)}
          </span>
          <span className={`font-semibold ${isOverBudget ? "text-red-400" : "text-green-400"}`}>
            {isOverBudget ? `${formatMoney(overBudget)} over budget` : `${formatMoney(savedBudget)} under budget`}
          </span>
          <span className="text-gray-500">
            · {formatMoney(spentPerDay)}/day of {formatMoney(budgetPerDay)}
          </span>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          Spent <span className="font-semibold text-gray-200">{formatMoney(spent)}</span>
          {" "}· {formatMoney(spentPerDay)}/day over {days} day{days === 1 ? "" : "s"}
        </div>
      )}

      {/* Cash-lens breakdown — the arithmetic behind the "kept" headline above. */}
      {!compact && income > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border/60 pt-2 text-xs text-gray-500">
          <span className="text-muted-foreground">Paycheck {formatMoney(income)}</span>
          {debtPaid > 0 && <span>− {formatMoney(debtPaid)} debt</span>}
          {lentOut > 0 && <span>− {formatMoney(lentOut)} lent</span>}
          <span>− {formatMoney(spent)} spent</span>
        </div>
      )}
    </div>
  )
}
