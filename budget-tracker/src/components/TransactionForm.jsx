import { useState, useEffect } from "react"
import { DEBT_CATEGORY, categoryIcon } from "../lib/categories"
import { CURRENCY } from "../lib/format"

// Add a transaction. A "controlled form": every input's value lives in React
// state, so the component is always the single source of truth for what's typed.
export default function TransactionForm({ onAdd, categories = [] }) {
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [type, setType] = useState("expense")
  const [category, setCategory] = useState("")
  // Optional back-date. Blank = today (the DB fills created_at with now()).
  const [date, setDate] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const isExpense = type === "expense"

  // Categories you can file an expense under: your budget categories, plus the
  // built-in "Debt" category for loan/debt payments (kept out of the budget).
  const expenseCategories = categories.includes(DEBT_CATEGORY)
    ? categories
    : [...categories, DEBT_CATEGORY]

  // When categories load in (async), default to the first one.
  useEffect(() => {
    if (!category && categories.length > 0) setCategory(categories[0])
  }, [categories])

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmedName = name.trim()
    const numericAmount = Number(amount)
    if (!trimmedName || !numericAmount || numericAmount <= 0) return
    if (isExpense && !category) return

    const tx = {
      name: trimmedName,
      amount: numericAmount,
      type,
      category: isExpense ? category : null,
    }
    // Only send created_at when back-dating; otherwise let the DB default to now.
    // Noon local on the chosen day so a timezone shift can't bump it a day back.
    if (date) {
      const [y, m, d] = date.split("-").map(Number)
      tx.created_at = new Date(y, m - 1, d, 12, 0, 0).toISOString()
    }

    setSubmitting(true)
    await onAdd(tx)
    setSubmitting(false)
    setName("")
    setAmount("")
    setDate("")
  }

  const fieldClass =
    "w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"

  const today = new Date().toISOString().slice(0, 10)

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-700 bg-gray-800 p-4">
      <h3 className="mb-4 font-semibold text-gray-100">Add transaction</h3>

      {/* Expense / Income segmented toggle */}
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-gray-900/60 p-1">
        {[
          { key: "expense", label: "Expense", active: "bg-red-600 text-white" },
          { key: "income", label: "Income", active: "bg-green-600 text-white" },
        ].map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setType(opt.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              type === opt.key ? opt.active : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Amount (lead, large) + name — split evenly */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-gray-400">
            {CURRENCY}
          </span>
          <input
            type="number"
            placeholder="0.00"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 py-2.5 pl-9 pr-3 text-2xl font-semibold text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <input
          type="text"
          placeholder={isExpense ? "What for? (e.g. Groceries)" : "Source (e.g. Freelance)"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={fieldClass}
        />
      </div>

      {/* Category (expenses only) + date */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {isExpense && (
          <label className="flex flex-col gap-1 text-xs text-gray-400">
            Category
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base" aria-hidden>
                {categoryIcon(category)}
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                className={`${fieldClass} pl-9 appearance-none`}
              >
                {categories.length === 0 && <option value="">Loading…</option>}
                {expenseCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs text-gray-400">
          <span className="flex items-center justify-between">
            Date
            {date && (
              <button
                type="button"
                onClick={() => setDate("")}
                className="text-[11px] text-blue-400 hover:text-blue-300"
              >
                Reset to today
              </button>
            )}
          </span>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className={fieldClass}
          />
          {!date && <span className="text-[11px] text-gray-500">Defaults to today</span>}
        </label>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className={`mt-4 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
          isExpense ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"
        }`}
      >
        {submitting ? "Adding…" : isExpense ? "Add expense" : "Add income"}
      </button>
    </form>
  )
}
