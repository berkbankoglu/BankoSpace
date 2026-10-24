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
import { nativeSet, nativeRemove, originals } from './utils/nativeStorage';
import { syncNoteMedia, getMediaSyncStatus } from './utils/noteMediaSync';

const PUSH_DELAY_MS = 700;
const STARTUP_PULL_TIMEOUT_MS = 4500;
// If the startup pull could not finish, writes made while the app is still
// mounting come from this device's old copy and are not edits. Anything after
// this long is the user's.
const SETTLE_AFTER_MOUNT_MS = 3000;

const native = { set: nativeSet, remove: nativeRemove };

const state = {
  installed: false,
  // A pull has succeeded this session, so the cloud is known and pushes can go.
  ready: false,
  // Writes from here on come from current state and may be edits.
  settled: false,
  lastSeenStamp: null,
};

const pending = {};
const timers = {};


function diag(msg, warn) { if (window.__diag) window.__diag(msg, warn); }

// The last few things sync did here, filed with the device status so one
// machine can see what another actually did with an edit — queued it, held
// it back, sent it, failed — instead of only that nothing arrived.
const recent = [];
function note(event, key) {
  recent.push(`${new Date().toISOString().slice(11, 19)} ${event}${key ? ' ' + key : ''}`);
  if (recent.length > 15) recent.shift();
}

// ── What the sync indicator shows ─────────────────────────────────────────
//
// Sending / up to date / changes waiting / offline, and which other devices on
// the account are open. "Open" is judged by watching another device's status
// row change from here — it rewrites it every minute while it runs — rather
// than by the time written inside it: that comes from the other machine's
// clock, which is exactly the thing that cannot be trusted.
const ALIVE_MS = 150000;
const live = { inflight: 0, offline: false, lastOk: null, others: new Map() };
const statusListeners = new Set();

export function getSyncStatus() {
  const media = getMediaSyncStatus();
  const unsent = readDirtyKeys().size + media.pending;
  const sending = live.inflight > 0 || Object.keys(pending).length > 0 || media.uploading > 0;
  let kind;
  if (live.offline) kind = 'offline';
  else if (media.failed) kind = 'media-error';
  else if (!state.ready) kind = 'connecting';
  else if (sending) kind = 'sending';
  else if (unsent) kind = 'unsent';
  else kind = 'synced';
  const now = Date.now();
  const others = [...live.others.values()]
    .map(o => ({ platform: o.platform, app: o.app, active: now - o.seenAliveAt < ALIVE_MS, lastSeen: o.seenAliveAt }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
  return { kind, unsent, lastOk: live.lastOk, others };
}

export function subscribeSyncStatus(cb) {
  statusListeners.add(cb);
  cb(getSyncStatus());
  return () => statusListeners.delete(cb);
}

function emitStatus() {
  const s = getSyncStatus();
  statusListeners.forEach(cb => { try { cb(s); } catch { /* a listener's problem */ } });
}

function reachedCloud() {
  live.offline = false;
  live.lastOk = Date.now();
  emitStatus();
  retryUnsent();
}

// A push that failed leaves its key marked, and nothing else would send it
// again until the same thing was edited or the app restarted — so after a
// network blip a change sat "waiting" indefinitely. Whenever the cloud is
// reachable again, what is still marked goes out. At most every 15 seconds,
// so a write that keeps failing for some other reason does not hammer it.
let lastRetry = 0;
function retryUnsent() {
  if (!state.ready || live.offline) return;
  const now = Date.now();
  if (now - lastRetry < 15000) return;
  const waiting = [...readDirtyKeys()].filter(k => !pending[k]);
  if (!waiting.length) return;
  lastRetry = now;
  waiting.forEach(key => trackedPush(key, localStorage.getItem(key)));
}
function couldNotReachCloud() { live.offline = true; emitStatus(); }

// Every push goes through here so the indicator knows something is in flight.
// A push that declines on purpose (signed out, or a write queued for an
// account just left) is not a network failure; only a request that actually
// failed marks the device offline.
function trackedPush(key, value, owner) {
  live.inflight++;
  emitStatus();
  const errBefore = syncHealth.lastPushError;
  return pushKeyToSupabase(key, value, owner).then(ok => {
    live.inflight--;
    if (ok) reachedCloud();
    else if (syncHealth.lastPushError !== errBefore) couldNotReachCloud();
    else emitStatus();
    return ok;
  });
}

export function isSyncReady() { return state.ready; }

// ── Outgoing ──────────────────────────────────────────────────────────────

function onLocalWrite(key, value) {
  if (window.__supabasePulling || !SYNC_KEYS.includes(key)) return;
  if (!state.settled) return;
  // Equal to what both sides already hold: a re-save, not an edit.
  if (isInSync(key, value)) return;
  // This window still shows another machine's older version of this key.
  // Writing it back would undo that machine's change.
  const owner = getCachedUserId();
  // Written down before the timer is even set, because the timer dies with
  // the process and this has to survive it.
  markDirty(key);
  note('queued', key);
  if (!state.ready) { emitStatus(); return; } // offline: it stays marked and goes once a pull succeeds
  pending[key] = { value, owner };
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => {
    delete pending[key];
    trackedPush(key, value, owner).then(ok => note(ok ? 'sent' : 'push-failed', key));
  }, PUSH_DELAY_MS);
  emitStatus();
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
    return trackedPush(key, value, owner);
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

  // On the prototype, not the object: see src/utils/nativeStorage.js. The
  // guard keeps sessionStorage, which shares this prototype, out of it.
  Storage.prototype.setItem = function (key, value) {
    if (this !== localStorage) return originals.setItem.call(this, key, value);
    // Timed because a slow, main-thread-blocking write is otherwise an
    // invisible freeze.
    const t0 = performance.now();
    native.set(key, value);
    const dt = performance.now() - t0;
    if (dt > 60) {
      const msg = `SLOW setItem('${key}') ${Math.round(dt)}ms (${((value?.length || 0) / 1024).toFixed(0)}KB)`;
      if (window.__diag) window.__diag(msg, true); else console.warn('[perf]', msg);
    }
    onLocalWrite(key, String(value));
  };

  Storage.prototype.removeItem = function (key) {
    if (this !== localStorage) return originals.removeItem.call(this, key);
    native.remove(key);
    if (!SYNC_KEYS.includes(key) || !state.settled) return;
    clearTimeout(timers[key]);
    delete timers[key];
    delete pending[key];
    markDirty(key);
    if (state.ready) trackedPush(key, null);
    else emitStatus();
  };

  // A queued write should not wait for a quit that may never run the close
  // handler (macOS quits without it): send it as soon as the window is left.
  window.addEventListener('blur', flushAll);
  window.addEventListener('pagehide', flushAll);
  window.addEventListener('beforeunload', flushAll);
  window.addEventListener('note-media-sync-status', emitStatus);
}

// ── Startup ───────────────────────────────────────────────────────────────

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(undefined), ms))]);
}

