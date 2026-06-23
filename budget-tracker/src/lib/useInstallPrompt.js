import { useState, useEffect } from 'react'

function detectIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function detectInstalled() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

// Captures the browser's beforeinstallprompt event (Android/Chrome/Edge) so we
// can show a custom install button instead of the default mini-infobar. Also
// detects iOS Safari where the prompt API doesn't exist and the user has to use
// the Share → "Add to Home Screen" flow manually.
//
// Returns:
//   canInstall  — true when a prompt is ready (show an "Install" button)
//   isIOS       — true on iOS Safari, not yet installed (show the Share hint)
//   isInstalled — already running as a standalone PWA
//   install()   — triggers the native install prompt
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(detectInstalled)

  useEffect(() => {
    function onBeforeInstall(e) {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    function onInstalled() {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  const ios = detectIOS()
  return {
    canInstall: Boolean(deferredPrompt) && !installed,
    isIOS: ios && !installed,
    isInstalled: installed,
    install,
  }
}
