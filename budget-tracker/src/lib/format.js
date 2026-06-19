// Change this one line to switch the whole app to a different currency.
export const CURRENCY = "₱"

export function formatMoney(amount) {
  const formatted = Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${CURRENCY}${formatted}`
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
