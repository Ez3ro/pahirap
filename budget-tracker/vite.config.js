import { fileURLToPath, URL } from "node:url"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest: we own the SW source (src/sw.js) and Workbox injects
      // the hashed asset manifest into it at build time. This lets us keep our
      // existing push-notification handlers while adding precaching on top.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      // We already have public/manifest.webmanifest — don't overwrite it.
      manifest: false,
      // We register the SW ourselves in src/lib/notifications.js.
      injectRegister: null,
      devOptions: {
        enabled: true,
        type: 'classic',
      },
    }),
  ],
  resolve: {
    // Lets us import with "@/..." from anywhere instead of long ../../ paths.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
