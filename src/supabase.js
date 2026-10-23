import { createClient } from '@supabase/supabase-js';
import { isTauri } from './platform';
import { nativeSet } from './utils/nativeStorage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

// Desktop: routed through the Rust backend (bypasses WebView2 network
// quirks). Web: routed through /api/proxy (same host-allowlist as Rust's
// fetch commands — see src-tauri/src/main.rs `is_allowed_host`). Either way,
// calls stay off the page's own fetch() so nothing here depends on Supabase's
// CORS headers.
//
// The upstream status code, content type and HTTP method all come through
// intact. Supabase's clients decide success from the status alone; this used
// to answer 200 for everything, so a wrong reset code "verified", and a failed
// sign-in or save looked like it had worked.
const NULL_BODY_STATUS = new Set([204, 205, 304]);

async function tauriFetch(input, init) {
  const url = typeof input === 'string' ? input : input.url;
  const method = (init?.method || 'GET').toUpperCase();
  const headers = {};
  if (init?.headers) {
    const h = init.headers;
    if (h instanceof Headers) {
      h.forEach((v, k) => { headers[k] = v; });
    } else {
      Object.assign(headers, h);
    }
  }
  const body = init?.body != null ? String(init.body) : undefined;

  let reply;
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    reply = await invoke('fetch_http', { url, method, headers, body: body ?? null });
  } else {
    const res = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, method, headers, body }),
    });
    reply = { status: res.status, content_type: res.headers.get('content-type') || '', body: await res.text() };
  }

  // Response() only accepts 200-599 and refuses a body on the no-content codes.
  const status = reply.status >= 200 && reply.status <= 599 ? reply.status : 502;
  return new Response(NULL_BODY_STATUS.has(status) ? null : reply.body, {
    status,
    headers: { 'content-type': reply.content_type || 'application/json' },
  });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: { fetch: tauriFetch },
  auth: { persistSession: true, autoRefreshToken: true },
});

// All localStorage keys to sync
export const SYNC_KEYS = [
  'todos',
  'categoryNames',
  'checklistNames',
  'dailyChecklistItems',
  'longtermChecklistItems',
  'habitTracker_habits',
  'habitTracker_log',
  'habitTracker_autolog',
  'flashCards',
  'flashCardGroups',
  'notes',
  'freeformTabs',
  'quickNotes',
  'goals',
  'invoices',
  'invoiceBasePath',
  'streakData',
  'taskScore',
  'loginHeatmap',
  'bs_contribution_log',
  'payments_v2',
  'kana_learned_words',
  'kana_selected_rows',
  'kana_custom_words',
  'kana_custom_folders',
  'kana_selected_vocab',
  'kana_stats',
  'kana_prefs',
  'kana_best_score',
  'kana_meaning_overrides',
  'reviews_v1',
  'research_watchlist',
  'research_checked',
  'kana_cell_colors',
  'kana_char_notes',
  'ft_profile',
  'ft_goal',
  'ft_weight_log',
  'ft_menu_templates',
  'ft_meals',
  'ft_workouts',
  'ft_measurements',
  'ft_custom_foods',
  'sidebarOrder',
  'todoFontSize',
  'subtaskFontSize',
  'theme',
  'colorTheme',
  'soundVolume',
  'dailyChecklistColor',
  'longtermChecklistColor',
  'dailyChecklistLastReset',
  'longtermChecklistLastReset',
  'dashColWidths',
  'notesSidebarWidth',
  'notesLineSpacing',
  'chat_username',
  'planner_blocks',
  'planner_qtasks',
  'planner_calendars',
  'calendar_week_start',
  'meds_v1',
  'meds_log_v1',
  'betaFeatures_v1',
  'profile_v1',
];

// Cache userId to avoid network call on every push
let cachedUserId = null;
supabase.auth.onAuthStateChange((_event, session) => {
  cachedUserId = session?.user?.id || null;
});

// Who the cached session belongs to right now, without awaiting anything —
// callers use it to stamp a queued write with the account that made it.
export function getCachedUserId() { return cachedUserId; }

// Get current user ID (uses cache, falls back to network once)
async function getUserId() {
  if (cachedUserId) return cachedUserId;
  const { data: { user } } = await supabase.auth.getUser();
  cachedUserId = user?.id || null;
  return cachedUserId;
}


