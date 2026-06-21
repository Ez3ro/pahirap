// Client-side push notification plumbing.
//
// Web push works in an installed PWA even when the app is closed: a service
// worker (public/sw.js) receives messages from a push service and shows the
// notification. This file handles the browser half — register the SW, ask the
// user's permission, create a PushSubscription with our VAPID public key, and
// save it to Supabase so the `send-push` Edge Function can reach this device.
//
// iOS note: web push only works once the app has been added to the Home Screen
// (iOS 16.4+). In a normal Safari tab the APIs below are simply absent, which is
// why we feature-detect everywhere rather than assume.

import { supabase } from "./supabase"

// VAPID public key — safe to ship to the client (the private half stays in
// Supabase secrets). Generated once with `npx web-push generate-vapid-keys`.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// True only where the whole push stack exists. iOS Safari tabs fail this until
// the app is installed; older browsers fail it outright.
export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

// Are we running as an installed PWA (home-screen / standalone)? On iOS this is
// the gate for push working at all, so the UI can explain it if not.
export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag for home-screen apps.
    window.navigator.standalone === true
  )
}

export function notificationPermission() {
  return pushSupported() ? Notification.permission : "denied"
}

// Register the service worker (idempotent — the browser dedupes by URL/scope).
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null
  return navigator.serviceWorker.register("/sw.js", { scope: "/" })
}

// VAPID keys are base64url; the PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// Persist a subscription to Supabase, keyed by its endpoint so re-subscribing the
// same device updates rather than duplicates. user_id is filled by the table
// default (auth.uid()); RLS scopes everything to the logged-in user.
async function saveSubscription(subscription) {
  const json = subscription.toJSON()
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      // A hint so multi-device users can tell entries apart later.
      user_agent: navigator.userAgent,
    },
    { onConflict: "endpoint" }
  )
  if (error) throw error
}

// Full enable flow: register SW → request permission → subscribe → save.
// Returns the PushSubscription. Throws with a human-readable message on failure
// so the toggle can surface it.
export async function enableNotifications() {
  if (!pushSupported()) {
    throw new Error(
      isIOS() && !isStandalone()
        ? "On iPhone, add this app to your Home Screen first, then enable notifications from there."
        : "This browser doesn't support notifications."
    )
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error("Missing VITE_VAPID_PUBLIC_KEY — generate VAPID keys and add it to .env (see PUSH_SETUP.md).")
  }

  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    throw new Error("Notifications were blocked. Enable them in your browser/site settings to turn this on.")
  }

  const reg = await registerServiceWorker()
  await navigator.serviceWorker.ready

  // Reuse an existing subscription if present, else create one.
  let subscription = await reg.pushManager.getSubscription()
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true, // required: every push must show a notification
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  await saveSubscription(subscription)
  return subscription
}

// Turn it off: unsubscribe locally and drop the row server-side so we stop being
// pushed to. Best-effort — if the row is already gone that's fine.
export async function disableNotifications() {
  if (!("serviceWorker" in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration()
  const subscription = await reg?.pushManager.getSubscription()
  if (subscription) {
    const endpoint = subscription.endpoint
    await subscription.unsubscribe()
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint)
  }
}

// Is this device currently subscribed AND saved server-side? Used to seed the
// toggle's state on load.
export async function isSubscribed() {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.getRegistration()
  const subscription = await reg?.pushManager.getSubscription()
  return Boolean(subscription)
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
