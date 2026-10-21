// Keeps this device's copy of the account's data in step with the cloud.
//
// The order of events is the whole design. The app used to open first and
// pull afterwards: React state was built from whatever this device last had,
// writes made while starting up slipped past the sync layer (it was installed
// later, inside an effect), and the pull then changed localStorage underneath
// a UI that kept rendering — and saving — the old state. Which value reached
// the cloud came down to timing, and two machines on one account could each
// keep a different copy indefinitely.
//
// Now: the layer is installed, the cloud is read, and only then does the app
// mount, so its state starts from data both sides agree on.
import {
  pullFromSupabase, pushKeyToSupabase, pushDirtyToSupabase, markDirty,
  isInSync, getCloudFingerprint, getCachedUserId, purgeApiKeyFromSupabase, SYNC_KEYS,
  readDirtyKeys, syncHealth, writeDeviceStatus, readDeviceStatuses, STATUS_PREFIX,
} from './supabase';

const PUSH_DELAY_MS = 700;
const STARTUP_PULL_TIMEOUT_MS = 4500;
// If the startup pull could not finish, writes made while the app is still
// mounting come from this device's old copy and are not edits. Anything after
// this long is the user's.
const SETTLE_AFTER_MOUNT_MS = 3000;

const native = {
  set: (k, v) => Storage.prototype.setItem.call(localStorage, k, v),
  remove: (k) => Storage.prototype.removeItem.call(localStorage, k),
};

const state = {
  installed: false,
  // A pull has succeeded this session, so the cloud is known and pushes can go.
  ready: false,
  // Writes from here on come from current state and may be edits.
  settled: false,
  lastSeenStamp: null,
  // Keys another machine changed that this window's React state has not yet
  // picked up. Until it reloads, anything it writes for them is stale.
  staleUntilReload: new Set(),
};

const pending = {};
const timers = {};

function diag(msg, warn) { if (window.__diag) window.__diag(msg, warn); }

export function isSyncReady() { return state.ready; }

// ── Outgoing ──────────────────────────────────────────────────────────────

function onLocalWrite(key, value) {
  if (window.__supabasePulling || !SYNC_KEYS.includes(key)) return;
  if (!state.settled) return;
  // Equal to what both sides already hold: a re-save, not an edit.
  if (isInSync(key, value)) return;
  // This window still shows another machine's older version of this key.
  // Writing it back would undo that machine's change.
  if (state.staleUntilReload.has(key)) {
    diag(`SYNC held back stale write of ${key} (reload pending)`);
    return;
  }
  const owner = getCachedUserId();
  // Written down before the timer is even set, because the timer dies with
  // the process and this has to survive it.
  markDirty(key);
  if (!state.ready) return; // offline: it stays marked and goes once a pull succeeds
  pending[key] = { value, owner };
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => {
    delete pending[key];
    pushKeyToSupabase(key, value, owner);
  }, PUSH_DELAY_MS);
}

// Send every queued write now. Returns the requests so a caller that is about
// to close the window can wait for them.
export function flushAll() {
  const keys = Object.keys(pending);
  if (keys.length) diag(`SYNC flush: ${keys.join(', ')}`);
  return keys.map(key => {
    const { value, owner } = pending[key];
    clearTimeout(timers[key]);
    delete pending[key];
    return pushKeyToSupabase(key, value, owner);
  });
}

// Leaving an account drops what is still queued: those values belong to the
// account on the way out.
export function cancelPending() {
  Object.keys(timers).forEach(k => clearTimeout(timers[k]));
  Object.keys(pending).forEach(k => delete pending[k]);
}

export function installSyncLayer() {
  if (state.installed) return;
  state.installed = true;

  localStorage.__origSetItem = native.set;
  localStorage.setItem = function (key, value) {
    // Timed because a slow, main-thread-blocking write is otherwise an
    // invisible freeze.
    const t0 = performance.now();
    native.set(key, value);
    const dt = performance.now() - t0;
    if (dt > 60) {
      const msg = `SLOW setItem('${key}') ${Math.round(dt)}ms (${((value?.length || 0) / 1024).toFixed(0)}KB)`;
      if (window.__diag) window.__diag(msg, true); else console.warn('[perf]', msg);
    }
    onLocalWrite(key, value);
  };

  localStorage.removeItem = function (key) {
    native.remove(key);
    if (!SYNC_KEYS.includes(key) || !state.settled) return;
    if (state.staleUntilReload.has(key)) return;
    markDirty(key);
    if (state.ready) pushKeyToSupabase(key, null);
  };

  // A queued write should not wait for a quit that may never run the close
  // handler (macOS quits without it): send it as soon as the window is left.
  window.addEventListener('blur', flushAll);
  window.addEventListener('pagehide', flushAll);
  window.addEventListener('beforeunload', flushAll);
}

// ── Startup ───────────────────────────────────────────────────────────────

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(undefined), ms))]);
}

// Called before the app mounts. Resolves either way; returns whether the
// cloud was actually read.
export async function startupSync() {
  installSyncLayer();
  state.ready = false;
  state.settled = false;

  if (!localStorage.getItem('apiKeyPurgedFromCloud')) {
    try {
      await purgeApiKeyFromSupabase();
      native.set('apiKeyPurgedFromCloud', '1');
    } catch { /* tried again next start */ }
  }

  const changed = await withTimeout(pullFromSupabase(), STARTUP_PULL_TIMEOUT_MS);
  if (Array.isArray(changed)) {
    diag(`SYNC startup pull ok, changed: [${changed.join(', ')}]`);
    becomeReady();
    getCloudFingerprint().then(f => { if (f) state.lastSeenStamp = f; });
    startStatusReports();
    return true;
  }
  startStatusReports();
  diag('SYNC startup pull did not finish — opening on this device\'s copy', true);
  return false;
}

