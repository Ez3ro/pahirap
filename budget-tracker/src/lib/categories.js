// The name of the special "Debt" category. Transactions filed here are debt
// payments — money that's left your pocket but isn't discretionary spending — so
// the budget excludes them. It's deliberately NOT in DEFAULT_CATEGORIES below,
// because it shouldn't appear as a budgetable category card; it's only offered as
// a choice when logging a transaction.
export const DEBT_CATEGORY = "Debt"

// Each category carries an icon and a colour. The colour is used for the
// segmented budget ring and the category bars, so they need to be distinct on a
// dark background. Icons chosen to read clearly at small sizes.
export const DEFAULT_CATEGORIES = [
  { key: "Food",          label: "Food & Dining",    icon: "🍜", color: "#f97316" }, // orange-500
  { key: "Transport",     label: "Transport",         icon: "🚌", color: "#38bdf8" }, // sky-400
  { key: "Shopping",      label: "Shopping",          icon: "🛍️", color: "#e879f9" }, // fuchsia-400
  { key: "Bills",         label: "Bills & Utilities", icon: "🧾", color: "#facc15" }, // yellow-400
  { key: "Entertainment", label: "Entertainment",     icon: "🎬", color: "#a78bfa" }, // violet-400
  { key: "Health",        label: "Health",            icon: "💊", color: "#fb7185" }, // rose-400
  { key: "Housing",       label: "Housing",           icon: "🏡", color: "#34d399" }, // emerald-400
  { key: "Other",         label: "Other",             icon: "🔖", color: "#94a3b8" }, // slate-400
]

const CATEGORY_META = {
  ...Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.key, c])),
  [DEBT_CATEGORY]: { key: DEBT_CATEGORY, label: DEBT_CATEGORY, icon: "🏦", color: "#f87171" },
}

// A stable fallback colour for custom categories, picked from this palette by
// hashing the name so the same category always gets the same colour.
const FALLBACK_COLORS = ["#22d3ee", "#c084fc", "#4ade80", "#fbbf24", "#f472b6", "#60a5fa", "#fb923c"]
function fallbackColor(key) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length]
}

// Find the icon for any category key (falls back to 🔖 for custom ones).
export function categoryIcon(key) {
  return CATEGORY_META[key]?.icon ?? "🔖"
}

// Find the display colour for any category (stable per-name for custom ones).
export function categoryColor(key) {
  return CATEGORY_META[key]?.color ?? fallbackColor(key)
}

// A transaction is a debt payment if it was made via the Pay button (flagged) OR
// filed under the Debt category by hand. Either way the budget ignores it. This
// is the single place that decides "is this debt?", so every view agrees.
export function isDebtPayment(transaction) {
  return Boolean(transaction.is_debt_payment) || transaction.category === DEBT_CATEGORY
}

// Budget model used by the auto-budget. Instead of splitting leftover money
// evenly, it funds "needs" first (up to a sensible per-period cap, shared by
// weight), then lets whatever remains spill into "wants". Caps are per PERIOD
// (per paycheck), since budget periods run payday-to-payday. Amounts are in the
// app's currency (₱). Tune these to change how the budget "thinks".
//
//   weight — relative share within a tier when money is tight (bigger = more)
//   cap    — the most this category should get in a period (null = no cap)
export const BUDGET_MODEL = {
  Food:          { tier: "need", weight: 4, cap: 4000 },
  Transport:     { tier: "need", weight: 2, cap: 2000 },
  Bills:         { tier: "need", weight: 3, cap: 3000 },
  Health:        { tier: "need", weight: 2, cap: 1500 },
  Housing:       { tier: "need", weight: 6, cap: 6000 },
  Shopping:      { tier: "want", weight: 2, cap: 1500 },
  Entertainment: { tier: "want", weight: 1, cap: 1000 },
  Other:         { tier: "want", weight: 1, cap: 1000 },
}

// Defaults for any custom category the user added — treated as a modest "want"
// with no hard cap, so the model still does something sensible for it.
export const DEFAULT_BUDGET_RULE = { tier: "want", weight: 1, cap: null }

export function budgetRuleFor(category) {
  return BUDGET_MODEL[category] ?? DEFAULT_BUDGET_RULE
}
