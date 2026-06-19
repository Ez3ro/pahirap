import { useState } from "react"
import { firstDueDate } from "../lib/debts"

// Add a debt. The fields shift depending on the kind: a recurring debt has a
// monthly payment, a due day and the number of months left; a lump sum has a
// total and a due date.
export default function DebtForm({ onAdd }) {
  const [name, setName] = useState("")
  const [kind, setKind] = useState("recurring")
  const [amount, setAmount] = useState("")
  const [dueDay, setDueDay] = useState("")
  const [totalMonths, setTotalMonths] = useState("")
  const [monthsPaid, setMonthsPaid] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const isRecurring = kind === "recurring"

  function reset() {
    setName("")
    setKind("recurring")
    setAmount("")
    setDueDay("")
    setTotalMonths("")
    setMonthsPaid("")
    setDueDate("")
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const trimmedName = name.trim()
    const numericAmount = Number(amount)
    if (!trimmedName || !numericAmount || numericAmount <= 0) return

    // Per-kind required fields.
    if (isRecurring) {
      const day = Number(dueDay)
      const total = Number(totalMonths)
      const paid = Number(monthsPaid) || 0
      if (!day || day < 1 || day > 31 || !total || total < 1 || paid >= total) return
    } else if (!dueDate) {
      return
    }

    setSubmitting(true)
    await onAdd(
      isRecurring
        ? (() => {
            const total = Number(totalMonths)
            const paid = Number(monthsPaid) || 0
            return {
              name: trimmedName,
              kind,
              amount: numericAmount,
              due_day: Number(dueDay),
              months_left: total - paid,
              original_months: total,
              next_due_date: firstDueDate(Number(dueDay), new Date()),
              due_date: null,
            }
          })()
        : {
            name: trimmedName,
            kind,
            amount: numericAmount,
            due_date: dueDate,
            due_day: null,
            months_left: null,
            next_due_date: null,
          }
    )
    setSubmitting(false)
    reset()
  }

  const fieldClass =
    "mt-1 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-gray-100 placeholder-gray-500"

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-gray-700 bg-gray-800 p-4"
    >
      <h3 className="mb-4 font-semibold text-gray-100">Add a debt</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col text-sm text-gray-300">
          Name
          <input
            type="text"
            placeholder="e.g. Car loan"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
          />
        </label>

        <label className="flex flex-col text-sm text-gray-300">
          Type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={fieldClass}
          >
            <option value="recurring">Recurring (monthly)</option>
            <option value="lumpsum">Lump sum (one-off)</option>
          </select>
        </label>

        <label className="flex flex-col text-sm text-gray-300">
          {isRecurring ? "Monthly payment" : "Amount due"}
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={fieldClass}
          />
        </label>

        {isRecurring ? (
          <>
            <label className="flex flex-col text-sm text-gray-300">
              Due day of month
              <input
                type="number"
                min="1"
                max="31"
                placeholder="e.g. 15"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col text-sm text-gray-300">
              Total months
              <input
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 60"
                value={totalMonths}
                onChange={(e) => setTotalMonths(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col text-sm text-gray-300">
              Months already paid
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0 if brand new"
                value={monthsPaid}
                onChange={(e) => setMonthsPaid(e.target.value)}
                className={fieldClass}
              />
              {Number(totalMonths) > 0 && (
                <span className="mt-1 text-xs text-gray-500">
                  {Number(totalMonths) - (Number(monthsPaid) || 0)} months left
                </span>
              )}
            </label>
          </>
        ) : (
          <label className="flex flex-col text-sm text-gray-300">
            Due date
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={fieldClass}
            />
          </label>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add debt"}
      </button>
    </form>
  )
}
