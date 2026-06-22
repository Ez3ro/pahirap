// Service worker for Budget Tracker push notifications.
//
// Lives at the site root (/sw.js) so its scope covers the whole app. It does NOT
// cache anything / make the app work offline — Vercel already serves the static
// build, and an offline cache here would just risk serving stale JS. Its only job
// is to receive web-push messages and show notifications, even when the PWA is
// closed.
//
// The server (Supabase Edge Function `send-push`) sends a JSON payload shaped like:
//   { title, body, tag?, url?, data? }
// We render it as a notification and, on click, focus an open tab or open the app.

self.addEventListener("install", () => {
  // Activate this worker immediately instead of waiting for old tabs to close.
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  // Take control of already-open pages right away.
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  let payload
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // Fall back to treating the raw push body as the notification text.
    payload = { title: "Payday Budget Planner", body: event.data ? event.data.text() : "" }
  }

  const title = payload.title || "Payday Budget Planner"
  const options = {
    body: payload.body || "",
    // tag collapses repeats: a newer alert of the same kind replaces the old one
    // instead of stacking five "you're over budget" notifications.
    tag: payload.tag || "budget-tracker",
    renotify: Boolean(payload.tag),
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Stash where a click should take us, plus anything the server passed through.
    data: { url: payload.url || "/", ...(payload.data || {}) },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || "/"

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If a tab is already open, focus it (and navigate it if it supports that).
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus()
          if ("navigate" in client && targetUrl !== "/") client.navigate(targetUrl)
          return
        }
      }
      // Otherwise open a fresh window.
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
