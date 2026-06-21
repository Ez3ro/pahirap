import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerServiceWorker } from './lib/notifications'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register the push service worker on boot (no-op where unsupported). Doing it
// here — not only when the toggle is flipped — means an already-subscribed device
// keeps a live worker to receive pushes after a cold start.
registerServiceWorker()
