import { useState } from "react"
import { useInstallPrompt } from "../lib/useInstallPrompt"

// A single "Install app" button that adapts to the platform:
//   • Android/Chrome/Edge — fires the browser's native install prompt.
//   • iOS Safari — Apple blocks programmatic install, so the only way in is the
//     Share → "Add to Home Screen" flow. We can't trigger it, but we CAN tap a
//     button that pops a short visual guide pointing at exactly what to press.
//
// Renders nothing once installed, or on a desktop browser with no prompt —
// unless `alwaysShow` is set, in which case the button is always visible and a
// click with no native prompt available pops a short how-to hint instead.
export default function InstallButton({ className = "", alwaysShow = false }) {
  const { canInstall, isIOS, isInstalled, install } = useInstallPrompt()
  const [showGuide, setShowGuide] = useState(false)
  const [showHint, setShowHint] = useState(false)

  // Already installed → nothing to offer, even in alwaysShow mode.
  if (isInstalled) return null
  if (!alwaysShow && !canInstall && !isIOS) return null

  function handleClick() {
    if (canInstall) install()
    else if (isIOS) setShowGuide(true)
    // No native prompt and not iOS (e.g. desktop, or the browser hasn't armed
    // the prompt yet) → guide the user to the browser's own install option.
    else setShowHint(true)
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={
          className ||
          "w-full rounded-lg border border-blue-700/50 bg-blue-950/40 px-3 py-2 text-sm text-blue-300 hover:bg-blue-900/40"
        }
      >
        Install app
      </button>

      {showHint && (
        <p className="mt-2 text-xs text-blue-300/80">
          Open your browser menu and choose <span className="font-medium">Install app</span> — or
          tap the install icon in the address bar.
        </p>
      )}

      {showGuide && <IOSInstallGuide onClose={() => setShowGuide(false)} />}
    </>
  )
}

// A small centred modal that walks an iOS user through the two manual taps.
function IOSInstallGuide({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-5 text-gray-100 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-bold">Add to Home Screen</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-800"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-400">
          iPhone installs apps straight from Safari — just two taps:
        </p>

        <ol className="space-y-3 text-sm">
          <li className="flex items-center gap-3">
            <Step n={1} />
            <span className="flex flex-wrap items-center gap-1.5">
              Tap the <ShareIcon /> <span className="font-semibold">Share</span> button
              <span className="text-gray-500">(bottom of Safari)</span>
            </span>
          </li>
          <li className="flex items-center gap-3">
            <Step n={2} />
            <span className="flex flex-wrap items-center gap-1.5">
              Choose <PlusIcon /> <span className="font-semibold">Add to Home Screen</span>
            </span>
          </li>
        </ol>

        <p className="mt-4 rounded-lg bg-gray-800/60 p-3 text-xs text-gray-400">
          Make sure you&apos;re in <span className="font-medium text-gray-300">Safari</span> — the
          option doesn&apos;t appear in Chrome or in in-app browsers on iPhone.
        </p>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

function Step({ n }) {
  return (
    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
      {n}
    </span>
  )
}

// Apple's Share glyph: a box with an arrow pointing up out of it.
function ShareIcon() {
  return (
    <svg className="inline h-5 w-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v13" />
      <path d="m8 7 4-4 4 4" />
      <path d="M6 12H5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2h-1" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg className="inline h-5 w-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}
