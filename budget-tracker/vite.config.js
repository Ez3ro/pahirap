import { fileURLToPath, URL } from "node:url"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'


// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Lets us import with "@/..." from anywhere instead of long ../../ paths.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
