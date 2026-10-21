import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initDiag } from './utils/diag'
import { isTauri } from './platform'

// Freeze/crash diagnostics → %USERPROFILE%\bankospace-diag.log (desktop only
// — there's no on-disk log file to write to from a browser tab)
if (isTauri) initDiag()

// The desktop app carries its frontend inside the binary; a service worker
// left over from earlier releases could only serve an older copy of it. That
// is not cosmetic — after an update the app kept running the previous
// release's code, sync included, until it was opened a second time. So on the
// desktop every registration and cache is removed, and if this very page was
// served by one, it loads once more from the binary.
async function dropServiceWorkers() {
  if (!('serviceWorker' in navigator)) return false
  const controlled = !!navigator.serviceWorker.controller
  const regs = await navigator.serviceWorker.getRegistrations()
  await Promise.all(regs.map(r => r.unregister()))
  if ('caches' in window) {
    const names = await caches.keys()
    await Promise.all(names.map(n => caches.delete(n)))
  }
  if (controlled && !sessionStorage.getItem('sw_dropped')) {
    sessionStorage.setItem('sw_dropped', '1')
    if (window.__diag) window.__diag(`SW: this load came from a cached copy (${regs.length} registration(s)); reloading from the app itself`, true)
    window.location.reload()
    return true
  }
  return false
}

async function boot() {
  if (isTauri) {
    try { if (await dropServiceWorkers()) return } catch { /* render regardless */ }
  } else {
    // The web build is the installable app; it keeps its service worker.
    import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {})
  }
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
boot()