function becomeReady() {
  state.ready = true;
  state.settled = true;
  // Local work the cloud never received: protected by the pull, now sent.
  pushDirtyToSupabase();
}

// The app has mounted on this device's own copy because the cloud could not
// be read. Its first writes rebuild state it already had; later ones are edits.
export function settleAfterMount() {
  if (state.settled) return;
  setTimeout(() => { state.settled = true; }, SETTLE_AFTER_MOUNT_MS);
}

// ── Incoming while running ────────────────────────────────────────────────

// Keys whose React state is re-read in place by the app; the rest need the
// window to reload to show what arrived.
const HOT_KEYS = new Set(['todos']);

let lastInteraction = Date.now();
['keydown', 'mousedown', 'wheel', 'touchstart'].forEach(ev =>
  window.addEventListener(ev, () => { lastInteraction = Date.now(); }, { capture: true, passive: true }));

function isEditingText() {
  const el = document.activeElement;
  if (!el) return false;
  if (el.isContentEditable) return true;
  if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.value) return true;
  return false;
}

// Reloading drops scroll position and anything half typed, so it waits until
// this window has been left alone for a moment. Focus alone is no guide: on two
// machines each window can be the focused one on its own screen while you type
// on the other.
function canReloadNow() {
  return Date.now() - lastInteraction > 3000 && !isEditingText();
}

let reloadTimer = null;
function scheduleReload() {
  if (reloadTimer) return;
  const attempt = () => {
    if (canReloadNow()) { diag('SYNC reloading to show changes from another device'); window.location.reload(); return; }
    reloadTimer = setTimeout(attempt, 1000);
  };
  reloadTimer = setTimeout(attempt, 250);
}

// Apply what a pull brought in. `rehydrate(key)` re-reads a hot key into
// React state.
function applyChanges(changed, rehydrate) {
  if (!changed || !changed.length) return;
  const cold = [];
  changed.forEach(key => {
    if (HOT_KEYS.has(key)) rehydrate(key);
    else cold.push(key);
  });
  if (!cold.length) return;
  // Components that listen for `storage` can refresh themselves; a write from
  // this same document does not raise that event, so they are told by hand.
  cold.forEach(key => {
    try { window.dispatchEvent(new StorageEvent('storage', { key })); } catch { /* old engines */ }
    state.staleUntilReload.add(key);
  });
  scheduleReload();
}

// Poll for changes made elsewhere. One row, one column per tick; the full pull
// only when that moves.
export function startPolling(rehydrate, intervalMs = 4000) {
  let busy = false;
  const tick = async () => {
    if (busy || !getCachedUserId()) return;
    busy = true;
    try {
      const latest = await getCloudFingerprint();
      if (!latest || latest === state.lastSeenStamp) return;
      const changed = await pullFromSupabase();
      if (changed === null) return;           // unreachable: try again next tick
      state.lastSeenStamp = latest;
      if (!state.ready) becomeReady();       // first contact after an offline start
      if (changed.length) diag(`SYNC tick: [${changed.join(', ')}] changed elsewhere`);
      applyChanges(changed, rehydrate);
    } finally {
      busy = false;
    }
  };
  const iv = setInterval(tick, intervalMs);
  window.addEventListener('focus', tick);
  return () => { clearInterval(iv); window.removeEventListener('focus', tick); };
}

// Ctrl/Cmd+S: send what is queued, then pull at once.
export async function syncNow(rehydrate) {
  await Promise.all(flushAll());
  const changed = await pullFromSupabase();
  if (changed === null) return false;
  if (!state.ready) becomeReady();
  state.lastSeenStamp = (await getCloudFingerprint()) || state.lastSeenStamp;
  applyChanges(changed, rehydrate);
  reportStatus();
  return true;
}

// ── Device status ─────────────────────────────────────────────────────────

function deviceId() {
  let id = localStorage.getItem('__device_id');
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    native.set('__device_id', id);
  }
  return id;
}

function platformName() {
  const ua = navigator.userAgent || '';
  if (/Mac/i.test(ua)) return 'mac';
  if (/Win/i.test(ua)) return 'windows';
  return 'other';
}

async function reportStatus() {
  let binary = null;
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    binary = await getVersion();
  } catch { /* web build */ }
  await writeDeviceStatus(deviceId(), {
    platform: platformName(),
    app: window.__APP_VERSION || null,
    binary,
    clock: new Date().toISOString(),
    ready: state.ready,
    settled: state.settled,
    unsent: [...readDirtyKeys()],
    ...syncHealth,
  });
}

let statusTimer = null;
function startStatusReports() {
  if (statusTimer) return;
  // Once now, so the other machines see this one as soon as it is up, then
  // every minute while it runs.
  setTimeout(reportStatus, 2000);
  statusTimer = setInterval(reportStatus, 60000);
  // What the OTHER devices last reported, for this device's log.
  readDeviceStatuses().then(rows => {
    const mine = STATUS_PREFIX + deviceId();
    rows.filter(r => r.key !== mine).forEach(r => diag(`SYNC other device ${r.key.slice(STATUS_PREFIX.length)}: ${JSON.stringify(r.value)}`));
  });
}

// Exposed for tests.
export const __syncState = state;
