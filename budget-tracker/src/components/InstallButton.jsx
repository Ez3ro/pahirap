import { useEffect, useState } from "react"
import { isStandalone } from "../lib/notifications"

// A self-contained "Install app" button that we render ourselves rather than
// relying on the browser's address-bar icon (which is inconsistent and often
// never appears). It works by capturing the `beforeinstallprompt` event the
// browser fires when the PWA is installable, then calling .prompt() on click.
//
// iOS Safari never fires that event, so on an iPhone/iPad that isn't already
// installed we fall back to a short "Add to Home Screen" hint instead.
//
// `variant` lets the same component sit on the light login card ("light") and
// in the dark sidebar ("dark").
//
// `alwaysShow` forces the button to render even before the browser says the app
// is installable. Used on the login page so visitors always see an Install
// option; if no real prompt is available yet, clicking shows a short hint on how
// to install from the browser instead of doing nothing.
export default function InstallButton({ variant = "light", className = "", alwaysShow = false }) {
  const [deferred, setDeferred] = useState(null)
  const [installed, setInstalled] = useState(() => isStandalone())
  const [hint, setHint] = useState(false)

  useEffect(() => {
    if (installed) return

    function onBeforeInstall(e) {
      // Stop the browser's own mini-infobar so our button is the only prompt.
      e.preventDefault()
      setDeferred(e)
    }
    function onInstalled() {
      setInstalled(true)
      setDeferred(null)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [installed])

  async function handleInstall() {
    // No captured prompt yet → we can't trigger the native dialog, so show a
    // short hint on how to install manually instead of doing nothing.
    if (!deferred) {
      setHint(true)
      return
    }
    deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === "accepted") setInstalled(true)
    // A prompt can only be used once; drop it so the button hides afterwards.
    setDeferred(null)
  }

  // Already installed (running standalone) — nothing to offer.
  if (installed) return null

  const canPrompt = !!deferred
  const isIOS = isIOSLike()
  // Auto mode: only render when there's something real to do (a captured prompt,
  // or an iOS device that needs the manual Home Screen route). Prevents a dead
  // button on e.g. desktop Firefox. `alwaysShow` overrides this for the login page.
  if (!alwaysShow && !canPrompt && !isIOS) return null

  const base =
    variant === "dark"
      ? "border-gray-700 text-gray-200 hover:bg-gray-800"
      : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleInstall}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${base}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M10 2a1 1 0 0 1 1 1v7.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L9 10.586V3a1 1 0 0 1 1-1z" />
          <path d="M3 14a1 1 0 0 1 1 1v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1a1 1 0 1 1 2 0v1a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-1a1 1 0 0 1 1-1z" />
        </svg>
        Install app
      </button>

      {hint && (
        <p
          className={`mt-2 text-xs ${
            variant === "dark" ? "text-gray-400" : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {isIOS ? (
            <>
              Tap the Share button, then <span className="font-medium">Add to Home Screen</span>.
            </>
          ) : (
            <>
              Open your browser menu and choose <span className="font-medium">Install app</span> (or
              the install icon in the address bar).
            </>
          )}
        </p>
      )}
    </div>
  )
}

// Rough iOS detection — iPadOS reports as Mac, so also check for touch.
function isIOSLike() {
  const ua = window.navigator.userAgent || ""
  const iOS = /iPad|iPhone|iPod/.test(ua)
  const iPadOS = ua.includes("Macintosh") && "ontouchend" in document
  return iOS || iPadOS
}