// Called before the app mounts. Resolves either way; returns whether the
// cloud was actually read.
// Earlier releases wrapped localStorage by assigning onto the object. On the
// Mac (WebKit) that never replaced the method — it stored items named after
// it, holding the functions' source — so not one edit made there was sent.
// Those items are the fingerprint of a device in that state. Whatever such a
// device holds that differs from the cloud is its own unsent work, and on its
// first start with the fix it is kept and sent rather than overwritten by the
// cloud's copy, which would otherwise erase it on the very update meant to
// rescue it.
const JUNK_KEYS = ['setItem', 'removeItem', '__origSetItem'];
const isJunk = (k) => {
  const v = localStorage.getItem(k);
  return v !== null && /function|=>/.test(v);
};
function hadBrokenWrapper() { return JUNK_KEYS.some(isJunk); }
// Only once the recovering pull has gone through: if it fails, the marker has
// to survive so the next start tries again.
function clearJunk() { JUNK_KEYS.forEach(k => { if (isJunk(k)) native.remove(k); }); }

export async function startupSync() {
  // Read before installSyncLayer clears those items away.
  const recoverUnsentEdits = hadBrokenWrapper();
  if (recoverUnsentEdits) diag('SYNC this device could never send its edits (old wrapper found) — keeping its copy where it differs from the cloud', true);
  installSyncLayer();
  state.ready = false;
  state.settled = false;

  if (!localStorage.getItem('apiKeyPurgedFromCloud')) {
    try {
      await purgeApiKeyFromSupabase();
      native.set('apiKeyPurgedFromCloud', '1');
    } catch { /* tried again next start */ }
  }

  const changed = await withTimeout(pullFromSupabase({ preferLocal: recoverUnsentEdits }), STARTUP_PULL_TIMEOUT_MS);
  if (Array.isArray(changed)) {
    clearJunk();
    await syncNoteMedia();
    reachedCloud();
    diag(`SYNC startup pull ok, changed: [${changed.join(', ')}]`);
    becomeReady();
    getCloudFingerprint().then(f => { if (f !== null) state.lastSeenStamp = f; });
    startStatusReports();
    return true;
  }
  startStatusReports();
  couldNotReachCloud();
  diag('SYNC startup pull did not finish — opening on this device\'s copy', true);
  return false;
}

function becomeReady() {
  state.ready = true;
  state.settled = true;
  // Local work the cloud never received: protected by the pull, now sent.
  live.inflight++;
  emitStatus();
  pushDirtyToSupabase().finally(() => { live.inflight--; emitStatus(); });
}