// What the cloud holds right now, as one string: every synced row's stamp.
//
// Asking only for the NEWEST stamp missed changes. A stamp is written by the
// device that made the change, from that device's clock; if one machine's
// clock runs behind the other's, its writes never become the newest and the
// other machine concludes nothing has changed. Any row whose stamp moves —
// forwards or backwards — changes this string.
export async function getCloudFingerprint() {
  try {
    const userId = await getUserId();
    if (!userId) return null;
    const { data, error } = await supabase
      .from('user_data').select('key, updated_at').eq('user_id', userId);
    if (error || !data) return null;
    return data
      .filter(r => SYNC_KEYS.includes(r.key))
      .map(r => `${r.key}@${r.updated_at}`)
      .sort()
      .join('|');
  } catch { return null; }
}

// ── How sync is going on this device ───────────────────────────────────────
//
// Each device files a short status row next to the account's data, so one
// machine can show what another is doing — which build it runs, whether its
// last pull and push worked, what it still holds unsent, what time it thinks
// it is. The rows sit outside SYNC_KEYS: never pulled into localStorage.
export const syncHealth = {
  lastPullOk: null, lastPullError: null,
  lastPushOk: null, lastPushError: null,
};
export const STATUS_PREFIX = '__status:';

export async function writeDeviceStatus(deviceId, status) {
  try {
    const userId = await getUserId();
    if (!userId) return;
    await supabase.from('user_data').upsert({
      user_id: userId, key: STATUS_PREFIX + deviceId, value: status, updated_at: new Date().toISOString(),
    });
  } catch { /* diagnostics only */ }
}

export async function readDeviceStatuses() {
  try {
    const userId = await getUserId();
    if (!userId) return [];
    const { data, error } = await supabase
      .from('user_data').select('key, value, updated_at').eq('user_id', userId)
      .like('key', STATUS_PREFIX + '%');
    if (error || !data) return [];
    return data;
  } catch { return []; }
}

// Normalize a value for semantic comparison (handles JSONB key reordering)
// Recursively sorts object keys so PostgreSQL's alphabetical JSONB output
// matches our original key order
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((acc, k) => { acc[k] = sortKeys(v[k]); return acc; }, {});
  }
  return v;
}

function normalizeForCompare(val) {
  try {
    const obj = typeof val === 'string' ? JSON.parse(val) : val;
    return JSON.stringify(sortKeys(obj));
  } catch {
    return String(val ?? '');
  }
}

