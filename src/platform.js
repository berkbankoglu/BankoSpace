// Central "are we running inside the Tauri desktop shell, or a plain browser
// tab?" switch, plus one web-safe equivalent for every Tauri-only API the
// app uses. Every call site should go through here instead of importing
// @tauri-apps/* directly, so desktop and web share one code path.

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Same shape as the Rust `fetch_get`/`fetch_post` commands: pass a URL (only
// api.anthropic.com / github.com / *.supabase.co are allowed — see
// src-tauri/src/main.rs `is_allowed_host` and api/proxy.js, which mirrors it)
// and get the response body back as text.
export async function proxyFetch(url, { method = 'GET', headers = {}, body } = {}) {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return method.toUpperCase() === 'GET'
      ? invoke('fetch_get', { url, headers })
      : invoke('fetch_post', { url, headers, body: body || '' });
  }
  const res = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, method, headers, body }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Proxy request failed (${res.status})`);
  return text;
}

// Native confirm dialog on desktop, window.confirm in the browser.
export async function confirmAsync(message, options) {
  if (isTauri) {
    const { ask } = await import('@tauri-apps/plugin-dialog');
    return ask(message, options);
  }
  return window.confirm(message);
}

export async function notifyPermission() {
  if (isTauri) {
    const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
    if (await isPermissionGranted()) return true;
    return (await requestPermission()) === 'granted';
  }
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

export async function notify(title, body) {
  if (isTauri) {
    const { sendNotification } = await import('@tauri-apps/plugin-notification');
    return sendNotification({ title, body });
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(title, { body });
}

// Save a JSON string to a file the user picks (desktop) or triggers as a
// browser download (web).
export async function exportJSON(filename, dataStr) {
  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: filename, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!path) return false;
    await writeTextFile(path, dataStr);
    return true;
  }
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}

// Save arbitrary text (e.g. exported HTML) the same way as exportJSON, just
// with a caller-supplied mime type.
export async function exportText(filename, dataStr, mime = 'text/plain') {
  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const ext = filename.split('.').pop();
    const path = await save({ defaultPath: filename, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return false;
    await writeTextFile(path, dataStr);
    return true;
  }
  const blob = new Blob([dataStr], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}

// Resolves with the picked file's text content, or null if the user cancelled.
export async function importJSON() {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!path) return null;
    return readTextFile(path);
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

// Custom title-bar controls — no-ops in the browser, which draws its own
// window chrome (the title bar row itself should be hidden on web, see the
// `isTauri` check at each render site).
export const windowControls = {
  async minimize() {
    if (!isTauri) return;
    try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().minimize(); } catch {}
  },
  async maximize() {
    if (!isTauri) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const w = getCurrentWindow();
      (await w.isMaximized()) ? await w.unmaximize() : await w.maximize();
    } catch {}
  },
  async close() {
    if (!isTauri) return;
    try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().close(); } catch {}
  },
};

// Manual window dragging, replacing data-tauri-drag-region.
//
// The native path (WM_NCLBUTTONDOWN) hands the window to Windows' own modal
// move loop, which exits only when it sees the matching button-up. On a machine
// with global mouse-remapping software that button-up can be swallowed, and the
// loop then waits for it forever — the window's event loop stops being serviced
// and the app looks frozen at zero CPU. Positioning the window ourselves never
// enters that loop, so there is no mode left to get stuck in, and the drag has
// several independent ways to end (button up, Escape, focus loss, the pointer
// leaving the window) instead of exactly one.
export function startWindowDrag(e) {
  if (!isTauri) return;
  if (e.button !== 0) return;
  if (e.target.closest('button, input, textarea, select, a, [data-no-drag]')) return;
  e.preventDefault();

  const startClientX = e.screenX;
  const startClientY = e.screenY;

  let cancelled = false;
  let frame = null;
  let pending = null;
  let ctx = null; // { win, PhysicalPosition, originX, originY, scale }

  const cleanup = () => {
    cancelled = true;
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', stop, true);
    window.removeEventListener('blur', stop, true);
    window.removeEventListener('keydown', onKey, true);
  };

  const stop = () => cleanup();
  const onKey = (ev) => { if (ev.key === 'Escape') cleanup(); };

  const flush = () => {
    frame = null;
    if (!ctx || !pending || cancelled) return;
    const { win, PhysicalPosition, originX, originY, scale } = ctx;
    const dx = Math.round((pending.x - startClientX) * scale);
    const dy = Math.round((pending.y - startClientY) * scale);
    pending = null;
    win.setPosition(new PhysicalPosition(originX + dx, originY + dy)).catch(() => {});
  };

  const onMove = (ev) => {
    // A move with no button held means the button-up went missing — the very
    // failure the native loop can't recover from. End the drag.
    if ((ev.buttons & 1) === 0) { cleanup(); return; }
    pending = { x: ev.screenX, y: ev.screenY };
    if (!frame) frame = requestAnimationFrame(flush);
  };

  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', stop, true);
  window.addEventListener('blur', stop, true);
  window.addEventListener('keydown', onKey, true);

  (async () => {
    try {
      const [{ getCurrentWindow }, { PhysicalPosition }] = await Promise.all([
        import('@tauri-apps/api/window'),
        import('@tauri-apps/api/dpi'),
      ]);
      const win = getCurrentWindow();
      const scale = await win.scaleFactor();

      // Dragging a maximized window restores it first, keeping the cursor at
      // the same relative spot across the title bar — what the native drag does.
      if (await win.isMaximized()) {
        const outerBefore = await win.outerSize();
        const ratio = outerBefore.width > 0
          ? ((e.screenX * scale) - (await win.outerPosition()).x) / outerBefore.width
          : 0.5;
        await win.unmaximize();
        const outerAfter = await win.outerSize();
        const x = Math.round(e.screenX * scale - outerAfter.width * ratio);
        const y = Math.round(e.screenY * scale - 16 * scale);
        await win.setPosition(new PhysicalPosition(x, y));
      }

      const pos = await win.outerPosition();
      if (cancelled) return;
      ctx = { win, PhysicalPosition, originX: pos.x, originY: pos.y, scale };
      if (pending && !frame) frame = requestAnimationFrame(flush);
    } catch {
      cleanup();
    }
  })();
}
