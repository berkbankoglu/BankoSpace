import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The service worker answers any navigation it doesn't recognise with
      // index.html — the single-page-app fallback. That is right for the app's
      // own routes and wrong for the Tauri-only windows: asking for
      // snap-preview.html got the whole application back, so the little
      // outline window quietly booted a second copy of BankoSpace (its own
      // APP START, its own update check, and a pile of permission errors
      // because those APIs are only granted to the main window).
      workbox: {
        navigateFallbackDenylist: [
          /^\/kana\.html$/,
          /^\/confirmed\.html$/,
        ],
      },
      // kana.html is a Tauri-only popup window entry — never opened directly
      // on the web, so it shouldn't be part of the installable app shell.
      includeManifestIcons: false,
      manifest: {
        name: 'BankoSpace',
        short_name: 'BankoSpace',
        description: 'Your personal workspace',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    open: false
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
kana: resolve(__dirname, 'kana.html'),
      }
    }
  }
})
