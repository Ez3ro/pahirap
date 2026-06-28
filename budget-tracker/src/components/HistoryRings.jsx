import { useState } from "react"
import { formatMoney, formatMoneyCompact } from "../lib/format"
import { historyRingColor } from "../lib/history"

// Apple-Fitness-style spending HISTORY rings: a scrubbable strip of past windows
// (days / weeks / months), each a single ring showing that window's spend against
// its budget pace. Distinct from BudgetRing (the live, category-segmented ring) —
// here every ring is one value and you scrub through time.
//
// Each point comes from lib/history.js: { label, spent, allowance, pct, over }.
// A "closed" ring = you spent up to the allowance; over fills it and wraps a red
// outer arc, exactly like the live BudgetRing's overflow lap. Colour (green /
// amber / red) is owned by historyRingColor so the strip and hero always agree.

// One single-value ring. Reuses BudgetRing's simple-mode geometry verbatim so a
// history ring is visually identical to a closed budget ring.
function HistoryRing({ point, size = 64, selected = false }) {
  const stroke = size >= 120 ? 12 : size >= 90 ? 9 : 7
  const overflowStroke = size >= 120 ? 3 : 2
  const gap = 2
  // Work the radius out from the OUTSIDE in so nothing is ever clipped. The
  // outermost pixel is the overflow ring's outer edge PLUS its round line-cap,
  // which bulges half a stroke past the arc's start at 12 o'clock. Reserve that
  // (overflowStroke for the outer ring's full width + a 1px hairline margin), so
  // even a wrapped "over" ring stays inside the SVG box. Without this the top of
  // the ring gets cut off (the round cap pokes past the edge).
  const outerEdge = size / 2 - overflowStroke - 1
  const radius = outerEdge - overflowStroke - gap - stroke / 2
  const C = 2 * Math.PI * radius

  const pct = point?.pct ?? 0
  const over = point?.over ?? false
  const filled = over ? 1 : Math.min(1, pct / 100)
  const offset = C * (1 - filled)
  const color = historyRingColor(pct, over)

  // Overflow lap: how far past the allowance, as a fraction of the allowance.
  const overflowFrac =
    over && point.allowance > 0 ? Math.min(1, (point.spent - point.allowance) / point.allowance) : 0
  // Outer overflow ring's centerline, just inside outerEdge so its stroke (and
  // round cap) stay within the box.
  const outerR = outerEdge - overflowStroke / 2
  const outerC = 2 * Math.PI * outerR

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        className="block shrink-0 -rotate-90"
        style={{ width: size, height: size }}
        width={size}
        height={size}
      >
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#374151" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.3s ease" }}
        />
        {overflowFrac > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={outerR}
            fill="none"
            stroke="#ef4444"
            strokeWidth={overflowStroke}
            strokeLinecap="round"
            strokeDasharray={`${overflowFrac * outerC} ${outerC}`}
            style={{ transition: "stroke-dasharray 0.4s ease" }}
          />
        )}
      </svg>
      {/* Centre label — big rings show the %, thumbnails stay clean */}
      {size >= 120 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className={`text-2xl font-bold ${over ? "text-red-400" : "text-gray-100"}`}>{pct}%</span>
          <span className="text-xs text-gray-500">used</span>
        </div>
      )}
      {selected && size < 120 && (
        <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-blue-400/70" />
      )}
    </div>
  )
}

const TFS = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
]

// The container: a Daily/Weekly/Monthly toggle, a big hero ring for the selected
// window, and a horizontally-scrollable strip of thumbnails you can scrub. The
// strip lives in its own overflow-x container so the page never scrolls sideways.
//
// Two modes:
//   • Toggle mode (Dashboard) — pass all three arrays; the user switches cadence
//     via the built-in Daily/Weekly/Monthly toggle.
//   • Locked mode (History page sections) — pass `cadence` ("daily"/"weekly"/
//     "monthly"); the toggle is hidden and it shows only that cadence's data.
export default function HistoryRings({ daily = [], weekly = [], monthly = [], cadence = null, hasBudget = true }) {
  // Locked to one cadence when `cadence` is given; otherwise the toggle drives it.
  const [tf, setTf] = useState(cadence || "daily")
  // null = "follow the latest" (the most recent point of the active cadence).
  const [selectedIdx, setSelectedIdx] = useState(null)

  if (!hasBudget) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Set a budget to see your spending history.
      </p>
    )
  }

  const active = cadence || tf
  const data = active === "daily" ? daily : active === "weekly" ? weekly : monthly
  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No history yet.</p>
  }

  // Default selection = the last (most recent) point until the user scrubs.
  const idx = selectedIdx == null ? data.length - 1 : Math.min(selectedIdx, data.length - 1)
  const point = data[idx]

  // Switching cadence resets to "latest" of the new cadence. Done in the click
  // handler (not an effect) to avoid the set-state-in-effect lint rule.
  function pickTf(next) {
    setTf(next)
    setSelectedIdx(null)
  }

  const tfLabel = TFS.find((t) => t.key === active)?.label ?? "Daily"

  return (
    <div>
      {/* Timeframe toggle — only in toggle mode (hidden when locked to a cadence) */}
      {!cadence && (
        <div className="mb-3 flex gap-1 rounded-lg bg-muted/40 p-0.5">
          {TFS.map((t) => (
            <button
              key={t.key}
              onClick={() => pickTf(t.key)}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                active === t.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Hero ring for the selected window */}
      <div className="flex flex-col items-center text-center">
        <HistoryRing point={point} size={140} />
        <p
          className={`mt-3 max-w-full truncate text-3xl font-bold ${point.over ? "text-red-400" : "text-green-400"}`}
          title={point.over ? `${formatMoney(point.spent - point.allowance)} over` : `${formatMoney(Math.max(0, point.allowance - point.spent))} under`}
        >
          {point.over
            ? `${formatMoneyCompact(point.spent - point.allowance)} over`
            : `${formatMoneyCompact(Math.max(0, point.allowance - point.spent))} under`}
        </p>
        <p className="text-xs text-muted-foreground">
          {tfLabel === "Daily" ? point.label : tfLabel === "Weekly" ? `week of ${point.label}` : point.label}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground" title={`${formatMoney(point.spent)} of ${formatMoney(point.allowance)}`}>
          {formatMoney(point.spent)} spent of {formatMoney(point.allowance)}
        </p>
      </div>

      {/* Scrubbable strip — own overflow-x container, never scrolls the page.
          py-2 gives the selection ring + any overflow cap vertical breathing
          room (overflow-x:auto would otherwise clip them on the y-axis). */}
      <div className="mt-4 flex gap-3 overflow-x-auto px-0.5 py-2">
        {data.map((p, i) => (
          <button
            key={`${p.label}-${i}`}
            onClick={() => setSelectedIdx(i)}
            className="flex shrink-0 flex-col items-center gap-1"
            aria-label={`${p.label}: ${p.pct}% of budget`}
          >
            <HistoryRing point={p} size={56} selected={i === idx} />
            <span className={`text-[10px] ${i === idx ? "text-gray-200" : "text-gray-500"}`}>{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
