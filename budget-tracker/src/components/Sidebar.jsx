import { NAV_ITEMS } from "../lib/nav"

export default function Sidebar({ view, onChange, email, onSignOut }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-gray-800 bg-gray-950 p-4">
      <h1 className="mb-6 px-2 text-xl font-bold text-gray-100">Budget Tracker</h1>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
              view === item.key
                ? "bg-blue-600 text-white"
                : "text-gray-300 hover:bg-gray-800"
            }`}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-4 border-t border-gray-800 pt-4">
        <p className="truncate px-3 text-xs text-gray-500" title={email}>
          {email}
        </p>
        <button
          onClick={onSignOut}
          className="mt-2 w-full rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
