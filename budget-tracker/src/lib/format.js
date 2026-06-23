// Change this one line to switch the whole app to a different currency.
export const CURRENCY = "₱"

export function formatMoney(amount) {
  const formatted = Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${CURRENCY}${formatted}`
}

// Compact display for big headline figures in small spaces (stat cards, ring
// centres). At/above ₱100,000 it shortens to ₱100K / ₱1.2M / ₱3.4B; below that
// it falls back to the exact formatMoney so everyday amounts stay precise.
//
// IMPORTANT: this is for DISPLAY ONLY. Never store, edit, or do maths on the
// compacted string — the full-precision number is what counts. Always pair it
// with formatMoney(amount) in a `title` tooltip so the exact value is one hover
// (or long-press) away.
export function formatMoneyCompact(amount) {
  const n = Number(amount) || 0
  const abs = Math.abs(n)
  if (abs < 100_000) return formatMoney(n)

  // Sign goes AFTER the currency symbol to match formatMoney (₱-250K), so the
  // compact and full forms read consistently.
  const sign = n < 0 ? "-" : ""
  const units = [
    { value: 1_000_000_000, suffix: "B" },
    { value: 1_000_000, suffix: "M" },
    { value: 1_000, suffix: "K" },
  ]
  for (const { value, suffix } of units) {
    if (abs >= value) {
      const scaled = abs / value
      // One decimal, but drop a trailing ".0" (₱100K, not ₱100.0K).
      const text = scaled.toLocaleString(undefined, { maximumFractionDigits: 1 })
      return `${CURRENCY}${sign}${text}${suffix}`
    }
  }
  return formatMoney(n)
}

// Turn a "YYYY-MM-DD" string into "DD/MM/YYYY". We split the string rather than
// using new Date(), which would shift the day depending on the time zone.
export function formatDateISO(iso) {
  if (!iso) return ""
  const [year, month, day] = iso.split("-")
  return `${day}/${month}/${year}`
}

// Format a Date object as "Oct 2026".
export function formatMonthYear(date) {
  if (!date) return ""
  return date.toLocaleDateString("en-PH", { month: "short", year: "numeric" })
}
