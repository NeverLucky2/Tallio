/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'fonts/**/*'],
      manifest: {
        name: 'Tallio',
        short_name: 'Tallio',
        description: 'Personal finance tracker — your data stays on your device.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#12100e',
        theme_color: '#12100e',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff,woff2,svg,png}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
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
