import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import DebtsToPay from "@/components/DebtsToPay"
import { formatMoney } from "@/lib/format"
import { summariseDebts, startOfDay } from "@/lib/debts"

// The at-a-glance view: totals, debts that need paying, a debt overview, and
// (next stage) charts. A multi-column grid fills the width on larger screens.
export default function Dashboard({ transactions, debts, onPayDebt }) {
  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const expenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const balance = income - expenses

  const today = startOfDay(new Date())
  const debtSummary = summariseDebts(debts, today)

  return (
    <div className="space-y-4">
      {/* Top stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Balance" value={balance} />
        <StatCard label="Income" value={income} tone="text-green-500" />
        <StatCard label="Expenses" value={expenses} tone="text-red-500" />
      </div>

      {/* Debts to pay (wide) + debt overview */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DebtsToPay debts={debts} onPayDebt={onPayDebt} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Debt overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <OverviewRow
              label="Total still owed"
              value={formatMoney(debtSummary.totalOwed)}
            />
            <OverviewRow
              label="Minimum due this month"
              value={formatMoney(debtSummary.minimumThisMonth)}
            />
            <OverviewRow
              label="Overdue debts"
              value={String(debtSummary.lateCount)}
              danger={debtSummary.lateCount > 0}
            />
          </CardContent>
        </Card>
      </div>

      {/* Charts placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Spending overview</CardTitle>
          <CardDescription>
            Charts and the budget donut arrive in the next stage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            Coming soon
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value, tone = "text-foreground" }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-2xl ${tone}`}>{formatMoney(value)}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function OverviewRow({ label, value, danger }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${danger ? "text-red-500" : ""}`}>
        {value}
      </span>
    </div>
  )
}
