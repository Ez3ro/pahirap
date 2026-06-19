import { useState } from "react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { formatMoney, formatMonthYear } from "@/lib/format"
import { summariseDebts, startOfDay, snowballOrder, payoffDate, formatMonthsLeft } from "@/lib/debts"
import { categoryIcon } from "@/lib/categories"

// The stable list of all possible block IDs, in their default order.
const DEFAULT_ORDER = ["budget-bar", "spending-debts", "lent-money", "kill-order", "stats"]

function loadOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem("dashboard-order") || "null")
    if (Array.isArray(saved)) {
      // Keep saved positions, append any new blocks added since last save.
      return [
        ...saved.filter((id) => DEFAULT_ORDER.includes(id)),
        ...DEFAULT_ORDER.filter((id) => !saved.includes(id)),
      ]
    }
  } catch {}
  return DEFAULT_ORDER
}

// Format a "YYYY-MM-DD" loan date for display (UK-style, matching the Lent Money view).
function fmtLoanDate(d) {
  if (!d) return "No date set"
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export default function Dashboard({ transactions, debts, budgetLimits = [], loans = [] }) {
  const income   = transactions.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0)
  const expenses = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0)

  // Money lent out and not yet returned is cash that's left your pocket, so it
  // lowers the balance. As a borrower repays (amount_paid rises) the gap shrinks
  // and the balance climbs back. Written-off loans stay subtracted — that money
  // is genuinely gone, not recovered.
  const outstandingOf      = (l) => Math.max(0, Number(l.amount) - Number(l.amount_paid))
  const lentOutstandingAll = loans.reduce((s, l) => s + outstandingOf(l), 0)
  const balance            = income - expenses - lentOutstandingAll

  const today       = startOfDay(new Date())
  const debtSummary = summariseDebts(debts, today)

  // Cutoff period calculations.
  const todayDay      = today.getDate()
  const isFirstCutoff = todayDay <= 15
  const cutoffEnd     = isFirstCutoff ? 15 : new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const cutoffStart   = isFirstCutoff ? 1 : 16
  const cutoffLabel   = isFirstCutoff ? "1st–15th cutoff" : "16th–end cutoff"

  let dueThisCutoff = 0
  for (const d of debts) {
    if (d.kind !== "recurring" || !d.next_due_date) continue
    const [dy, dm, dd] = d.next_due_date.split("-").map(Number)
    if (dy === today.getFullYear() && dm === today.getMonth() + 1 && dd >= cutoffStart && dd <= cutoffEnd)
      dueThisCutoff += Number(d.amount) || 0
  }

  // Spending by category this cutoff.
  const cutoffFrom = isFirstCutoff ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(today.getFullYear(), today.getMonth(), 16)
  const cutoffTo   = isFirstCutoff ? new Date(today.getFullYear(), today.getMonth(), 15, 23, 59, 59) : new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59)
  const spentByCat = {}
  for (const t of transactions) {
    if (t.type !== "expense" || !t.category) continue
    const td = new Date(t.created_at)
    if (td >= cutoffFrom && td <= cutoffTo)
      spentByCat[t.category] = (spentByCat[t.category] || 0) + Number(t.amount)
  }
  const spendingEntries = Object.entries(spentByCat).sort((a, b) => b[1] - a[1])
  const spendingTotal   = spendingEntries.reduce((s, [, v]) => s + v, 0)

  // Overall budget bar.
  const totalBudget   = budgetLimits.reduce((s, b) => s + Number(b.monthly_limit), 0)
  const isBudgetOver  = totalBudget > 0 && spendingTotal > totalBudget
  const budgetOverBy  = isBudgetOver ? spendingTotal - totalBudget : 0
  const budgetPct     = totalBudget > 0 ? Math.max(0, Math.round(((totalBudget - spendingTotal) / totalBudget) * 100)) : null
  const budgetIsGood  = budgetPct !== null && budgetPct > 30 && !isBudgetOver
  // Per-category rows: only show categories that have a limit or spending this cutoff.
  const catRows = budgetLimits
    .map((b) => ({ category: b.category, limit: Number(b.monthly_limit), spent: spentByCat[b.category] || 0 }))
    .filter((r) => r.limit > 0 || r.spent > 0)
    .sort((a, b) => b.spent - a.spent)

  // Lent money — active loans (not written off, not fully repaid).
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const lentActive = loans.filter((l) => !l.written_off && Number(l.amount_paid) < Number(l.amount))
  const lentActiveOutstanding = lentActive.reduce((s, l) => s + outstandingOf(l), 0)
  // "Due next" = soonest promised date among active loans (those with a date first).
  const datedActive = lentActive.filter((l) => l.promised_date).sort((a, b) => a.promised_date.localeCompare(b.promised_date))
  const nextDue        = datedActive[0] || null
  const nextDueOverdue = nextDue && nextDue.promised_date < todayStr

  const [budgetExpanded, setBudgetExpanded] = useState(false)

  // Block order — loaded from localStorage, falls back to DEFAULT_ORDER.
  const [blockOrder, setBlockOrder] = useState(loadOrder)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    setBlockOrder((prev) => {
      const next = arrayMove(prev, prev.indexOf(active.id), prev.indexOf(over.id))
      localStorage.setItem("dashboard-order", JSON.stringify(next))
      return next
    })
  }

  // Only render blocks that currently have content.
  const visibleBlocks = blockOrder.filter((id) => {
    if (id === "kill-order")     return debts.length > 0
    if (id === "budget-bar")     return totalBudget > 0
    // spending-debts always shows (debt overview is always useful)
    return true
  })

  function renderBlock(id) {
    switch (id) {
      case "stats":
        return (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Balance"
              value={balance}
              note={lentActiveOutstanding > 0 ? `after ${formatMoney(lentActiveOutstanding)} lent out` : null}
            />
            <StatCard label="Income"   value={income}    tone="text-green-500" />
            <StatCard label="Expenses" value={expenses}  tone="text-red-500" />
          </div>
        )

      case "spending-debts":
        return (
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Spending breakdown — wide left column */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Spending this cutoff</CardTitle>
                <CardDescription>
                  {isFirstCutoff ? "1st–15th" : "16th–end"} · {today.toLocaleString("en-PH", { month: "long", year: "numeric" })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {spendingEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No expenses recorded this cutoff yet.</p>
                ) : (
                  <>
                    <div className="space-y-3">
                      {spendingEntries.map(([cat, amount]) => {
                        const pct = Math.round((amount / spendingTotal) * 100)
                        return (
                          <div key={cat}>
                            <div className="mb-1 flex justify-between text-sm">
                              <span className="text-muted-foreground">{cat}</span>
                              <span className="font-medium">
                                {formatMoney(amount)}{" "}
                                <span className="text-muted-foreground">· {pct}%</span>
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <p className="mt-4 border-t border-border pt-3 text-sm font-semibold">
                      Total <span className="float-right">{formatMoney(spendingTotal)}</span>
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Debt overview + due this cutoff — right column */}
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader><CardTitle>Debt overview</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <OverviewRow label="Total still owed"       value={formatMoney(debtSummary.totalOwed)} />
                  <OverviewRow label="Minimum due this month" value={formatMoney(debtSummary.minimumThisMonth)} />
                  <OverviewRow label="Overdue debts"          value={String(debtSummary.lateCount)} danger={debtSummary.lateCount > 0} />
                </CardContent>
              </Card>
              <Card
                className="border-red-700/40 bg-red-950/20"
                style={{ boxShadow: "0 0 18px rgba(255,14,14,0.46)" }}
              >
                <CardHeader>
                  <CardTitle className="text-red-500">Due this cutoff</CardTitle>
                  <CardDescription className="text-red-500/70">{cutoffLabel}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold text-red-200">{formatMoney(dueThisCutoff)}</p>
                  <p className="mt-1 text-xs text-red-500">
                    {isFirstCutoff ? "Due dates 1–15" : `Due dates 16–${cutoffEnd}`} · recurring debts only
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )

      case "budget-bar":
        return (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle>Budget</CardTitle>
                <span className="text-xs text-muted-foreground">{cutoffLabel}</span>
              </div>
            </CardHeader>
            <CardContent>
              {/* Overall bar */}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-2xl font-bold">{formatMoney(spendingTotal)}</p>
                  <p className="text-sm text-muted-foreground">of {formatMoney(totalBudget)} budgeted</p>
                </div>
                <span className={`text-lg font-semibold ${isBudgetOver || budgetPct <= 10 ? "text-red-400" : budgetPct <= 30 ? "text-amber-400" : "text-green-400"}`}>
                  {isBudgetOver ? "0%" : `${budgetPct}%`}
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-2 rounded-full transition-all ${isBudgetOver || budgetPct <= 10 ? "bg-red-500" : budgetPct <= 30 ? "bg-amber-400" : "bg-green-500"} ${budgetIsGood ? "bar-laser" : ""}`}
                  style={{ width: `${isBudgetOver ? 0 : budgetPct}%` }}
                />
              </div>
              {isBudgetOver && (
                <p className="mt-1 text-xs font-semibold text-red-400">{formatMoney(budgetOverBy)} over budget</p>
              )}

              {/* Per-category breakdown — collapsible */}
              {catRows.length > 0 && (
                <div className="mt-3 border-t border-border pt-2">
                  <button
                    onClick={() => setBudgetExpanded((v) => !v)}
                    className="flex w-full items-center justify-between py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <span>Categories</span>
                    <span>{budgetExpanded ? "▲" : "▼"}</span>
                  </button>
                  {budgetExpanded && (
                    <div className="mt-2 space-y-2">
                      {catRows.map(({ category, limit, spent }) => {
                        const remaining = limit > 0 ? limit - spent : null
                        const isOver    = remaining !== null && remaining < 0
                        const remPct    = limit > 0 ? Math.max(0, Math.round(((limit - spent) / limit) * 100)) : null
                        return (
                          <div key={category} className="flex items-center gap-2 text-xs">
                            <span className="shrink-0" aria-hidden>{categoryIcon(category)}</span>
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">{category}</span>
                            <span className="shrink-0 whitespace-nowrap text-gray-500">{formatMoney(spent)}</span>
                            <span className={`shrink-0 whitespace-nowrap font-medium ${isOver ? "text-red-400" : remaining === 0 ? "text-amber-400" : "text-gray-300"}`}>
                              {remaining === null ? "—" : isOver ? `−${formatMoney(Math.abs(remaining))}` : `${formatMoney(remaining)} left`}
                            </span>
                            {remPct !== null && (
                              <div className="w-8 shrink-0 overflow-hidden rounded-full bg-muted" style={{ height: "3px" }}>
                                <div
                                  className={`h-full rounded-full ${isOver ? "bg-red-500" : remPct <= 30 ? "bg-amber-400" : "bg-green-500"}`}
                                  style={{ width: `${remPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )

      case "lent-money":
        return (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle>Lent money</CardTitle>
                {lentActive.length > 0 && (
                  <span className="text-xs text-muted-foreground">{formatMoney(lentActiveOutstanding)} out</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {lentActive.length === 0 ? (
                <p className="text-sm text-muted-foreground">No money lent out.</p>
              ) : nextDue ? (
                <>
                  <div className={`rounded-lg border p-3 ${nextDueOverdue ? "border-red-700/50 bg-red-950/20" : "border-border bg-muted/30"}`}>
                    <p className={`text-xs ${nextDueOverdue ? "text-red-400" : "text-muted-foreground"}`}>
                      {nextDueOverdue ? "Overdue" : "Due next"}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{nextDue.borrower_name}</p>
                        <p className="text-xs text-muted-foreground">{fmtLoanDate(nextDue.promised_date)}</p>
                      </div>
                      <p className={`shrink-0 font-bold ${nextDueOverdue ? "text-red-300" : "text-foreground"}`}>
                        {formatMoney(outstandingOf(nextDue))}
                      </p>
                    </div>
                  </div>
                  {lentActive.length > 1 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      +{lentActive.length - 1} other active loan{lentActive.length - 1 !== 1 ? "s" : ""}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {lentActive.length} active loan{lentActive.length !== 1 ? "s" : ""} · no payment dates set.
                </p>
              )}
            </CardContent>
          </Card>
        )

      case "kill-order":
        return <DebtKillOrder debts={debts} today={today} />

      default:
        return null
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={visibleBlocks} strategy={verticalListSortingStrategy}>
        <div className="space-y-4">
          {visibleBlocks.map((id) => (
            <SortableBlock key={id} id={id}>
              {renderBlock(id)}
            </SortableBlock>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

// ─── Sortable wrapper ─────────────────────────────────────────────────────────

function SortableBlock({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-50" : ""}
    >
      <div className="group relative">
        {/* Drag handle — always slightly visible, brighter on hover */}
        <div
          {...attributes}
          {...listeners}
          className="absolute right-2 top-2 z-10 cursor-grab touch-none rounded p-1.5 text-gray-600 opacity-40 transition-opacity hover:opacity-100 active:cursor-grabbing group-hover:opacity-80"
          aria-label="Drag to reorder"
        >
          <GripIcon />
        </div>
        {children}
      </div>
    </div>
  )
}

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <circle cx="4.5" cy="3"  r="1.3" />
      <circle cx="9.5" cy="3"  r="1.3" />
      <circle cx="4.5" cy="7"  r="1.3" />
      <circle cx="9.5" cy="7"  r="1.3" />
      <circle cx="4.5" cy="11" r="1.3" />
      <circle cx="9.5" cy="11" r="1.3" />
    </svg>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DebtKillOrder({ debts, today }) {
  const ordered = snowballOrder(debts, today)
  if (ordered.length === 0) return null
  const [current, ...rest] = ordered
  const finish    = payoffDate(current, today)
  const monthsLeft = current.kind === "recurring" ? Number(current.months_left) || 0 : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kill order</CardTitle>
        <CardDescription>Snowball — shortest debt first</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-green-800 bg-green-950/30 p-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">1</span>
            <span className="font-semibold text-green-400">Target now</span>
          </div>
          <p className="font-medium text-gray-100">{current.name}</p>
          <p className="text-sm text-gray-400">
            {formatMoney(current.amount)}/mo
            {monthsLeft != null && ` · ${formatMonthsLeft(monthsLeft)}`}
            {finish && ` · Done ~${formatMonthYear(finish)}`}
          </p>
        </div>
        {rest.length > 0 && (
          <ul className="space-y-2">
            {rest.map((d, i) => {
              const f  = payoffDate(d, today)
              const ml = d.kind === "recurring" ? Number(d.months_left) || 0 : null
              return (
                <li key={d.id} className="flex items-center gap-3 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-gray-300">{i + 2}</span>
                  <span className="flex-1 text-gray-300">{d.name}</span>
                  <span className="text-gray-500">{ml != null ? formatMonthsLeft(ml) : f ? formatMonthYear(f) : "—"}</span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function StatCard({ label, value, tone = "text-foreground", note = null }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-2xl ${tone}`}>{formatMoney(value)}</CardTitle>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardHeader>
    </Card>
  )
}

function OverviewRow({ label, value, danger }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${danger ? "text-red-500" : ""}`}>{value}</span>
    </div>
  )
}
