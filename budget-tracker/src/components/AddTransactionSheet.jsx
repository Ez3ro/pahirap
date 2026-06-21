import { useState, useEffect, useRef, useMemo } from "react"
import { DEBT_CATEGORY, categoryIcon } from "../lib/categories"
import { CURRENCY, formatMoney } from "../lib/format"

// A bottom-sheet add form, built mobile-first for the fewest taps:
//   tap + → sheet slides up → amount is already focused (numpad) → type, tap a
//   category chip, Save. Name is optional (defaults to the category). Date is
//   tucked behind a toggle so the common "today" case needs no interaction.
//
// Recent shortcuts at the top re-add habitual spends (Coffee ₱125, Mcdo …) in
// one tap by prefilling the form. Expense-first, since that's logged far more.
export default function AddTransactionSheet({ open, onClose, onAdd, categories = [], transactions = [] }) {
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [type, setType] = useState("expense")
  const [category, setCategory] = useState("")
  const [showDate, setShowDate] = useState(false)
  const [date, setDate] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const amountRef = useRef(null)

  // Swipe-down-to-dismiss. We track the drag offset (only downward) and apply it
  // as an inline translateY while the finger is down, disabling the CSS transition
  // so the sheet follows in real time. On release, a far-enough or fast-enough
  // pull closes; otherwise it snaps back. Handlers live on the grab handle so the
  // drag never fights with scrolling the chips/form below.
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef(null)

  function onDragStart(e) {
    dragStart.current = e.touches[0].clientY
    setDragging(true)
  }
  function onDragMove(e) {
    if (dragStart.current == null) return
    const delta = e.touches[0].clientY - dragStart.current
    setDragY(Math.max(0, delta)) // only allow dragging down
  }
  function onDragEnd() {
    if (dragStart.current == null) return
    dragStart.current = null
    setDragging(false)
    if (dragY > 120) onClose() // pulled far enough → dismiss
    setDragY(0) // snap back (or animate out from here if closing)
  }

  const isExpense = type === "expense"

  // Expense categories = budget categories + the built-in Debt passthrough.
  const expenseCategories = categories.includes(DEBT_CATEGORY)
    ? categories
    : [...categories, DEBT_CATEGORY]

  // The most recent distinct expenses, as one-tap "repeat this" shortcuts.
  // Keyed by name+category so "Coffee/Food" and "Coffee/Other" stay separate.
  const recents = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const t of transactions) {
      if (t.type !== "expense" || !t.name) continue
      const key = `${t.name}|${t.category ?? ""}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ name: t.name, amount: Number(t.amount), category: t.category })
      if (out.length >= 4) break
    }
    return out
  }, [transactions])

  // Reset to a clean expense-first state every time the sheet opens, and focus
  // the amount so the numpad is up immediately. The setState calls here sync the
  // form to an external trigger (the sheet opening) — a legitimate effect use the
  // lint rule is conservative about, so we opt out on this line as elsewhere in
  // the codebase.
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setType("expense")
    setName("")
    setAmount("")
    setDragY(0)
    setDragging(false)
    setShowDate(false)
    setDate("")
    setCategory(categories[0] ?? "")
    const t = setTimeout(() => amountRef.current?.focus(), 250)
    return () => clearTimeout(t)
  }, [open, categories])

  // Close on Escape (desktop) for good measure.
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  function applyRecent(r) {
    setType("expense")
    setName(r.name)
    setAmount(String(r.amount))
    setCategory(r.category ?? categories[0] ?? "")
    amountRef.current?.focus()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const numericAmount = Number(amount)
    if (!numericAmount || numericAmount <= 0) return
    if (isExpense && !category) return
    // Name is optional now — fall back to the category (or "Income").
    const finalName = name.trim() || (isExpense ? category : "Income")

    const tx = {
      name: finalName,
      amount: numericAmount,
      type,
      category: isExpense ? category : null,
    }
    if (date) {
      const [y, m, d] = date.split("-").map(Number)
      tx.created_at = new Date(y, m - 1, d, 12, 0, 0).toISOString()
    }

    setSubmitting(true)
    const ok = await onAdd(tx)
    setSubmitting(false)
    if (ok) onClose()
  }

  const today = new Date().toISOString().slice(0, 10)
  const fieldClass =
    "w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add transaction"
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-2xl border border-gray-700 bg-gray-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl ${
          // No transition while a finger is dragging (follow in real time);
          // transition on otherwise for the slide in/out + snap-back.
          dragging ? "" : "transition-transform duration-300 ease-out"
        } ${open ? "translate-y-0" : "translate-y-full"}`}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        {/* Grab handle — drag this down to dismiss. Bigger touch target than the
            visible pill so it's easy to grab. */}
        <div
          className="-mx-4 -mt-4 mb-1 flex justify-center px-4 pb-2 pt-4 touch-none"
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
        >
          <div className="h-1.5 w-10 rounded-full bg-gray-700" aria-hidden />
        </div>

        <form onSubmit={handleSubmit}>
          {/* Expense / Income toggle */}
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-gray-800 p-1">
            {[
              { key: "expense", label: "Expense", active: "bg-red-600 text-white" },
              { key: "income", label: "Income", active: "bg-green-600 text-white" },
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setType(opt.key)}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  type === opt.key ? opt.active : "text-gray-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Recent shortcuts (expense only) — one tap to prefill */}
          {isExpense && recents.length > 0 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {recents.map((r) => (
                <button
                  key={`${r.name}|${r.category}`}
                  type="button"
                  onClick={() => applyRecent(r)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:border-gray-500"
                >
                  <span aria-hidden>{categoryIcon(r.category)}</span>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-gray-400">{formatMoney(r.amount)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Amount — big, auto-focused, numeric keypad */}
          <div className="relative mb-3">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-gray-400">
              {CURRENCY}
            </span>
            <input
              ref={amountRef}
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 py-3 pl-10 pr-3 text-3xl font-semibold text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Category chips (expense only) — tap, no dropdown */}
          {isExpense && (
            <div className="mb-3 flex flex-wrap gap-2">
              {expenseCategories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    category === c
                      ? "border-blue-500 bg-blue-600/20 text-blue-200"
                      : "border-gray-700 bg-gray-800 text-gray-300"
                  }`}
                >
                  <span aria-hidden>{categoryIcon(c)}</span>
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Optional note */}
          <input
            type="text"
            placeholder={isExpense ? "Note (optional)" : "Source (e.g. Freelance)"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${fieldClass} mb-3`}
          />

          {/* Date — hidden behind a toggle; defaults to today */}
          {showDate ? (
            <div className="mb-3 flex items-center gap-2">
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                className={fieldClass}
              />
              <button
                type="button"
                onClick={() => { setShowDate(false); setDate("") }}
                className="shrink-0 text-xs text-blue-400 hover:text-blue-300"
              >
                Today
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDate(true)}
              className="mb-3 text-xs text-gray-400 hover:text-gray-200"
            >
              📅 Back-date this
            </button>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-700 px-4 py-3 text-sm font-medium text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 ${
                isExpense ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {submitting ? "Saving…" : isExpense ? "Add expense" : "Add income"}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
