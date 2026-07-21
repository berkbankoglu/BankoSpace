// Freeze/crash diagnostics — writes a timeline to a log file on disk so the
// cause of intermittent freezes can be inspected after the fact (no need to
// watch the DevTools console live).
//
// Log file: %USERPROFILE%\bankospace-diag.log  (e.g. C:\Users\brkbn\bankospace-diag.log)
//
// What it captures:
//  - a heartbeat every 2s with JS heap usage (spots memory growth → OOM)
//  - FREEZE lines whenever the heartbeat is late (UI thread was blocked) with
//    how long it was blocked
//  - LONGTASK entries (any main-thread task ≥200ms) via PerformanceObserver
//  - uncaught errors and unhandled promise rejections
//  - slow localStorage writes (reported via window.__diag from App.jsx)
//
// This is temporary instrumentation for debugging; safe to remove later.

import { invoke } from '@tauri-apps/api/core';

let queue = [];

function ts() {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

export function diag(line, alsoConsole = false) {
  queue.push(`[${ts()}] ${line}`);
  if (alsoConsole) console.warn('[diag]', line);
}

async function flush() {
  if (queue.length === 0) return;
  const batch = queue.join('\n');
  queue = [];
  try { await invoke('diag_log', { line: batch }); } catch (e) { /* ignore */ }
}

let started = false;
export function initDiag() {
  if (started) return;
  started = true;
  window.__diag = diag; // let other modules (App.jsx) report without importing

  const mem = () => {
    const m = performance.memory;
    return m ? ` heap=${Math.round(m.usedJSHeapSize / 1048576)}/${Math.round(m.jsHeapSizeLimit / 1048576)}MB` : '';
  };

  diag(`=== APP START ===${mem()} ua=${navigator.userAgent}`, true);

  // Flush the buffer to disk regularly.
  setInterval(flush, 1000);

  // Uncaught errors / rejections often precede a hang or a blank screen.
  window.addEventListener('error', (e) => {
    diag(`ERROR: ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`, true);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    diag(`REJECTION: ${(r && (r.message || r.toString())) || r}`, true);
  });

  // Any main-thread task ≥200ms blocks the UI; log it.
  try {
    new PerformanceObserver((list) => {
      for (const en of list.getEntries()) {
        if (en.duration >= 200) diag(`LONGTASK ${Math.round(en.duration)}ms`, en.duration >= 500);
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch (e) { /* longtask unsupported */ }

  // Heartbeat: if the interval fires much later than 2s, the UI thread was
  // blocked in between — that gap IS the freeze, and we record its length.
  // Check for freezes every 2s (so short hangs are caught), but only write a
  // heartbeat line every ~30s to keep the log small during normal runs.
  let last = performance.now();
  let tick = 0;
  setInterval(() => {
    const now = performance.now();
    const gap = now - last;
    last = now;
    if (gap > 3500) diag(`FREEZE gap=${Math.round(gap)}ms (UI was blocked ~${Math.round(gap - 2000)}ms)${mem()}`, true);
    else if (++tick % 15 === 0) diag(`hb${mem()}`);
  }, 2000);

  // Best-effort flush when the window is closing.
  window.addEventListener('beforeunload', () => { diag('=== APP UNLOAD ==='); flush(); });
}
