// Floating quick-add action. Compact circular "+" by default so it barely covers
// anything; on hover (desktop) it expands to reveal a "Transaction" label. On
// touch there's no hover, so it stays the small circle — which is what we want on
// mobile anyway. Clears the iOS home indicator via the safe-area inset.
export default function AddFab({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Add transaction"
      className="group fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-30 flex h-12 items-center rounded-full bg-blue-600 px-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-[background-color,transform] hover:bg-blue-700 active:scale-95"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
      </svg>
      {/* Label collapsed to width 0; expands on hover. overflow-hidden + max-width
          animate the reveal so the collapsed state is a clean circle. */}
      <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 ease-out group-hover:ml-1.5 group-hover:max-w-32 group-hover:opacity-100">
        Transaction
      </span>
    </button>
  )
}
