import { useState } from "react"
import { formatMoney } from "../lib/format"

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function isOverdue(loan) {
  if (!loan.promised_date || loan.written_off) return false
  if (Number(loan.amount_paid) >= Number(loan.amount)) return false
  return loan.promised_date < todayISO()
}

function loanStatus(loan) {
  if (loan.written_off) return "written_off"
  if (Number(loan.amount_paid) >= Number(loan.amount)) return "paid"
  if (Number(loan.amount_paid) > 0) return "partial"
  return "pending"
}

export default function LentMoney({ loans, onAdd, onUpdate, onDelete }) {
  const [showForm, setShowForm]       = useState(false)
  const [showSettled, setShowSettled] = useState(false)

  // Form state
  const [borrowerName, setBorrowerName] = useState("")
  const [amount, setAmount]             = useState("")
  const [lentDate, setLentDate]         = useState(todayISO())
  const [promisedDate, setPromisedDate] = useState("")
  const [note, setNote]                 = useState("")
  const [submitting, setSubmitting]     = useState(false)

  const activeLoans  = loans.filter((l) => !l.written_off && Number(l.amount_paid) < Number(l.amount))
  const settledLoans = loans.filter((l) => l.written_off || Number(l.amount_paid) >= Number(l.amount))

  const totalOutstanding = activeLoans.reduce((s, l) => s + Number(l.amount) - Number(l.amount_paid), 0)
  const totalLent        = loans.reduce((s, l) => s + Number(l.amount), 0)
  const overdueCount     = activeLoans.filter(isOverdue).length

  const sortedActive = activeLoans.slice().sort((a, b) => {
    // Overdue first, then soonest due date
    const ao = isOverdue(a) ? 0 : 1
    const bo = isOverdue(b) ? 0 : 1
    if (ao !== bo) return ao - bo
    return (a.promised_date || "9999-12-31").localeCompare(b.promised_date || "9999-12-31")
  })

  async function handleAdd(e) {
    e.preventDefault()
    if (!borrowerName.trim() || !amount) return
    setSubmitting(true)
    await onAdd({
      borrower_name: borrowerName.trim(),
      amount:        Number(amount),
      amount_paid:   0,
      lent_date:     lentDate,
      promised_date: promisedDate || null,
      note:          note.trim() || null,
      written_off:   false,
    })
    setSubmitting(false)
    setBorrowerName("")
    setAmount("")
    setLentDate(todayISO())
    setPromisedDate("")
    setNote("")
    setShowForm(false)
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Outstanding"   value={formatMoney(totalOutstanding)} tone="text-amber-400" />
        <SummaryCard label="Total lent"    value={formatMoney(totalLent)} />
        <SummaryCard
          label="Overdue"
          value={`${overdueCount} loan${overdueCount !== 1 ? "s" : ""}`}
          tone={overdueCount > 0 ? "text-red-400" : "text-gray-400"}
        />
      </div>

      {/* Add loan */}
      {showForm ? (
        <form
          onSubmit={handleAdd}
          className="space-y-3 rounded-xl border border-gray-700 bg-gray-800 p-4"
        >
          <h3 className="font-semibold text-gray-100">Record a loan</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-gray-400">Borrower name *</label>
              <input
                type="text"
                placeholder="e.g. Juan dela Cruz"
                value={borrowerName}
                onChange={(e) => setBorrowerName(e.target.value)}
                required
                autoFocus
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Amount lent *</label>
              <input
                type="number"
                placeholder="0.00"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Date lent</label>
              <input
                type="date"
                value={lentDate}
                onChange={(e) => setLentDate(e.target.value)}
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Promised payment date</label>
              <input
                type="date"
                value={promisedDate}
                onChange={(e) => setPromisedDate(e.target.value)}
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Note (optional)</label>
            <input
              type="text"
              placeholder="e.g. For rent, emergency, will pay after salary"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Save loan"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-gray-500 hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
        >
          <span className="text-lg">+</span> Record a loan
        </button>
      )}

      {/* Active loans */}
      {sortedActive.length === 0 ? (
        <p className="text-sm text-gray-500">No active loans.</p>
      ) : (
        <div className="space-y-3">
          {sortedActive.map((loan) => (
            <LoanCard key={loan.id} loan={loan} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </div>
      )}

      {/* Settled / written off */}
      {settledLoans.length > 0 && (
        <div>
          <button
            onClick={() => setShowSettled((v) => !v)}
            className="flex w-full items-center justify-between text-sm text-gray-500 hover:text-gray-300"
          >
            <span>Settled / written off ({settledLoans.length})</span>
            <span>{showSettled ? "▲" : "▼"}</span>
          </button>
          {showSettled && (
            <div className="mt-3 space-y-3">
              {settledLoans.map((loan) => (
                <LoanCard key={loan.id} loan={loan} onUpdate={onUpdate} onDelete={onDelete} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, tone = "text-gray-100" }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}

// ─── Loan card ────────────────────────────────────────────────────────────────

function LoanCard({ loan, onUpdate, onDelete }) {
  const [expanded, setExpanded]   = useState(false)
  const [payAmount, setPayAmount] = useState("")
  const [paying, setPaying]       = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting]   = useState(false)

  const amountNum   = Number(loan.amount)
  const paidNum     = Number(loan.amount_paid)
  const outstanding = amountNum - paidNum
  const paidPct     = amountNum > 0 ? Math.min(100, Math.round((paidNum / amountNum) * 100)) : 0
  const overdue     = isOverdue(loan)
  const status      = loanStatus(loan)
  const isPaid      = status === "paid"
  const isWrittenOff = status === "written_off"

  async function handlePayment() {
    const n = Number(payAmount)
    if (!n || n <= 0) return
    setPaying(true)
    await onUpdate(loan.id, { amount_paid: Math.min(amountNum, paidNum + n) })
    setPaying(false)
    setPayAmount("")
  }

  async function handleWriteOff() {
    await onUpdate(loan.id, { written_off: true })
    setConfirming(false)
  }

  async function handleDelete() {
    setDeleting(true)
    await onDelete(loan.id)
  }

  function fmtDate(d) {
    if (!d) return null
    return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    })
  }

  function daysOverdue() {
    if (!loan.promised_date) return 0
    const diff = new Date(todayISO()) - new Date(loan.promised_date)
    return Math.floor(diff / 86400000)
  }

  return (
    <div
      className={`rounded-xl border bg-gray-800 p-4 ${
        overdue
          ? "border-red-700/50 shadow-[0_0_12px_rgba(239,68,68,0.12)]"
          : isPaid
          ? "border-green-800/40"
          : "border-gray-700"
      }`}
    >
      {/* Header row — click to expand */}
      <div
        className="flex cursor-pointer items-start justify-between gap-3"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-gray-100">{loan.borrower_name}</span>
            {overdue && (
              <span className="rounded bg-red-900/60 px-1.5 py-0.5 text-xs font-medium text-red-400">
                {daysOverdue()}d overdue
              </span>
            )}
            {isPaid && (
              <span className="rounded bg-green-900/60 px-1.5 py-0.5 text-xs font-medium text-green-400">Paid</span>
            )}
            {isWrittenOff && (
              <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs font-medium text-gray-400">Written off</span>
            )}
            {status === "partial" && (
              <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-xs font-medium text-amber-400">Partial</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            Lent {fmtDate(loan.lent_date)}
            {loan.promised_date && ` · Due ${fmtDate(loan.promised_date)}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-lg font-bold ${overdue ? "text-red-300" : isPaid ? "text-green-400" : "text-gray-100"}`}>
            {formatMoney(outstanding)}
          </p>
          <p className="text-xs text-gray-500">of {formatMoney(amountNum)}</p>
        </div>
      </div>

      {/* Repayment progress bar */}
      {paidNum > 0 && !isWrittenOff && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
          <div
            className={`h-full rounded-full transition-all ${isPaid ? "bg-green-500" : "bg-blue-500"}`}
            style={{ width: `${paidPct}%` }}
          />
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-4 space-y-3 border-t border-gray-700 pt-3 text-sm">
          {loan.note && (
            <p className="text-gray-400">
              <span className="text-gray-600">Note · </span>{loan.note}
            </p>
          )}

          {paidNum > 0 && (
            <p className="text-gray-500 text-xs">
              {formatMoney(paidNum)} paid back so far ({paidPct}%)
            </p>
          )}

          {/* Record payment */}
          {!isPaid && !isWrittenOff && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Amount received"
                min="1"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-40 rounded-lg border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500"
              />
              <button
                type="button"
                onClick={handlePayment}
                disabled={paying || !payAmount}
                className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-40"
              >
                {paying ? "Saving…" : "Record payment"}
              </button>
            </div>
          )}

          {/* Write off / delete */}
          <div className="flex items-center gap-3 pt-1">
            {!isPaid && !isWrittenOff && !confirming && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-xs text-gray-500 hover:text-amber-400"
              >
                Write off
              </button>
            )}
            {confirming && (
              <>
                <span className="text-xs text-gray-400">Give up collecting this?</span>
                <button type="button" onClick={handleWriteOff} className="text-xs text-amber-400 hover:text-amber-300">
                  Yes, write off
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="text-xs text-gray-500 hover:text-gray-300">
                  Cancel
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="ml-auto text-xs text-gray-600 hover:text-red-400 disabled:opacity-40"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