// The app has mounted on this device's own copy because the cloud could not
// be read. Its first writes rebuild state it already had; later ones are edits.
export function settleAfterMount() {
  if (state.settled) return;
  setTimeout(() => { state.settled = true; }, SETTLE_AFTER_MOUNT_MS);
}

// ── Incoming while running ────────────────────────────────────────────────

// Keys a section re-reads in place when told, so a change made elsewhere shows
// at once — no reload, nothing held back. Each maps to the event that section
// already listens for (the constants live beside each store: PLANNER_EVENT in
// plannerStore, MEDS_EVENT in medsStore, BETA_EVENT, PROFILE_EVENT…). `todos`
// lives in App's own state and is re-read through `rehydrate`.
const LIVE_EVENTS = {
  notes: 'notes-updated',
  planner_blocks: 'planner-data-changed',
  planner_qtasks: 'planner-data-changed',
  planner_calendars: 'planner-data-changed',
  calendar_week_start: 'planner-data-changed',
  habitTracker_habits: 'habits-updated',
  habitTracker_log: 'habits-updated',
  habitTracker_autolog: 'habits-updated',
  meds_v1: 'meds-changed',
  meds_log_v1: 'meds-changed',
  flashCards: 'flashcards-updated',
  flashCardGroups: 'flashcards-updated',
  freeformTabs: 'storage-updated',
  payments_v2: 'storage',
  betaFeatures_v1: 'beta-features-changed',
  profile_v1: 'profile-updated',
  dashLayout_v1: 'dash-layout-changed',
};
// Held in App's own state and re-read in place through `rehydrate`.
const HOT_KEYS = new Set([
  'todos', 'categoryNames', 'checklistNames',
  'theme', 'colorTheme', 'todoFontSize', 'subtaskFontSize',
]);

function announce(key) {
  const name = LIVE_EVENTS[key];
  try {
    if (name === 'storage') window.dispatchEvent(new StorageEvent('storage', { key }));
    else window.dispatchEvent(new CustomEvent(name, { detail: { key } }));
  } catch { /* old engines */ }
}


// Apply what a pull brought in. It is already in localStorage; this tells
// whoever holds it in memory.
//
// The window is never reloaded for it. That used to happen for any key without
// a live section, as soon as nobody had touched the window for three seconds —
// which in the middle of kana practice, between answers, threw the user back to
// the dashboard. A section that is not on screen reads its data afresh when it
// next opens, so it has nothing to catch up on; one that is on screen shows the
// change when it is next opened, rather than being torn down under the user.
function applyChanges(changed, rehydrate) {
  if (!changed || !changed.length) return;
  changed.forEach(key => {
    if (HOT_KEYS.has(key)) { rehydrate(key); note('applied', key); }
    else if (LIVE_EVENTS[key]) { announce(key); note('applied', key); }
    else {
      // Components that listen for `storage` can refresh themselves; a write
      // from this same document does not raise that event, so it is raised here.
      try { window.dispatchEvent(new StorageEvent('storage', { key })); } catch { /* old engines */ }
      note('stored', key);
    }
  });
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
      if (latest === null) { couldNotReachCloud(); return; }
      if (latest === state.lastSeenStamp) {
        const media = getMediaSyncStatus();
        if (media.pending || media.failed) await syncNoteMedia();
        reachedCloud(); return;
      }
      const changed = await pullFromSupabase();
      if (changed === null) { couldNotReachCloud(); return; } // try again next tick
      await syncNoteMedia();
      reachedCloud();
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
  if (changed === null) { couldNotReachCloud(); return false; }
  await syncNoteMedia();
  reachedCloud();
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
    recent: [...recent],
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
  // What the OTHER devices last reported: once into this device's log, and
  // every half minute for the indicator.
  refreshOthers(true);
  setInterval(refreshOthers, 30000);
}

async function refreshOthers(logThem) {
  const rows = await readDeviceStatuses();
  const mine = STATUS_PREFIX + deviceId();
  const now = Date.now();
  rows.filter(r => r.key !== mine).forEach(r => {
    const id = r.key.slice(STATUS_PREFIX.length);
    if (logThem === true) diag(`SYNC other device ${id}: ${JSON.stringify(r.value)}`);
    const prev = live.others.get(id);
    // Seen to change since the last look: open right now. On the first look
    // there is nothing to compare with, so its own stamp has to do.
    const seenAliveAt = prev
      ? (prev.stamp !== r.updated_at ? now : prev.seenAliveAt)
      : (Math.abs(now - Date.parse(r.updated_at)) < ALIVE_MS ? now : (Date.parse(r.updated_at) || 0));
    live.others.set(id, { platform: r.value?.platform || 'other', app: r.value?.app || null, stamp: r.updated_at, seenAliveAt });
  });
  emitStatus();
}

// Exposed for tests.
export const __syncState = state;
