import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fzbjqztfdsquinnpgzir.supabase.co';
const SUPABASE_KEY = 'sb_publishable_72FqkpVbwfctYhmbPL12pQ_v0O-STU-';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Tüm sync edilecek localStorage key'leri
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
  'bid_rules',
  'kana_learned_words',
  'kana_selected_rows',
  'sidebarOrder',
  'todoFontSize',
  'theme',
  'soundVolume',
];

// Supabase'den tüm veriyi çek ve localStorage'a yaz
export async function pullFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('user_data')
      .select('key, value');

    if (error) throw error;

    if (data && data.length > 0) {
      data.forEach(({ key, value }) => {
        if (value !== null && value !== undefined) {
          localStorage.setItem(key, JSON.stringify(value));
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

// Tek bir key'i Supabase'e yaz
export async function pushKeyToSupabase(key, value) {
  if (!SYNC_KEYS.includes(key)) return;
  try {
    let parsed;
    try { parsed = typeof value === 'string' ? JSON.parse(value) : value; }
    catch { parsed = value; }

    await supabase
      .from('user_data')
      .upsert({ key, value: parsed, updated_at: new Date().toISOString() });
  } catch (e) {
    console.error('Supabase push error:', e);
  }
}

// Tüm localStorage'ı Supabase'e yükle (ilk kurulum)
export async function pushAllToSupabase() {
  const rows = SYNC_KEYS
    .filter(key => localStorage.getItem(key) !== null)
    .map(key => {
      let value;
      try { value = JSON.parse(localStorage.getItem(key)); }
      catch { value = localStorage.getItem(key); }
      return { key, value, updated_at: new Date().toISOString() };
    });

  if (rows.length === 0) return;

  try {
    const { error } = await supabase.from('user_data').upsert(rows);
    if (error) throw error;
  } catch (e) {
    console.error('Supabase pushAll error:', e);
  }
}
