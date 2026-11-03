import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { emitTo } from '@tauri-apps/api/event';

const WIDTH = 620;
const HEIGHT = 640;

// Where BankoSpace itself is, in physical pixels, so the note opens over it —
// on whichever screen it is on — rather than in the middle of the primary one.
async function mainRect() {
  try {
    const main = getCurrentWindow();
    const [pos, size, scale] = await Promise.all([main.outerPosition(), main.outerSize(), main.scaleFactor()]);
    return { x: pos.x, y: pos.y, w: size.width, h: size.height, scale };
  } catch {
    return null;
  }
}

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
  const rect = await mainRect();
  // A first guess in logical pixels at the main window's scale; corrected in
  // physical pixels once the window exists, since screens can differ in DPI.
  const place = rect
    ? { x: Math.round((rect.x + (rect.w - WIDTH * rect.scale) / 2) / rect.scale),
        y: Math.round((rect.y + (rect.h - HEIGHT * rect.scale) / 2) / rect.scale) }
    : { center: true };
  const win = new WebviewWindow(label, {
    url: `note.html?id=${encodeURIComponent(JSON.stringify(note.id))}`
      + (subId != null ? `&sub=${encodeURIComponent(JSON.stringify(subId))}` : ''),
    title: note.title || 'Note',
    width: WIDTH,
    height: HEIGHT,
    minWidth: 360,
    minHeight: 280,
    ...place,
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
  if (rect) {
    win.once('tauri://created', async () => {
      try {
        const size = await win.outerSize();
        await win.setPosition(new PhysicalPosition(
          Math.round(rect.x + (rect.w - size.width) / 2),
          Math.round(rect.y + (rect.h - size.height) / 2),
        ));
      } catch { /* the first guess stands */ }
    });
  }
  win.once('tauri://error', (e) => {
    if (window.__diag) window.__diag(`NOTE WINDOW: could not open (${JSON.stringify(e.payload)})`, true);
  });
}
