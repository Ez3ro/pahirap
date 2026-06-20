import { useState } from "react"
import { formatMoney, CURRENCY } from "../lib/format"
import { categoryIcon, isDebtPayment, DEBT_CATEGORY } from "../lib/categories"

// Group transactions by calendar day (newest first), labelling each group
// "Today" / "Yesterday" / "15 Jun 2026". Transactions arrive newest-first already.
function groupByDay(transactions) {
  const groups = []
  const indexByKey = new Map()
  for (const t of transactions) {
    const d = new Date(t.created_at)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length)
      groups.push({ key, date: d, items: [] })
    }
    groups[indexByKey.get(key)].items.push(t)
  }
  return groups
}

function dayLabel(date) {
  const today = new Date()
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const diffDays = Math.round((startOf(today) - startOf(date)) / 86400000)
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export default function TransactionList({ transactions, categories = [], onDelete, onUpdate }) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-700 bg-gray-800/40 py-12 text-center">
        <p className="text-sm text-gray-400">No transactions yet.</p>
        <p className="mt-1 text-xs text-gray-500">Add your first one with the form above.</p>
      </div>
    )
  }

  const groups = groupByDay(transactions)

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        // Net for the day, so you can see at a glance how a day went.
        const net = group.items.reduce(
          (s, t) => s + (t.type === "income" ? Number(t.amount) : -Number(t.amount)),
          0
        )
        return (
          <div key={group.key}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {dayLabel(group.date)}
              </span>
              <span className={`text-xs font-medium ${net >= 0 ? "text-green-500/80" : "text-gray-500"}`}>
                {net >= 0 ? "+" : "−"}{formatMoney(Math.abs(net))}
              </span>
            </div>
            <ul className="space-y-2">
              {group.items.map((t) => (
                <TransactionRow
                  key={t.id}
                  tx={t}
                  categories={categories}
                  onDelete={onDelete}
                  onUpdate={onUpdate}
                />
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

// ─── A single transaction row, with inline editing ────────────────────────────

function TransactionRow({ tx, categories, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const isIncome = tx.type === "income"
  const debt = isDebtPayment(tx)

  if (editing) {
    return (
      <li className="rounded-xl border border-blue-700/60 bg-gray-800 p-3">
        <EditForm
          tx={tx}
          categories={categories}
          onCancel={() => setEditing(false)}
          onSave={async (fields) => {
            await onUpdate(tx.id, fields)
            setEditing(false)
          }}
        />
      </li>
    )
  }

  const time = new Date(tx.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })

  return (
    <li className="group flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-800 p-3 transition-colors hover:border-gray-600">
      {/* Category avatar (or arrow for income) */}
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
          isIncome ? "bg-green-500/15" : debt ? "bg-amber-500/15" : "bg-gray-700"
        }`}
        aria-hidden
      >
        {isIncome ? "💰" : categoryIcon(tx.category)}
      </span>

      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-100">{tx.name}</p>
        <p className="truncate text-xs text-gray-500">
          {isIncome ? "Income" : tx.category || "Uncategorised"} · {time}
        </p>
      </div>

      {/* Amount */}
      <span className={`shrink-0 font-semibold ${isIncome ? "text-green-500" : "text-red-400"}`}>
        {isIncome ? "+" : "−"}{formatMoney(tx.amount)}
      </span>

      {/* Actions — always visible on touch, emphasised on hover for pointer */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => setEditing(true)}
          aria-label={`Edit ${tx.name}`}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-700 hover:text-gray-200"
        >
          <PencilIcon />
        </button>
        <DeleteAction name={tx.name} onDelete={() => onDelete(tx.id)} />
      </div>
    </li>
  )
}

// ─── Inline edit form ──────────────────────────────────────────────────────────

function EditForm({ tx, categories, onCancel, onSave }) {
  const isExpense = tx.type === "expense"
  const [name, setName] = useState(tx.name)
  const [amount, setAmount] = useState(String(tx.amount))
  const [category, setCategory] = useState(tx.category || "")
  // created_at → YYYY-MM-DD in local time for the date input.
  const d = new Date(tx.created_at)
  const initialDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  const [date, setDate] = useState(initialDate)
  const [saving, setSaving] = useState(false)

  const catOptions = categories.includes(DEBT_CATEGORY) ? categories : [...categories, DEBT_CATEGORY]
  const fieldClass =
    "w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"

  async function handleSave() {
    const numericAmount = Number(amount)
    if (!name.trim() || !numericAmount || numericAmount <= 0) return
    const fields = { name: name.trim(), amount: numericAmount }
    if (isExpense) fields.category = category
    // Keep the original time-of-day; only move the calendar day if it changed.
    if (date !== initialDate) {
      const [y, m, day] = date.split("-").map(Number)
      const orig = new Date(tx.created_at)
      fields.created_at = new Date(y, m - 1, day, orig.getHours(), orig.getMinutes(), orig.getSeconds()).toISOString()
    }
    setSaving(true)
    await onSave(fields)
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          autoFocus
          className={`flex-1 ${fieldClass}`}
        />
        <div className="relative sm:w-36">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            {CURRENCY}
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${fieldClass} pl-7`}
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {isExpense && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={fieldClass}
          >
            {catOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <input
          type="date"
          value={date}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDate(e.target.value)}
          className={fieldClass}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Delete with confirm ───────────────────────────────────────────────────────

function DeleteAction({ name, onDelete }) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5 text-xs">
        <button onClick={onDelete} className="rounded-md px-2 py-1 font-medium text-red-400 hover:bg-red-950/40">
          Delete
        </button>
        <button onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-gray-500 hover:text-gray-300">
          Cancel
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      aria-label={`Delete ${name}`}
      className="rounded-md p-1.5 text-gray-500 hover:bg-gray-700 hover:text-red-400"
    >
      <TrashIcon />
    </button>
  )
}

// ─── Icons ─────────────────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5a2 2 0 01-.878.51l-3.2.914a.5.5 0 01-.618-.618l.914-3.2a2 2 0 01.51-.878l8.5-8.5z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  )
}