// Pull all data from Supabase and write to localStorage.
// Returns the list of keys that actually changed, so the caller can decide
// what to re-read: a boolean only ever supported "reload the whole window".
// `preferLocal`: where this device's value differs from the cloud's, keep this
// device's and send it, instead of taking the cloud's. Used once, on a device
// whose edits could never have been sent (see recoverUnsentEdits in sync.js).
export async function pullFromSupabase({ preferLocal = false } = {}) {
  try {
    const userId = await getUserId();
    // null, not []: "could not reach the cloud" must not read as "nothing new",
    // or a caller would treat this device's possibly stale copy as current.
    if (!userId) return null;

    const { data, error } = await supabase
      .from('user_data')
      .select('key, value')
      .eq('user_id', userId);

    if (error) throw error;

    // More rows than keys means the table holds several rows for one key, and
    // which of them wins below depends on the order the database happens to
    // return them in — two machines can then settle on different values.
    if (window.__diag && data) {
      const distinct = new Set(data.map(r => r.key)).size;
      if (data.length !== distinct) window.__diag(`SYNC pull: ${data.length} rows for ${distinct} keys — DUPLICATE rows in user_data`, true);
    }

    // Local changes that never reached the cloud outrank whatever the cloud
    // still holds for that key — taking the remote copy here is exactly what
    // deleted work typed shortly before the app was closed.
    const dirty = readDirtyKeys();

    // The unwrapped setItem: what the cloud sends is not a local edit.
    const rawSetItem = { call: (_, k, v) => nativeSet(k, v) };

    const changedKeys = [];
    const recovered = [];
    const seen = new Set();

    (data || []).forEach(({ key, value }) => {
      // Only keys this app syncs. Status rows and anything retired from the
      // list live in the same table and must not land in localStorage.
      if (!SYNC_KEYS.includes(key)) return;
      seen.add(key);
      if (value === null || value === undefined) return;
      if (dirty.has(key)) return;

      const supaVal = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return value; } })() : value;
      const supaStr = typeof value === 'string' ? value : JSON.stringify(value);
      const localStr = localStorage.getItem(key);

      // The cloud is empty for this key but this device has data. Keep it —
      // and, unlike before, send it up. Keeping it quietly is what left two
      // machines on one account holding different copies forever: each kept
      // its own, neither ever offered it to the other.
      if (localStr && localStr !== 'null') {
        const supaEmpty =
          supaVal === null ||
          (Array.isArray(supaVal) && supaVal.length === 0) ||
          (typeof supaVal === 'object' && !Array.isArray(supaVal) && Object.keys(supaVal).length === 0);
        if (supaEmpty) {
          if (!isEmptyValue(localStr)) markDirty(key);
          return;
        }
      }

      // Semantic comparison — ignore JSONB key reordering
      const changed = normalizeForCompare(supaVal) !== normalizeForCompare(localStr);

      if (changed && preferLocal && localStr !== null && !isEmptyValue(localStr)) {
        markDirty(key);
        recovered.push(key);
        return;
      }

      noteSynced(key, supaVal);
      if (!changed) return;

      changedKeys.push(key);
      // Flag to prevent overridden setItem from pushing back to Supabase
      window.__supabasePulling = true;
      rawSetItem.call(localStorage, key, supaStr);
      window.__supabasePulling = false;
    });

    // Keys the cloud has never had. They exist only here, so nothing could
    // ever bring them to another machine unless they are sent.
    const onlyHere = [];
    SYNC_KEYS.forEach(key => {
      if (seen.has(key) || dirty.has(key)) return;
      const localStr = localStorage.getItem(key);
      if (localStr !== null && !isEmptyValue(localStr)) { markDirty(key); onlyHere.push(key); }
    });
    // Worth a line: each of these is something the other machines on this
    // account have never been able to see.
    if (onlyHere.length && window.__diag) window.__diag(`SYNC only on this device, sending: [${onlyHere.join(', ')}]`);

    if (recovered.length && window.__diag) window.__diag(`SYNC kept this device's unsent edits, sending: [${recovered.join(', ')}]`, true);
    syncHealth.lastPullOk = new Date().toISOString();
    return changedKeys;
  } catch (e) {
    console.error('Supabase pull error:', e);
    syncHealth.lastPullError = `${new Date().toISOString()} ${e?.message || e}`;
    if (window.__diag) window.__diag(`SYNC pull FAILED: ${e?.message || e}`, true);
    return null;
  }
}

function isEmptyValue(str) {
  try {
    const v = JSON.parse(str);
    return v === null
      || (Array.isArray(v) && v.length === 0)
      || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  } catch { return str === ''; }
}

// anthropic_api_key SYNC_KEYS'ten çıkarıldı (düz metin API anahtarının uzak
// veritabanında durmasını istemiyoruz) — ama bu değişiklikten önce zaten
// senkronize edilmiş kopyalar Supabase'de kalmış olabilir. Bunu tek seferlik
// bir temizlik olarak sil; SYNC_KEYS guard'ını bilerek atlıyor çünkü artık o
// listede olmayan bir key'i kaldırmak amaçlanıyor.
export async function purgeApiKeyFromSupabase() {
  try {
    const userId = await getUserId();
    if (!userId) return;
    await supabase.from('user_data').delete().eq('user_id', userId).eq('key', 'anthropic_api_key');
  } catch (e) {
    console.error('Supabase purge error:', e);
  }
}

// ── Unsynced local changes ──────────────────────────────────────────────────
//
// A local write is queued for a couple of seconds before it is sent. Quit the
// app inside that window — or lose the network, or have the request fail — and
// the cloud still holds the previous value while localStorage holds the new
// one. The next launch then pulled the cloud copy over the top and the change
// was gone for good. That is a silent delete of something the user typed.
//
// So the fact that a key is waiting to be sent is written down, and it
// survives the restart: on the next pull those keys are left alone, because a
// local change that never reached the cloud is by definition newer than what
// the cloud still has. No clock comparison is involved — two machines' clocks
// are not something to stake somebody's data on.
export const DIRTY_KEY = '__sync_dirty';

// Writes go through the untouched setItem: App.jsx replaces localStorage's own
// with one that schedules pushes, and this bookkeeping must not feed itself.
function rawSet(key, value) {
  try { nativeSet(key, value); } catch {}
}

