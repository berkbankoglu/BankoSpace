import { createClient } from '@supabase/supabase-js';
import { isTauri } from './platform';

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

// Lightweight check: get the latest updated_at across all user rows
export async function getLatestUpdateTime() {
  try {
    const userId = await getUserId();
    if (!userId) return null;
    const { data, error } = await supabase
      .from('user_data')
      .select('updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error || !data?.length) return null;
    return data[0].updated_at;
  } catch { return null; }
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

// Pull all data from Supabase and write to localStorage
// Returns true only if data actually changed semantically
export async function pullFromSupabase() {
  try {
    const userId = await getUserId();
    if (!userId) return false;

    const { data, error } = await supabase
      .from('user_data')
      .select('key, value')
      .eq('user_id', userId);

    if (error) throw error;

    if (data && data.length > 0) {
      // Local changes that never reached the cloud outrank whatever the cloud
      // still holds for that key — taking the remote copy here is exactly what
      // deleted work typed shortly before the app was closed.
      const dirty = readDirtyKeys();

      // Use raw setItem to avoid triggering push-back to Supabase during pull
      const rawSetItem = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')?.value
        || localStorage.__origSetItem
        || localStorage.setItem.bind(localStorage);

      let anyChanged = false;

      data.forEach(({ key, value }) => {
        if (value === null || value === undefined) return;
        if (dirty.has(key)) return;

        const supaVal = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return value; } })() : value;
        const supaStr = typeof value === 'string' ? value : JSON.stringify(value);
        const localStr = localStorage.getItem(key);

        // Supabase'deki değer boşsa ve localStorage doluysa, localStorage'ı koru
        if (localStr && localStr !== 'null') {
          const supaEmpty =
            supaVal === null ||
            (Array.isArray(supaVal) && supaVal.length === 0) ||
            (typeof supaVal === 'object' && !Array.isArray(supaVal) && Object.keys(supaVal).length === 0);
          if (supaEmpty) return;
        }

        // Semantic comparison — ignore JSONB key reordering
        const changed = normalizeForCompare(supaVal) !== normalizeForCompare(localStr);
        if (!changed) return;

        anyChanged = true;
        // Flag to prevent overridden setItem from pushing back to Supabase
        window.__supabasePulling = true;
        rawSetItem.call(localStorage, key, supaStr);
        window.__supabasePulling = false;
      });

      return anyChanged;
    }
    return false;
  } catch (e) {
    console.error('Supabase pull error:', e);
    return false;
  }
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
  const fn = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')?.value
    || localStorage.__origSetItem
    || localStorage.setItem.bind(localStorage);
  try { fn.call(localStorage, key, value); } catch {}
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
      clearDirty(key);
      return;
    }

    let parsed;
    try { parsed = typeof value === 'string' ? JSON.parse(value) : value; }
    catch { parsed = value; }

    const { error } = await supabase
      .from('user_data')
      .upsert({ user_id: userId, key, value: parsed, updated_at: new Date().toISOString() });
    if (error) throw error;
    // Only now is the cloud actually holding this value. Clearing the mark any
    // earlier would hand the next pull permission to overwrite it.
    clearDirty(key);
  } catch (e) {
    console.error('Supabase push error:', e);
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
