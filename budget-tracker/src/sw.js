import { precacheAndRoute } from 'workbox-precaching'

// Precache every hashed asset from the Vite build (JS, CSS, icons, etc.) so
// the app shell loads from cache when the device is offline. Workbox injects
// the actual manifest list here at build time; the || [] keeps it safe in dev.
precacheAndRoute(self.__WB_MANIFEST || [])

self.addEventListener('install', () => {
  // Activate immediately so the new SW takes over without waiting for all tabs
  // to close. Paired with clients.claim() below this means the first install
  // starts serving cached assets right away.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// ── Push notifications ────────────────────────────────────────────────────────
// The server (Supabase Edge Function `send-push`) delivers a JSON payload:
//   { title, body, tag?, url?, data? }

self.addEventListener('push', (event) => {
  let payload
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Payday Budget Planner', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Payday Budget Planner'
  const options = {
    body: payload.body || '',
    tag: payload.tag || 'budget-tracker',
    renotify: Boolean(payload.tag),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: payload.url || '/', ...(payload.data || {}) },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client && targetUrl !== '/') client.navigate(targetUrl)
          return
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
