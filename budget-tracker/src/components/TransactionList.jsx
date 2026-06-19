import { formatMoney } from "../lib/format"

export default function TransactionList({ transactions, onDelete }) {
  // The "empty state" — what the user sees before adding anything.
  if (transactions.length === 0) {
    return (
      <p className="py-8 text-center text-gray-500 dark:text-gray-400">
        No transactions yet. Add one above.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {transactions.map((t) => {
        const isIncome = t.type === "income"
        return (
          <li
            key={t.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">{t.name}</p>
              <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {t.type}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span
                className={`font-semibold ${isIncome ? "text-green-600" : "text-red-600"}`}
              >
                {isIncome ? "+" : "−"}
                {formatMoney(t.amount)}
              </span>
              <button
                onClick={() => onDelete(t.id)}
                aria-label={`Delete ${t.name}`}
                className="text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400"
              >
                ✕
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
