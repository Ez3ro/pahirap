import { useState } from "react"

// A "controlled form": every input's value lives in React state, so the
// component is always the single source of truth for what's typed in.
export default function TransactionForm({ onAdd }) {
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [type, setType] = useState("expense")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault() // stop the browser from reloading the page

    const trimmedName = name.trim()
    const numericAmount = Number(amount)

    // Basic validation: need a name and a positive number.
    if (!trimmedName || !numericAmount || numericAmount <= 0) return

    setSubmitting(true)
    await onAdd({ name: trimmedName, amount: numericAmount, type })
    setSubmitting(false)

    // Reset the form for the next entry.
    setName("")
    setAmount("")
    setType("expense")
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row dark:border-gray-700 dark:bg-gray-800"
    >
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
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
      >
        <option value="expense">Expense</option>
        <option value="income">Income</option>
      </select>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add"}
      </button>
    </form>
  )
}
