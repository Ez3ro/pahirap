import { useState } from "react"
import { streaks, canMarkNoSpend } from "../lib/streak"

// The dashboard streak block: two run-counters that reward consistent habits,
// plus the "No spending today" pill that lets a genuinely spend-free day still
// count for the tracking streak.
//
//   🔥 Tracking   — consecutive days you logged something OR marked no-spend
//   🎯 Under budget — consecutive days your discretionary spend stayed in pace
//
// Streaks are derived (never stored as a counter) from transactions + the budget
// + the no-spend marks, so they can't drift. The under-budget streak is hidden
// when no budget is set — there's nothing to measure against.
export default function StreakCard({
  transactions = [],
  budgetLimits = [],
  noSpendKeys,
  periodFor,
  onMarkNoSpend,
}) {
  const [marking, setMarking] = useState(false)

  const data = streaks(transactions, budgetLimits, noSpendKeys, periodFor, 60, new Date())
  // Show the button only when today is genuinely empty (no tx, no existing mark).
  const showNoSpend = canMarkNoSpend(transactions, noSpendKeys, new Date()) && !!onMarkNoSpend

  async function handleMark() {
    setMarking(true)
    await onMarkNoSpend()
    setMarking(false)
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <StreakStat
        icon="🔥"
        label="Tracking streak"
        current={data.tracking.current}
        longest={data.tracking.longest}
        note="days logged or marked"
        tone="text-orange-400"
        fireAt={[10, 20]}
      />
      {data.hasBudget ? (
        <StreakStat
          icon="🎯"
          label="Under-budget streak"
          current={data.underBudget.current}
          longest={data.underBudget.longest}
          note="days within your pace"
          tone="text-green-400"
        />
      ) : (
        <div className="flex flex-col justify-center rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          Set a budget to track an under-budget streak.
        </div>
      )}

      {/* No spending today — spans both columns. Only when today is empty. */}
      {showNoSpend ? (
        <button
          onClick={handleMark}
          disabled={marking}
          className="col-span-full flex items-center justify-center gap-2 rounded-xl border border-green-700/50 bg-green-950/30 px-4 py-3 text-sm font-medium text-green-300 transition-colors hover:bg-green-900/40 disabled:opacity-50 sm:col-span-2"
        >
          <span aria-hidden>✅</span>
          {marking ? "Saving…" : "No spending today"}
        </button>
      ) : (
        <p className="col-span-full text-center text-xs text-muted-foreground sm:col-span-2">
          {data.tracking.current > 0 ? "Today's counted — keep it going. 🔥" : "Log a spend or mark a no-spend day to start a streak."}
        </p>
      )}
    </div>
  )
}

// One streak counter: big current run, with the personal best beneath.
//
// `fireAt` is an optional [hot, inferno] day-threshold pair that lights the card up
// in tiers as the streak grows:
//   < hot      — plain card, static emoji
//   ≥ hot       — flame border + a pure-CSS dancing flame icon
//   ≥ inferno   — the same, intensified: thicker/faster fiery ring + a bigger,
//                 wilder flame ("bigger, faster, intense")
function StreakStat({ icon, label, current, longest, note, tone, fireAt }) {
  const [hot, inferno] = fireAt ?? [Infinity, Infinity]
  const isInferno = current >= inferno
  const isHot = current >= hot
  const borderClass = isInferno
    ? "flame-border flame-border--intense"
    : isHot
    ? "flame-border"
    : "border-border"

  return (
    <div className={`relative rounded-xl border bg-card p-4 ${borderClass}`}>
      {/* Rotating-fire ring overlay — a sibling of the content so the ring's mask
          never clips the text. The content below sits above it via relative z-index. */}
      {isHot && <span className="flame-border__fire" aria-hidden />}
      <div className="relative z-[1]">
        <div className="flex items-center gap-2">
          {isHot ? (
            <span
              className={`css-flame text-xl ${isInferno ? "css-flame--intense" : ""}`}
              role="img"
              aria-label="on fire"
            />
          ) : (
            <span className="text-xl" aria-hidden>{icon}</span>
          )}
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
        </div>
        <p className={`mt-2 text-3xl font-bold ${tone}`}>
          {current}
          <span className="ml-1.5 text-base font-medium text-muted-foreground">
            day{current === 1 ? "" : "s"}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
        <p className="mt-1 text-[11px] text-gray-500">Best: {longest} day{longest === 1 ? "" : "s"}</p>
      </div>
    </div>
  )
}