export function readDirtyKeys() {
  try {
    const v = JSON.parse(localStorage.getItem(DIRTY_KEY));
    return Array.isArray(v) ? new Set(v) : new Set();
  } catch { return new Set(); }
}

export function markDirty(key) {
  if (!SYNC_KEYS.includes(key)) return;
  const d = readDirtyKeys();
  if (d.has(key)) return;
  d.add(key);
  rawSet(DIRTY_KEY, JSON.stringify([...d]));
}

function clearDirty(key) {
  const d = readDirtyKeys();
  if (!d.delete(key)) return;
  rawSet(DIRTY_KEY, JSON.stringify([...d]));
}

// After a pull, anything still marked is a local change the cloud has not seen.
// Send it, so the two sides converge instead of the mark living forever.
export async function pushDirtyToSupabase() {
  const dirty = readDirtyKeys();
  if (dirty.size === 0) return;
  const userId = await getUserId();
  if (!userId) return;
  for (const key of dirty) {
    const value = localStorage.getItem(key);
    await pushKeyToSupabase(key, value === null ? null : value);
  }
}

// ── What this device and the cloud agree on ─────────────────────────────────
//
// The app rewrites its own data constantly — every render that saves state
// writes the same bytes again. Treating each of those as an edit is how a
// window holding stale state could push it over newer data from another
// machine. This records, per key, the value both sides last agreed on: after a
// pull, after a successful push. A write equal to it is not a change.
const lastSynced = new Map();

function noteSynced(key, value) {
  if (value === null || value === undefined) lastSynced.delete(key);
  else lastSynced.set(key, normalizeForCompare(value));
}

export function isInSync(key, value) {
  return lastSynced.has(key) && lastSynced.get(key) === normalizeForCompare(value);
}

// Tek bir key'i Supabase'e yaz (value === null ise Supabase'den sil)
export async function pushKeyToSupabase(key, value, expectedUserId) {
  if (!SYNC_KEYS.includes(key)) return;
  try {
    const userId = await getUserId();
    if (!userId) return;
    // A write is queued for a couple of seconds before it leaves. If the
    // account changed in between, this value belongs to the previous one and
    // must not be filed under the new account.
    if (expectedUserId && expectedUserId !== userId) {
      console.warn(`Skipped a queued sync of "${key}": it belonged to the previous account.`);
      return;
    }

    if (value === null || value === undefined) {
      const { error } = await supabase
        .from('user_data')
        .delete()
        .eq('user_id', userId)
        .eq('key', key);
      if (error) throw error;
      noteSynced(key, null);
      if (localStorage.getItem(key) === null) clearDirty(key);
      return;
    }

    let parsed;
    try { parsed = typeof value === 'string' ? JSON.parse(value) : value; }
    catch { parsed = value; }

    const { error } = await supabase
      .from('user_data')
      .upsert({ user_id: userId, key, value: parsed, updated_at: new Date().toISOString() });
    if (error) {
      if (window.__diag) window.__diag(`SYNC push FAILED ${key}: ${error.message || JSON.stringify(error)}`, true);
      throw error;
    }
    syncHealth.lastPushOk = `${new Date().toISOString()} ${key}`;
    noteSynced(key, parsed);
    // Only now is the cloud actually holding this value. Clearing the mark any
    // earlier would hand the next pull permission to overwrite it — and it is
    // cleared only if this is still the latest local value: a newer write made
    // while this request was in flight is still unsent and keeps its mark.
    if (isInSync(key, localStorage.getItem(key))) clearDirty(key);
  } catch (e) {
    console.error('Supabase push error:', e);
    syncHealth.lastPushError = `${new Date().toISOString()} ${key}: ${e?.message || e}`;
  }
}

// Upload all localStorage to Supabase (initial setup)
export async function pushAllToSupabase() {
  const userId = await getUserId();
  if (!userId) return;

  const rows = SYNC_KEYS
    .filter(key => localStorage.getItem(key) !== null)
    .map(key => {
      let value;
      try { value = JSON.parse(localStorage.getItem(key)); }
      catch { value = localStorage.getItem(key); }
      return { user_id: userId, key, value, updated_at: new Date().toISOString() };
    });

  if (rows.length === 0) return;

  try {
    const { error } = await supabase.from('user_data').upsert(rows);
    if (error) throw error;
  } catch (e) {
    console.error('Supabase pushAll error:', e);
  }
}
