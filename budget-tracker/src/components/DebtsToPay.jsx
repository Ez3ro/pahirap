import { debtStatus, startOfDay } from "@/lib/debts"
import { formatMoney, formatDateISO } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const SOON_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

// A compact "needs attention" list for the Dashboard so debts can be paid
// without switching tabs. Shows recurring debts that are overdue or due within
// a week, plus lump sums due this month.
export default function DebtsToPay({ debts, onPayDebt }) {
  const today = startOfDay(new Date())

  const items = []
  for (const d of debts) {
    if (d.kind === "recurring") {
      const status = debtStatus(d, today)
      if (status.paidOff || !status.nextDue) continue
      const dueInDays = (status.nextDue - today) / DAY_MS
      if (status.isLate || dueInDays <= SOON_DAYS) {
        items.push({ debt: d, status, sortKey: status.nextDue.getTime() })
      }
    } else if (d.kind === "lumpsum" && d.due_date) {
      const [y, m] = d.due_date.split("-").map(Number)
      if (y === today.getFullYear() && m - 1 === today.getMonth()) {
        items.push({ debt: d, status: null, sortKey: new Date(y, m - 1, 1).getTime() })
      }
    } else if (d.kind === "credit" && d.due_day && d.next_due_date) {
      // A card with a due day behaves like a recurring debt for "due soon".
      if (d.balance <= 0) continue
      const [y, m, day] = d.next_due_date.split("-").map(Number)
      const nextDue = new Date(y, m - 1, day)
      const dueInDays = (nextDue - today) / DAY_MS
      if (dueInDays <= SOON_DAYS) {
        items.push({ debt: d, status: null, sortKey: nextDue.getTime() })
      }
    }
  }

  items.sort((a, b) => a.sortKey - b.sortKey)

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Debts to pay</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing due in the next {SOON_DAYS} days.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map(({ debt, status }) => (
              <li
                key={debt.id}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  status?.isLate ? "border-red-800 bg-red-950/40" : ""
                }`}
              >
                <div>
                  <p className="font-medium">{debt.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {status?.isLate ? (
                      <span className="text-red-400">
                        {status.overdue} month{status.overdue === 1 ? "" : "s"} overdue
                      </span>
                    ) : debt.kind === "lumpsum" ? (
                      `Due ${formatDateISO(debt.due_date)}`
                    ) : (
                      `Due ${formatDateISO(debt.next_due_date)}`
                    )}{" "}
                    · {formatMoney(debt.amount)}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => onPayDebt(debt)}
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  Pay
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
