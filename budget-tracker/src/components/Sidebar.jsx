import { NAV_ITEMS } from "../lib/nav"
import NotificationToggle from "./NotificationToggle"
import InstallButton from "./InstallButton"

export default function Sidebar({ view, onChange, email, onSignOut, open, onClose, collapsed, onToggleCollapsed }) {
  function handleNav(key) {
    onChange(key)
    onClose()
  }

  return (
    <>
      {/* Backdrop — only visible on mobile when sidebar is open */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-30 flex w-64 flex-col overflow-hidden border-r border-gray-800 bg-gray-950
          transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0
          md:transition-[width] md:duration-300 md:ease-in-out
          ${collapsed ? "md:w-0 md:border-r-0" : "md:w-56"}
        `}
      >
        {/* Fixed-width inner panel: the <aside> animates its width to 0 on
            desktop collapse, and this panel keeps its size so the content slides
            out cleanly under overflow-hidden instead of reflowing mid-animation. */}
        <div className="flex h-full w-64 flex-col p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] md:w-56">
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 md:hidden"
          aria-label="Close menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Collapse button — desktop only */}
        <button
          onClick={onToggleCollapsed}
          className="absolute right-3 top-3 hidden rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 md:inline-flex"
          aria-label="Hide sidebar"
          title="Hide sidebar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </button>

        <h1 className="mb-4 px-2 text-xl font-bold text-gray-100">Pahirap</h1>

        <div className="mb-4">
          <InstallButton />
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => handleNav(item.key)}
              className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                view === item.key
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-4 border-t border-gray-800 pt-4">
          <NotificationToggle />

          <p className="mt-2 truncate px-3 text-xs text-gray-500" title={email}>
            {email}
          </p>
          <button
            onClick={onSignOut}
            className="mt-2 w-full rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
          >
            Sign out
          </button>
        </div>
        </div>
      </aside>
    </>
  )
}
