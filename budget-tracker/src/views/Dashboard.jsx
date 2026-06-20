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
import { summariseDebts, startOfDay, killOrder, payoffDate, formatMonthsLeft, isDueInWindow, summariseDebtsByType, debtType } from "@/lib/debts"
import { categoryIcon, categoryColor, isDebtPayment } from "@/lib/categories"
import { currentPeriod, isDateInPeriod } from "@/lib/period"
import { ringStats } from "@/lib/ring"
import BudgetRing from "@/components/BudgetRing"

// The stable list of all possible block IDs, in their default order.
const DEFAULT_ORDER = ["budget-bar", "spending-debts", "kill-order", "stats"]

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

export default function Dashboard({ transactions, debts, budgetLimits = [], loans = [], salarySettings }) {
  const income   = transactions.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0)
  // Expenses here is true cash flow, so it INCLUDES debt payments (that money
  // really left your account). The budget/spending views below exclude them.
  const expenses = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0)

  // Money lent out and not yet returned is cash that's left your pocket, so it
  // lowers the balance. As a borrower repays (amount_paid rises) the gap shrinks
  // and the balance climbs back. Written-off loans stay subtracted — that money
  // is genuinely gone, not recovered.
  const outstandingOf      = (l) => Math.max(0, Number(l.amount) - Number(l.amount_paid))
  const lentOutstandingAll = loans.reduce((s, l) => s + outstandingOf(l), 0)
  const balance            = income - expenses - lentOutstandingAll

  const today  = startOfDay(new Date())
  // The current pay-day period (5th → 20th, or 20th → 5th into next month). The
  // debt summary's "due now" is scoped to this same window, so a debt you've
  // already paid drops out of the figure instead of always showing its full amount.
  const period = currentPeriod(today, salarySettings)
  const debtSummary = summariseDebts(debts, today, period)
  // Per-type monthly breakdown (Cards ₱X, Car ₱Y, …) for the Debt overview card.
  const debtByType = summariseDebtsByType(debts)
  const periodLabel = `${period.label} payday`

  // Recurring debt still due in this pay-day period (and not yet paid).
  let dueThisPeriod = 0
  for (const d of debts) {
    if (d.kind !== "recurring") continue
    if (isDueInWindow(d, period.start, period.end)) dueThisPeriod += Number(d.amount) || 0
  }

  // Spending by category this period — debt payments excluded so they don't show
  // up as discretionary spending (they're tracked on the Debts page instead).
  const spentByCat = {}
  for (const t of transactions) {
    if (t.type !== "expense" || isDebtPayment(t) || !t.category) continue
    const td = new Date(t.created_at)
    if (isDateInPeriod(td, period))
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
  // Per-category rows: only show categories that have a limit or spending this period.
  const catRows = budgetLimits
    .map((b) => ({ category: b.category, limit: Number(b.monthly_limit), spent: spentByCat[b.category] || 0 }))
    .filter((r) => r.limit > 0 || r.spent > 0)
    .sort((a, b) => b.spent - a.spent)

  // Lent money still out (not written off, not fully repaid) — shown in the stats.
  const lentActive = loans.filter((l) => !l.written_off && Number(l.amount_paid) < Number(l.amount))
  const lentActiveOutstanding = lentActive.reduce((s, l) => s + outstandingOf(l), 0)

  const [budgetExpanded, setBudgetExpanded] = useState(false)
  const [todayExpanded, setTodayExpanded] = useState(false)
  const [ringTf, setRingTf] = useState("daily")

  // Budget ring for the chosen cadence — scoped to the categories budgeted at that
  // cadence (daily food, weekly bills, …), allowance = those categories' limits.
  const ring = ringStats(transactions, budgetLimits, period, ringTf, new Date())
  const RING_TFS = [
    { key: "daily", label: "Today" },
    { key: "weekly", label: "This week" },
    { key: "monthly", label: "This month" },
  ]
  const ringTitle = RING_TFS.find((t) => t.key === ringTf)?.label ?? "Today"

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Balance"
              value={balance}
              note={lentActiveOutstanding > 0 ? `after ${formatMoney(lentActiveOutstanding)} lent out` : null}
            />
            <StatCard label="Income"   value={income}    tone="text-green-500" />
            <StatCard label="Expenses" value={expenses}  tone="text-red-500" />
            <StatCard
              label="Lent out"
              value={lentActiveOutstanding}
              tone={lentActiveOutstanding > 0 ? "text-amber-400" : "text-foreground"}
              note={lentActiveOutstanding > 0 ? "owed back to you" : "all settled"}
            />
          </div>
        )

      case "spending-debts":
        return (
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Spending breakdown — wide left column */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Spending this period</CardTitle>
                <CardDescription>
                  {period.label} · {today.toLocaleString("en-PH", { month: "long", year: "numeric" })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {spendingEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No expenses recorded this period yet.</p>
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

            {/* Debt overview + due this period — right column */}
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader><CardTitle>Debt overview</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <OverviewRow label="Total still owed"  value={formatMoney(debtSummary.totalOwed)} />
                  <OverviewRow label="Monthly due"       value={formatMoney(debtSummary.recurringTotal)} />
                  <OverviewRow label="Due this period"   value={formatMoney(debtSummary.dueNow)} />
                  <OverviewRow label="Overdue debts"     value={String(debtSummary.lateCount)} danger={debtSummary.lateCount > 0} />

                  {/* Per-type monthly breakdown */}
                  {debtByType.length > 0 && (
                    <div className="space-y-1.5 border-t border-border pt-2">
                      <p className="text-xs text-muted-foreground">By type · monthly</p>
                      {debtByType.map((t) => (
                        <div key={t.type} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span aria-hidden>{debtType(t.type).icon}</span>
                            {debtType(t.type).label}
                          </span>
                          <span className="font-medium text-gray-300">
                            {t.monthly > 0 ? `${formatMoney(t.monthly)}/mo` : formatMoney(t.owed)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              {dueThisPeriod > 0 ? (
                <Card
                  className="border-red-700/40 bg-red-950/20"
                  style={{ boxShadow: "0 0 18px rgba(255,14,14,0.46)" }}
                >
                  <CardHeader>
                    <CardTitle className="text-red-500">Due this period</CardTitle>
                    <CardDescription className="text-red-500/70">{periodLabel}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold text-red-200">{formatMoney(dueThisPeriod)}</p>
                    <p className="mt-1 text-xs text-red-500">
                      Recurring debts due before the next payday
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-green-800/40 bg-green-950/20">
                  <CardHeader>
                    <CardTitle className="text-green-400">All paid this period</CardTitle>
                    <CardDescription className="text-green-500/70">{periodLabel}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-green-300">
                      Nothing more due before the next payday. 🎉
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )

      case "budget-bar":
        return (
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Period budget — larger (2/3) */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle>Budget</CardTitle>
                  <span className="text-xs text-muted-foreground">{periodLabel}</span>
                </div>
              </CardHeader>
              <CardContent>
                {/* Spent this period vs the budget. The % and bar show what's LEFT. */}
                <p className="text-2xl font-bold">{formatMoney(spendingTotal)}</p>
                <p className="text-sm text-muted-foreground">
                  spent of {formatMoney(totalBudget)} budgeted
                </p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-2 rounded-full transition-all ${isBudgetOver || budgetPct <= 10 ? "bg-red-500" : budgetPct <= 30 ? "bg-amber-400" : "bg-green-500"} ${budgetIsGood ? "bar-laser" : ""}`}
                    style={{ width: `${isBudgetOver ? 0 : budgetPct}%` }}
                  />
                </div>
                <p className={`mt-1 text-xs font-medium ${isBudgetOver || budgetPct <= 10 ? "text-red-400" : budgetPct <= 30 ? "text-amber-400" : "text-green-400"}`}>
                  {isBudgetOver
                    ? `${formatMoney(budgetOverBy)} over budget`
                    : `${formatMoney(Math.max(0, totalBudget - spendingTotal))} left · ${budgetPct}%`}
                </p>

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

            {/* Spending ring — compact (1/3), Daily / Weekly / Monthly toggle */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{ringTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Timeframe toggle */}
                <div className="mb-3 flex gap-1 rounded-lg bg-muted/40 p-0.5">
                  {RING_TFS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setRingTf(t.key)}
                      className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
                        ringTf === t.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t.key}
                    </button>
                  ))}
                </div>

                {ring.hasBudget ? (
                  <>
                    <div className="flex flex-col items-center text-center">
                      <BudgetRing
                        segments={ring.rows.map((r) => ({ color: categoryColor(r.category), value: r.spent }))}
                        allowance={ring.allowance}
                        pct={ring.usedPct}
                        over={ring.over}
                        size={140}
                      />
                      <p className={`mt-3 text-xl font-bold ${ring.over ? "text-red-400" : "text-foreground"}`}>
                        {formatMoney(ring.spent)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        of {formatMoney(ring.allowance)} {ring.label}
                      </p>
                      <p className={`mt-1 text-xs font-semibold ${ring.over ? "text-red-400" : "text-green-400"}`}>
                        {ring.over
                          ? `${formatMoney(Math.abs(ring.remaining))} over`
                          : `${formatMoney(ring.remaining)} left`}
                      </p>
                      {ringTf !== "monthly" && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatMoney(ring.poolRemaining)} of {formatMoney(ring.pool)} left this period
                        </p>
                      )}
                    </div>

                    {/* Per-category allotment — collapsible */}
                    {ring.rows.length > 0 && (
                      <div className="mt-3 border-t border-border pt-2">
                        <button
                          onClick={() => setTodayExpanded((v) => !v)}
                          className="flex w-full items-center justify-between py-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <span>Categories</span>
                          <span>{todayExpanded ? "▲" : "▼"}</span>
                        </button>
                        {todayExpanded && (
                          <div className="mt-2 space-y-2">
                            {ring.rows.map((r) => (
                              <AllotmentRow key={r.category} row={r} showCadence={ringTf === "monthly"} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Record income to see your spending allowance.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
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
  // Follow the strategy chosen on the Debts page (persisted in localStorage).
  const strategy = localStorage.getItem("kill-strategy") || "snowball"
  const ordered = killOrder(debts, today, strategy)
  if (ordered.length === 0) return null
  const [current, ...rest] = ordered
  const finish    = payoffDate(current, today)
  const monthsLeft = current.kind === "recurring" ? Number(current.months_left) || 0 : null
  const isAvalanche = strategy === "avalanche"

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kill order</CardTitle>
        <CardDescription>
          {isAvalanche ? "Avalanche — highest interest first" : "Snowball — shortest debt first"}
        </CardDescription>
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

// One category's daily (or windowed) allotment row: icon, spent vs allotment, bar.
function AllotmentRow({ row, showCadence = false }) {
  const { category, cadence, spent, allotment, pct, over } = row
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="shrink-0" aria-hidden>{categoryIcon(category)}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{category}</span>
      {showCadence && (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize text-gray-400">{cadence}</span>
      )}
      <span className="shrink-0 whitespace-nowrap text-gray-500">
        {formatMoney(spent)}
        {allotment > 0 && <span className="text-gray-600"> / {formatMoney(allotment)}</span>}
      </span>
      <div className="w-8 shrink-0 overflow-hidden rounded-full bg-muted" style={{ height: "3px" }}>
        <div
          className={`h-full rounded-full ${over || pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-green-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
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
