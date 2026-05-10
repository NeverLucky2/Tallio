/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Allow tunnel hosts (cloudflared, localtunnel, ngrok) for phone-pairing dev testing.
    allowedHosts: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
