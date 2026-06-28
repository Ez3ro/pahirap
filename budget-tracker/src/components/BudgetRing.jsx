import { useState } from "react"
import { formatMoney } from "../lib/format"

// An Apple-Fitness-style budget ring.
//
// Two modes:
//   • Simple — pass `pct` (+ `over`): one coloured arc by % used.
//   • Segmented — pass `segments` ([{ color, value }]) and `allowance`: each
//     category is its own coloured arc, sized by its spend. If total spend
//     exceeds the allowance, the arcs fill the whole ring and the OVERFLOW wraps
//     as a second arc on an outer track (like closing an Activity ring twice).
//
// Shared by the Budget page and the Dashboard daily-budget block.
export default function BudgetRing({ pct = 0, over = false, segments = null, allowance = 0, size = 132 }) {
  const stroke = size >= 120 ? 12 : 10
  // The overflow "second lap" ring sits just outside the main ring, so reserve
  // room for it (gap + its stroke) plus a small margin. Without this the outer
  // ring renders past the SVG bounds and gets clipped by the box.
  const overflowStroke = 3
  const gap = 2
  const radius = size / 2 - stroke / 2 - gap - overflowStroke - 2
  const C = 2 * Math.PI * radius

  // Which segment the pointer is over (or was tapped), so the centre can name it.
  const [hovered, setHovered] = useState(null)

  // ── Segmented mode ──────────────────────────────────────────────────────────
  if (segments && segments.length > 0 && allowance > 0) {
    const spent = segments.reduce((s, x) => s + x.value, 0)
    const isOver = spent > allowance
    const usedPct = Math.min(100, Math.round((spent / allowance) * 100))

    // Base layer: each segment as a fraction of the allowance (capped at 1 total).
    // When over, fractions are normalised to fill the ring exactly. Cumulative
    // offsets are precomputed (no mutation during render) so each arc starts where
    // the previous one ended.
    const denom = isOver ? spent : allowance
    const visible = segments.filter((s) => s.value > 0)
    // Cumulative start fraction for each segment = sum of all previous fractions.
    const placed = visible.map((s, i) => ({
      color: s.color,
      label: s.label,
      value: s.value,
      frac: s.value / denom,
      start: visible.slice(0, i).reduce((sum, p) => sum + p.value / denom, 0),
    }))
    const arcs = placed.map((s, i) => {
      const dash = s.frac * C
      return (
        <circle
          key={i}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={s.color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${C - dash}`}
          strokeDashoffset={-s.start * C}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.4s ease, stroke-dasharray 0.4s ease", cursor: "pointer" }}
          onMouseEnter={() => setHovered(s)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => setHovered((h) => (h && h.label === s.label ? null : s))}
        />
      )
    })

    // Overflow: how far past the allowance, as a fraction of the allowance (the
    // part that "wraps"), capped at one extra lap for sanity.
    const overflowFrac = isOver ? Math.min(1, (spent - allowance) / allowance) : 0
    const outerR = radius + stroke / 2 + gap + overflowStroke / 2
    const outerC = 2 * Math.PI * outerR

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="block shrink-0" style={{ width: size, height: size }} width={size} height={size}>
          {/* Track */}
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#374151" strokeWidth={stroke} />
          {arcs}
          {/* Overflow wrap on an outer track */}
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
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: "stroke-dasharray 0.4s ease" }}
            />
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          {hovered ? (
            <>
              <span className="text-sm font-semibold leading-tight" style={{ color: hovered.color }}>
                {hovered.label}
              </span>
              <span className="text-xs text-gray-300">{formatMoney(hovered.value)}</span>
            </>
          ) : (
            <>
              <span className={`font-bold ${size >= 120 ? "text-2xl" : "text-xl"} ${isOver ? "text-red-400" : "text-gray-100"}`}>
                {isOver ? `${Math.round((spent / allowance) * 100)}%` : `${usedPct}%`}
              </span>
              <span className="text-xs text-gray-500">used</span>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Simple mode ───────────────────────────────────────────────────────────────
  const filled = over ? 1 : pct / 100
  const offset = C * (1 - filled)
  const color =
    over        ? "#ef4444"
    : pct >= 90 ? "#ef4444"
    : pct >= 70 ? "#f59e0b"
    : "#22c55e"

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block shrink-0 -rotate-90" style={{ width: size, height: size }}>
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
          style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.3s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-bold ${size >= 120 ? "text-2xl" : "text-xl"} ${over ? "text-red-400" : "text-gray-100"}`}>
          {over ? "100%" : `${pct}%`}
        </span>
        <span className="text-xs text-gray-500">used</span>
      </div>
    </div>
  )
}
