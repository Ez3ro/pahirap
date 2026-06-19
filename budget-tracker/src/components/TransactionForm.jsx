import { useState, useEffect } from "react"

// A "controlled form": every input's value lives in React state, so the
// component is always the single source of truth for what's typed in.
export default function TransactionForm({ onAdd, categories = [] }) {
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [type, setType] = useState("expense")
  const [category, setCategory] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // When categories load in (async), default to the first one.
  useEffect(() => {
    if (!category && categories.length > 0) setCategory(categories[0])
  }, [categories])

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmedName = name.trim()
    const numericAmount = Number(amount)
    if (!trimmedName || !numericAmount || numericAmount <= 0) return
    // Category only applies to expenses.
    if (type === "expense" && !category) return

    setSubmitting(true)
    await onAdd({
      name: trimmedName,
      amount: numericAmount,
      type,
      category: type === "expense" ? category : null,
    })
    setSubmitting(false)
    setName("")
    setAmount("")
    setType("expense")
  }

  const selectClass =
    "rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          placeholder="What for? (e.g. Groceries)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
        />
        <input
          type="number"
          placeholder="Amount"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none sm:w-32 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
        />
        <select value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </div>

      {type === "expense" && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="text-sm text-gray-400 dark:text-gray-400 sm:shrink-0">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            className={`flex-1 ${selectClass}`}
          >
            {categories.length === 0 && <option value="">Loading…</option>}
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add"}
      </button>
    </form>
  )
}
