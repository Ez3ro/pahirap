import { useEffect, useState } from "react"
import {
  pushSupported,
  isStandalone,
  isSubscribed,
  enableNotifications,
  disableNotifications,
  sendLocalTest,
  sendServerTest,
} from "../lib/notifications"

// A compact on/off control for push notifications, shown in the sidebar footer.
// Self-contained: it talks to lib/notifications directly and manages its own
// state, so App doesn't need to thread anything through.
export default function NotificationToggle() {
  const [supported] = useState(() => pushSupported())
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")

  // iPhone needs the app installed to the Home Screen before push works at all.
  const needsInstall = !supported && isIOSLike() && !isStandalone()

  useEffect(() => {
    let alive = true
    if (supported) {
      isSubscribed().then((sub) => {
        if (alive) setOn(sub)
      })
    }
    return () => {
      alive = false
    }
  }, [supported])

  async function toggle() {
    setBusy(true)
    setNote("")
    try {
      if (on) {
        await disableNotifications()
        setOn(false)
      } else {
        await enableNotifications()
        setOn(true)
        setNote("Notifications on 🔔")
      }
    } catch (err) {
      setNote(err.message || "Couldn't change notifications.")
    } finally {
      setBusy(false)
    }
  }

  async function runTest(kind) {
    setBusy(true)
    setNote("")
    try {
      if (kind === "local") {
        await sendLocalTest()
        setNote("Sent a local test — check your notifications.")
      } else {
        const res = await sendServerTest()
        setNote(`Server test sent (delivered to ${res?.sent ?? 0} device${res?.sent === 1 ? "" : "s"}).`)
      }
    } catch (err) {
      setNote(err.message || "Test failed.")
    } finally {
      setBusy(false)
    }
  }

  if (needsInstall) {
    return (
      <p className="px-3 text-xs text-gray-500">
        🔔 Add this app to your Home Screen to turn on notifications.
      </p>
    )
  }
  if (!supported) return null

  return (
    <div className="px-1">
      <button
        onClick={toggle}
        disabled={busy}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-60"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden>🔔</span>
          Notifications
        </span>
        {/* Little pill that reads as a switch. */}
        <span
          className={`relative h-5 w-9 rounded-full transition ${on ? "bg-green-600" : "bg-gray-700"}`}
          aria-hidden
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-4" : "left-0.5"}`}
          />
        </span>
      </button>
      {/* Test buttons — only useful once notifications are on. */}
      {on && (
        <div className="mt-1 flex gap-2 px-3">
          <button
            onClick={() => runTest("local")}
            disabled={busy}
            className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-60"
            title="Show a notification from this device (no server)"
          >
            Test (local)
          </button>
          <button
            onClick={() => runTest("server")}
            disabled={busy}
            className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-60"
            title="Push from the server, end-to-end (needs the function deployed)"
          >
            Test (server)
          </button>
        </div>
      )}
      {note && <p className="px-3 pt-1 text-xs text-gray-500">{note}</p>}
    </div>
  )
}

function isIOSLike() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
