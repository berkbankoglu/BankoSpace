import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo } from '@tauri-apps/api/event';

// Opens a note in its own small window (note.html), on one of its sub-notes
// when subId is given. One window per note: asking again brings the open one
// forward, on the page asked for, instead of a second copy.
export async function openNoteWindow(note, subId = null) {
  const label = `note-${String(note.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const existing = await WebviewWindow.getByLabel(label).catch(() => null);
  if (existing) {
    await existing.unminimize?.().catch(() => {});
    await existing.setFocus().catch(() => {});
    await emitTo(label, 'note-select-sub', subId).catch(() => {});
    return;
  }
  const win = new WebviewWindow(label, {
    url: `note.html?id=${encodeURIComponent(JSON.stringify(note.id))}`
      + (subId != null ? `&sub=${encodeURIComponent(JSON.stringify(subId))}` : ''),
    title: note.title || 'Note',
    width: 620,
    height: 640,
    minWidth: 360,
    minHeight: 280,
    center: true,
    resizable: true,
    decorations: false,
    // Square corners — Windows 11 rounds any window that carries the system
    // shadow, so it has none and draws its own edge — on top of every window,
    // and dark from the first frame so it does not flash white while loading.
    shadow: false,
    alwaysOnTop: true,
    backgroundColor: '#1e1e1e',
    focus: true,
  });
  win.once('tauri://error', (e) => {
    if (window.__diag) window.__diag(`NOTE WINDOW: could not open (${JSON.stringify(e.payload)})`, true);
  });
}
