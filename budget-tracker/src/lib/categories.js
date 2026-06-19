export const DEFAULT_CATEGORIES = [
  { key: "Food",          label: "Food & Dining",    icon: "🍔" },
  { key: "Transport",     label: "Transport",         icon: "🚗" },
  { key: "Shopping",      label: "Shopping",          icon: "🛒" },
  { key: "Bills",         label: "Bills & Utilities", icon: "📱" },
  { key: "Entertainment", label: "Entertainment",     icon: "🎮" },
  { key: "Health",        label: "Health",            icon: "🏥" },
  { key: "Housing",       label: "Housing",           icon: "🏠" },
  { key: "Other",         label: "Other",             icon: "📦" },
]

// Find the icon for any category key (falls back to 📦 for custom ones).
export function categoryIcon(key) {
  return DEFAULT_CATEGORIES.find((c) => c.key === key)?.icon ?? "📦"
}
