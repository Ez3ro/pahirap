import { useState } from "react"
import { formatMoney, formatDateISO, CURRENCY } from "../lib/format"
import { getMostRecentPayday, getNextPayday } from "../lib/salary"

// App remounts this component (via a `key`) whenever salary settings change,
// so seeding the form inputs from props with useState is enough — no effect
// needed to keep them in sync.
export default function Income({
  settings,
  transactions,
  onSaveSettings,
  onRecordSalary,
  onSkipPayday,
  onUnskipPayday,
}) {
  // Has the user set any salary amounts yet?
  const hasAmounts =
    settings &&
    (Number(settings.period_a_amount) > 0 || Number(settings.period_b_amount) > 0)

  const [periodA, setPeriodA] = useState(settings?.period_a_amount ?? "")
  const [periodB, setPeriodB] = useState(settings?.period_b_amount ?? "")
  // Start locked if amounts already exist; start editable for first-time setup.
  const [editing, setEditing] = useState(!hasAmounts)

  const today = new Date()
  const recentPayday = hasAmounts ? getMostRecentPayday(today, settings) : null
  const nextPayday = hasAmounts ? getNextPayday(today, settings) : null

  // A payday is "handled" once it's been recorded (salary rows carry paid_for)
  // or explicitly skipped.
  const recordedPaydays = new Set(
    transactions.filter((t) => t.paid_for).map((t) => t.paid_for)
  )
  const skippedPaydays = new Set(settings?.skipped_paydays ?? [])
  const isHandled = (payday) =>
    !payday ||
    recordedPaydays.has(payday.dateISO) ||
    skippedPaydays.has(payday.dateISO)

  // What to offer recording. Priority:
  //   1. a past payday you haven't handled yet (you actually got paid), else
  //   2. the next payday IF we're inside its advance window (record early).
  let duePayday = null
  let isAdvance = false
  if (recentPayday && !isHandled(recentPayday)) {
    duePayday = recentPayday
  } else if (nextPayday && !isHandled(nextPayday) && today >= nextPayday.recordableFrom) {
    duePayday = nextPayday
    isAdvance = true
  }

  const [amountToRecord, setAmountToRecord] = useState(duePayday?.amount ?? "")
  const canRecord = Number(amountToRecord) > 0

  // History combines recorded salary (real transactions) and skipped paydays
  // (shown as ₱0, with the option to undo). Sorted newest first.
  const history = [
    ...transactions
      .filter((t) => t.paid_for)
      .map((t) => ({ key: t.id, dateISO: t.paid_for, amount: Number(t.amount), status: "recorded" })),
    ...(settings?.skipped_paydays ?? []).map((d) => ({
      key: `skip-${d}`,
      dateISO: d,
      amount: 0,
      status: "skipped",
    })),
  ].sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1))

  async function handleSaveSettings(event) {
    event.preventDefault()
    await onSaveSettings({ periodA: Number(periodA) || 0, periodB: Number(periodB) || 0 })
    setEditing(false)
  }

  function handleCancel() {
    // Discard edits and relock, restoring the saved values.
    setPeriodA(settings?.period_a_amount ?? "")
    setPeriodB(settings?.period_b_amount ?? "")
    setEditing(false)
  }

  function handleRecord() {
    onRecordSalary({
      dateISO: duePayday.dateISO,
      amount: Number(amountToRecord) || duePayday.amount,
      label: duePayday.periodLabel,
    })
  }

  return (
    <div className="space-y-6">
      {/* Payday nudge */}
      {hasAmounts && (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          {duePayday ? (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden>
                  💵
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-100">
                      Payday {formatDateISO(duePayday.dateISO)}
                    </p>
                    {isAdvance && (
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
                        Advance
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400">
                    {isAdvance ? "Coming up — covers" : "Covers"} the{" "}
                    {duePayday.periodLabel} period.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    {CURRENCY}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountToRecord}
                    onChange={(e) => setAmountToRecord(e.target.value)}
                    className="w-28 rounded-lg border border-gray-600 bg-gray-700 py-2 pl-7 pr-3 text-gray-100"
                  />
                </div>
                <button
                  onClick={handleRecord}
                  disabled={!canRecord}
                  className="whitespace-nowrap rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAdvance ? "Record advance" : "I got paid"}
                </button>
                <button
                  onClick={() => onSkipPayday(duePayday.dateISO)}
                  className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-gray-200"
                >
                  Didn't get paid
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-300">
              You're up to date on salary.
              {nextPayday &&
                ` Next payday: ${formatDateISO(nextPayday.dateISO)} (${formatMoney(
                  nextPayday.amount
                )}).`}
            </p>
          )}
        </div>
      )}

      {/* Salary settings */}
      <form
        onSubmit={handleSaveSettings}
        className="rounded-xl border border-gray-700 bg-gray-800 p-4"
      >
        <h3 className="mb-1 font-semibold text-gray-100">Salary settings</h3>
        <p className="mb-4 text-sm text-gray-400">
          Enter your take-home pay for each half of the month.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col text-sm text-gray-300">
            1st-15th — paid on the 20th
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={periodA}
              onChange={(e) => setPeriodA(e.target.value)}
              disabled={!editing}
              className="mt-1 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-gray-100 placeholder-gray-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          <label className="flex flex-col text-sm text-gray-300">
            16th-end — paid on the 5th
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={periodB}
              onChange={(e) => setPeriodB(e.target.value)}
              disabled={!editing}
              className="mt-1 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-gray-100 placeholder-gray-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          {editing ? (
            <>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Save
              </button>
              {hasAmounts && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
                >
                  Cancel
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700"
              >
                Edit
              </button>
              <span className="text-sm text-green-500">✓ Saved</span>
            </>
          )}
        </div>
      </form>

      {/* History: recorded paydays + skipped ones */}
      <div>
        <h3 className="mb-3 font-semibold text-gray-300">Recorded paydays</h3>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">No salary recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((entry) => (
              <li
                key={entry.key}
                className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 p-3"
              >
                <span className="text-gray-300">{formatDateISO(entry.dateISO)}</span>
                {entry.status === "recorded" ? (
                  <span className="font-semibold text-green-500">
                    +{formatMoney(entry.amount)}
                  </span>
                ) : (
                  <span className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">
                      Didn't get paid · {formatMoney(0)}
                    </span>
                    <button
                      onClick={() => onUnskipPayday(entry.dateISO)}
                      className="text-xs text-blue-400 hover:underline"
                    >
                      Undo
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
