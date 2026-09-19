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
  'ft_ai_threads',
  'sidebarOrder',
  'todoFontSize',
  'subtaskFontSize',
  'theme',
  'colorTheme',
  'soundVolume',
  'translate_rules',
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
      // Use raw setItem to avoid triggering push-back to Supabase during pull
      const rawSetItem = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')?.value
        || localStorage.__origSetItem
        || localStorage.setItem.bind(localStorage);

      let anyChanged = false;

      data.forEach(({ key, value }) => {
        if (value === null || value === undefined) return;

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
      await supabase
        .from('user_data')
        .delete()
        .eq('user_id', userId)
        .eq('key', key);
      return;
    }

    let parsed;
    try { parsed = typeof value === 'string' ? JSON.parse(value) : value; }
    catch { parsed = value; }

    await supabase
      .from('user_data')
      .upsert({ user_id: userId, key, value: parsed, updated_at: new Date().toISOString() });
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
