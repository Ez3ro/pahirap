import { useState } from "react"
import { formatMoney } from "../lib/format"
import { categoryIcon } from "../lib/categories"

// Returns { start, end, label } for the current cutoff period.
function currentCutoff(today) {
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  if (d <= 15) {
    return {
      start: new Date(y, m, 1),
      end: new Date(y, m, 15, 23, 59, 59),
      label: `1st–15th · ${today.toLocaleString("en-PH", { month: "long", year: "numeric" })}`,
    }
  }
  return {
    start: new Date(y, m, 16),
    end: new Date(y, m + 1, 0, 23, 59, 59),
    label: `16th–end · ${today.toLocaleString("en-PH", { month: "long", year: "numeric" })}`,
  }
}

export default function Budget({
  transactions,
  budgetLimits,
  onSaveLimit,
  onAddCategory,
  onRemoveCategory,
}) {
  const today = new Date()
  const cutoff = currentCutoff(today)

  // Sum expenses per category within the current cutoff.
  const spent = {}
  for (const t of transactions) {
    if (t.type !== "expense" || !t.category) continue
    const d = new Date(t.created_at)
    if (d >= cutoff.start && d <= cutoff.end) {
      spent[t.category] = (spent[t.category] || 0) + Number(t.amount)
    }
  }

  const totalLimit      = budgetLimits.reduce((s, b) => s + Number(b.monthly_limit), 0)
  const totalSpent      = Object.values(spent).reduce((s, v) => s + v, 0)
  const totalRemaining  = totalLimit - totalSpent
  const isOverall       = totalLimit > 0 && totalRemaining < 0
  // Bar shows remaining budget — recedes to 0% as you spend, stays 0% when over.
  const overallBarPct   = totalLimit > 0 ? Math.max(0, Math.round((totalRemaining / totalLimit) * 100)) : null

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
      {/* Cutoff header + overall bar */}
      <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
        <p className="mb-1 text-sm text-gray-400">{cutoff.label}</p>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold text-gray-100">{formatMoney(totalSpent)}</p>
            <p className="text-sm text-gray-400">
              of {totalLimit > 0 ? formatMoney(totalLimit) : "no limit set"} budgeted
            </p>
          </div>
          {overallBarPct !== null && (
            <span className={`text-lg font-semibold ${isOverall || overallBarPct <= 10 ? "text-red-400" : overallBarPct <= 30 ? "text-amber-400" : "text-green-400"}`}>
              {isOverall ? "0%" : `${overallBarPct}%`}
            </span>
          )}
        </div>
        {isOverall && (
          <p className="mt-1 text-sm font-semibold text-red-400">
            {formatMoney(Math.abs(totalRemaining))} over budget
          </p>
        )}
        {overallBarPct !== null && (
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-700">
            <div
              className={`h-2 rounded-full transition-all ${isOverall || overallBarPct <= 10 ? "bg-red-500" : overallBarPct <= 30 ? "bg-amber-400" : "bg-green-500"} ${!isOverall && overallBarPct > 30 ? "bar-laser" : ""}`}
              style={{ width: `${isOverall ? 0 : overallBarPct}%` }}
            />
          </div>
        )}
      </div>

      {/* Category cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {budgetLimits.map((b) => (
          <CategoryCard
            key={b.category}
            category={b.category}
            limit={Number(b.monthly_limit)}
            spent={spent[b.category] || 0}
            onSave={(val) => onSaveLimit(b.category, val)}
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

// ─── Category card ────────────────────────────────────────────────────────────

function CategoryCard({ category, limit, spent, onSave, onRemove }) {
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
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden>{categoryIcon(category)}</span>
          <span className="font-medium text-gray-100">{category}</span>
        </div>
        <button
          onClick={onRemove}
          className="text-xs text-gray-600 hover:text-red-400"
          aria-label={`Remove ${category}`}
        >
          ✕
        </button>
      </div>

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
              <p className="text-xs text-gray-500">spent this cutoff</p>
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
    </div>
  )
}
