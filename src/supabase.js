import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fzbjqztfdsquinnpgzir.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6YmpxenRmZHNxdWlubnBnemlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNTIzMTgsImV4cCI6MjA4ODkyODMxOH0.qRTQqN1PHY7coRaN_bfuJfTB584X4U1hIC5oKsAmlAo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// All localStorage keys to sync
export const SYNC_KEYS = [
  'todos',
  'categoryNames',
  'checklistNames',
  'dailyChecklistItems',
  'longtermChecklistItems',
  'flashCards',
  'flashCardGroups',
  'notes',
  'freeformTabs',
  'quickNotes',
  'portfolio_positions',
  'portfolio_closed',
  'price_groups',
  'price_tickers',
  'stock_tickers',
  'goals',
  'invoices',
  'invoiceBasePath',
  'streakData',
  'loginHeatmap',
  'payments_v2',
  'bid_rules',
  'analyze_rules',
  'kana_learned_words',
  'kana_selected_rows',
  'kana_custom_words',
  'kana_selected_vocab',
  'kana_stats',
  'kana_prefs',
  'kana_best_score',
  'kana_cell_colors',
  'ft_profile',
  'ft_goal',
  'ft_weight_log',
  'ft_menu_templates',
  'ft_meals',
  'ft_workouts',
  'ft_measurements',
  'sidebarOrder',
  'todoFontSize',
  'subtaskFontSize',
  'theme',
  'soundVolume',
  'anthropic_api_key',
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
];

// Cache userId to avoid network call on every push
let cachedUserId = null;
supabase.auth.onAuthStateChange((_event, session) => {
  cachedUserId = session?.user?.id || null;
});

// Get current user ID (uses cache, falls back to network once)
async function getUserId() {
  if (cachedUserId) return cachedUserId;
  const { data: { user } } = await supabase.auth.getUser();
  cachedUserId = user?.id || null;
  return cachedUserId;
}

// Pull all data from Supabase and write to localStorage
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
      const pulledKeys = new Set(data.map(r => r.key));
      data.forEach(({ key, value }) => {
        if (value !== null && value !== undefined) {
          const supaStr = typeof value === 'string' ? value : JSON.stringify(value);
          const localStr = localStorage.getItem(key);
          // Supabase'deki değer boş obje/array ise ve localStorage'da dolu bir değer varsa, localStorage'ı koru
          if (localStr && localStr !== 'null') {
            try {
              const supaVal = typeof value === 'string' ? JSON.parse(value) : value;
              const supaEmpty =
                supaVal === null ||
                (Array.isArray(supaVal) && supaVal.length === 0) ||
                (typeof supaVal === 'object' && !Array.isArray(supaVal) && Object.keys(supaVal).length === 0);
              if (supaEmpty) return; // localStorage'daki dolu veriyi koru
            } catch { /* parse hatası, devam et */ }
          }
          // String primitives (e.g. api key) must be stored raw, not double-stringified
          localStorage.setItem(key, supaStr);
        }
      });
      return true;
    }
    return false;
  } catch (e) {
    console.error('Supabase pull error:', e);
    return false;
  }
}

// Tek bir key'i Supabase'e yaz (value === null ise Supabase'den sil)
export async function pushKeyToSupabase(key, value) {
  if (!SYNC_KEYS.includes(key)) return;
  try {
    const userId = await getUserId();
    if (!userId) return;

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
