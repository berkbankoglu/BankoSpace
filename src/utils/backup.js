import { SYNC_KEYS } from '../supabase';
import { collectNoteMediaIds } from './noteMediaSync';
import { getImage, getStrokes, putImage, putStrokes } from './imageStore';
import { externalizeNotes } from './noteMediaBackup';

const groups = [
  { id: 'todos', label: 'Todos', keys: ['todos', 'categoryNames', 'streakData', 'taskScore', 'loginHeatmap', 'bs_contribution_log'] },
  { id: 'checklists', label: 'Checklists', keys: ['dailyChecklistItems', 'dailyChecklistLastReset', 'dailyChecklistColor', 'longtermChecklistItems', 'longtermChecklistLastReset', 'longtermChecklistColor', 'checklistNames'] },
  { id: 'habits', label: 'Habits', keys: ['habitTracker_habits', 'habitTracker_log', 'habitTracker_autolog'] },
  { id: 'payments', label: 'Payments', keys: ['payments_v2'] },
  { id: 'notes', label: 'Notes', keys: ['notes', 'freeformTabs', 'quickNotes', 'notesSidebarWidth', 'notesLineSpacing', 'notesCanvasBg', 'notes_color_shortcuts'] },
  { id: 'flashcards', label: 'Flash Cards', keys: ['flashCards', 'flashCardGroups'] },
  { id: 'fitness', label: 'Fitness', keys: ['ft_profile', 'ft_goal', 'ft_weight_log', 'ft_menu_templates', 'ft_meals', 'ft_workouts', 'ft_measurements', 'ft_custom_foods', 'ft_goal_kcal'] },
  { id: 'finance', label: 'Finance', keys: ['invoices', 'invoiceBasePath', 'goals', 'research_watchlist', 'research_checked'] },
  { id: 'japanese', label: 'Japanese', keys: SYNC_KEYS.filter(k => k.startsWith('kana_')) },
  { id: 'calendar', label: 'Calendar', keys: ['planner_blocks', 'planner_qtasks', 'planner_calendars', 'calendar_week_start'] },
  { id: 'medications', label: 'Medications', keys: ['meds_v1', 'meds_log_v1'] },
  { id: 'review', label: 'Review', keys: ['reviews_v1'] },
  { id: 'dashboard', label: 'Dashboard', keys: ['dashLayout_v1', 'dashColWidths', 'dashPanelWeights', 'dashPanelCollapsed'] },
];
const grouped = new Set(groups.flatMap(g => g.keys));
export const DATA_SECTIONS = [...groups, {
  id: 'settings', label: 'Settings', keys: SYNC_KEYS.filter(k => !grouped.has(k)),
}];
export const BACKUP_KEYS = [...new Set(DATA_SECTIONS.flatMap(s => s.keys))];

function sectionsFor(selection = 'all') {
  if (selection === 'all') return DATA_SECTIONS;
  const ids = Array.isArray(selection) ? selection : [selection];
  if (!ids.length || ids.some(id => !DATA_SECTIONS.some(s => s.id === id))) throw new Error('Unknown backup section.');
  return DATA_SECTIONS.filter(s => ids.includes(s.id));
}

export async function createBackup(selection = 'all') {
  const sections = sectionsFor(selection);
  const keys = [...new Set(sections.flatMap(s => s.keys))];
  const data = { _bankospace: true, _version: 2, _section: selection, _date: new Date().toISOString(), _missing: [] };
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (raw === null) { data._missing.push(key); continue; }
    try { data[key] = JSON.parse(raw); } catch { data[key] = raw; }
  }
  if (keys.includes('notes')) {
    if (data.notes !== undefined && !Array.isArray(data.notes)) throw new Error('Notes could not be read. Repair or sync them before exporting.');
    data._media = {};
    for (const id of collectNoteMediaIds(data.notes)) {
      const dataUrl = await getImage(id);
      if (!dataUrl) throw new Error('A note image is unavailable. Sync this device before exporting.');
      const strokes = await getStrokes(id);
      data._media[id] = { dataUrl, ...(strokes !== null ? { strokes } : {}) };
    }
  }
  return data;
}

export async function restoreBackup(data) {
  if (!data || data._bankospace !== true || (data._version && data._version !== 2)) throw new Error('Invalid or unsupported BankoSpace backup.');
  const sections = sectionsFor(data._section || 'all');
  const keys = [...new Set(sections.flatMap(s => s.keys))];
  if (data.notes !== undefined && keys.includes('notes') && !Array.isArray(data.notes)) throw new Error('Invalid notes in backup.');
  if (data._media !== undefined && (!data._media || Array.isArray(data._media) || typeof data._media !== 'object')) throw new Error('Invalid backup media.');
  const media = keys.includes('notes') ? data._media || {} : {};
  const entries = Object.entries(media);
  // Validate everything before writing any user data.
  for (const [id, item] of entries) {
    if (!/^[a-zA-Z0-9_-]{1,150}$/.test(id) || !item || typeof item.dataUrl !== 'string' ||
        !item.dataUrl.startsWith('data:image/') || (item.strokes !== undefined && !Array.isArray(item.strokes))) throw new Error('Invalid backup media.');
  }
  if (data._version === 2 && keys.includes('notes')) {
    for (const id of collectNoteMediaIds(data.notes)) if (!Object.hasOwn(media, id)) throw new Error('Backup is missing a note image.');
  }
  const prepared = {};
  for (const key of keys) {
    if (Object.hasOwn(data, key)) prepared[key] = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
  }
  for (const [id, item] of entries) {
    await putImage(id, item.dataUrl);
    if (item.strokes !== undefined) await putStrokes(id, item.strokes);
  }
  // Older notes exports embedded bytes directly. Keep support for those while
  // moving their bytes into IndexedDB before storing the notes payload.
  if (keys.includes('notes') && Array.isArray(data.notes)) {
    prepared.notes = JSON.stringify(await externalizeNotes(data.notes));
  }
  for (const key of keys) {
    if (Object.hasOwn(prepared, key)) localStorage.setItem(key, prepared[key]);
    else if (data._version === 2 && data._missing?.includes(key)) localStorage.removeItem(key);
  }
  if (keys.includes('notes')) {
    if (Object.hasOwn(prepared, 'notes')) localStorage.setItem('notes_local_backup', prepared.notes);
    else if (data._version === 2 && data._missing?.includes('notes')) localStorage.removeItem('notes_local_backup');
  }
  return sections.map(s => s.label).join(', ');
}
