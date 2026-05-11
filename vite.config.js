/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Pin the port so localStorage stays at the same origin across restarts.
    // strictPort: true means Vite fails loudly on port conflict instead of
    // silently drifting to a different port (which would orphan saved bills).
    port: 5173,
    strictPort: true,
    // Allow tunnel hosts (cloudflared, localtunnel, ngrok) for phone-pairing dev testing.
    allowedHosts: true,
  },
  test: {
    // jsdom is global so .jsx component tests work. Existing pure-JS tests
    // use no DOM APIs and pass safely here. (Vitest 4 dropped
    // environmentMatchGlobs, so we can't split per-glob.)
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
