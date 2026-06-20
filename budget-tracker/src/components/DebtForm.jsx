import { useState } from "react"
import { firstDueDate, DEBT_TYPES } from "../lib/debts"

// Add a debt. Fields shift by payment kind:
//   recurring — monthly payment, due day, total/paid months (fixed-term loan)
//   lumpsum   — a total and a single due date (one-off)
//   credit    — a revolving balance + monthly minimum, no end date (credit card)
// An optional interest rate (APR) applies to all kinds and drives the avalanche
// payoff order.
export default function DebtForm({ onAdd }) {
  const [name, setName] = useState("")
  const [kind, setKind] = useState("recurring")
  const [debtTypeKey, setDebtTypeKey] = useState("other")
  const [amount, setAmount] = useState("")
  const [dueDay, setDueDay] = useState("")
  const [totalMonths, setTotalMonths] = useState("")
  const [monthsPaid, setMonthsPaid] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [balance, setBalance] = useState("")
  const [interestRate, setInterestRate] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const isRecurring = kind === "recurring"
  const isCredit = kind === "credit"

  function reset() {
    setName("")
    setKind("recurring")
    setDebtTypeKey("other")
    setAmount("")
    setDueDay("")
    setTotalMonths("")
    setMonthsPaid("")
    setDueDate("")
    setBalance("")
    setInterestRate("")
  }

  // Label for the main amount field, per kind.
  const amountLabel = isRecurring ? "Monthly payment" : isCredit ? "Minimum payment" : "Amount due"

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
    } else if (isCredit) {
      if (Number(balance) <= 0) return
      // Due day is optional for a card; if given it must be a valid day-of-month.
      if (dueDay !== "") {
        const day = Number(dueDay)
        if (!day || day < 1 || day > 31) return
      }
    } else if (!dueDate) {
      return
    }

    // Interest rate is optional; null when blank.
    const rate = interestRate === "" ? null : Math.max(0, Number(interestRate))

    let payload
    if (isRecurring) {
      const total = Number(totalMonths)
      const paid = Number(monthsPaid) || 0
      payload = {
        name: trimmedName,
        kind,
        debt_type: debtTypeKey,
        amount: numericAmount,
        due_day: Number(dueDay),
        months_left: total - paid,
        original_months: total,
        next_due_date: firstDueDate(Number(dueDay), new Date()),
        due_date: null,
        interest_rate: rate,
      }
    } else if (isCredit) {
      // Optional due day: when set, the card's payment is anchored to that day of
      // the month (so it only reads as "due" when that day falls in the window),
      // mirroring recurring debts. Blank keeps the old "due every period" behaviour.
      const day = dueDay === "" ? null : Number(dueDay)
      payload = {
        name: trimmedName,
        kind,
        debt_type: debtTypeKey,
        amount: numericAmount, // monthly minimum
        balance: Number(balance), // current revolving balance
        due_day: day,
        months_left: null,
        next_due_date: day ? firstDueDate(day, new Date()) : null,
        due_date: null,
        interest_rate: rate,
      }
    } else {
      payload = {
        name: trimmedName,
        kind,
        debt_type: debtTypeKey,
        amount: numericAmount,
        due_date: dueDate,
        due_day: null,
        months_left: null,
        next_due_date: null,
        interest_rate: rate,
      }
    }

    setSubmitting(true)
    await onAdd(payload)
    setSubmitting(false)
    reset()
  }

  const fieldClass =
    "mt-1 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-gray-100 placeholder-gray-500"

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-700 bg-gray-800 p-4">
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
          Debt type
          <select value={debtTypeKey} onChange={(e) => setDebtTypeKey(e.target.value)} className={fieldClass}>
            {DEBT_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-sm text-gray-300">
          Payment type
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={fieldClass}>
            <option value="recurring">Recurring (fixed term)</option>
            <option value="credit">Credit card (revolving)</option>
            <option value="lumpsum">Lump sum (one-off)</option>
          </select>
        </label>

        <label className="flex flex-col text-sm text-gray-300">
          {amountLabel}
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

        {isRecurring && (
          <>
            <label className="flex flex-col text-sm text-gray-300">
              Due day of month
              <input type="number" min="1" max="31" placeholder="e.g. 15" value={dueDay} onChange={(e) => setDueDay(e.target.value)} className={fieldClass} />
            </label>
            <label className="flex flex-col text-sm text-gray-300">
              Total months
              <input type="number" min="1" step="1" placeholder="e.g. 60" value={totalMonths} onChange={(e) => setTotalMonths(e.target.value)} className={fieldClass} />
            </label>
            <label className="flex flex-col text-sm text-gray-300">
              Months already paid
              <input type="number" min="0" step="1" placeholder="0 if brand new" value={monthsPaid} onChange={(e) => setMonthsPaid(e.target.value)} className={fieldClass} />
              {Number(totalMonths) > 0 && (
                <span className="mt-1 text-xs text-gray-500">
                  {Number(totalMonths) - (Number(monthsPaid) || 0)} months left
                </span>
              )}
            </label>
          </>
        )}

        {isCredit && (
          <>
            <label className="flex flex-col text-sm text-gray-300">
              Current balance
              <input type="number" min="0" step="0.01" placeholder="0.00" value={balance} onChange={(e) => setBalance(e.target.value)} className={fieldClass} />
              <span className="mt-1 text-xs text-gray-500">What you owe on the card right now.</span>
            </label>
            <label className="flex flex-col text-sm text-gray-300">
              Due day of month
              <input type="number" min="1" max="31" placeholder="optional, e.g. 15" value={dueDay} onChange={(e) => setDueDay(e.target.value)} className={fieldClass} />
              <span className="mt-1 text-xs text-gray-500">When the minimum is due. Leave blank if it's due every period.</span>
            </label>
          </>
        )}

        {kind === "lumpsum" && (
          <label className="flex flex-col text-sm text-gray-300">
            Due date
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={fieldClass} />
          </label>
        )}

        {/* Interest rate — optional, used by the avalanche payoff order. */}
        <label className="flex flex-col text-sm text-gray-300">
          Interest rate (APR %)
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="optional, e.g. 36"
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
            className={fieldClass}
          />
        </label>
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
