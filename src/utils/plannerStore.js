import { pushKeyToSupabase } from '../supabase';
import {
  migrateEvents, needsMigration, expandRange, expandDay, timedForDay, allDayForDay,
  DEFAULT_CALENDARS, MODEL_VERSION,
} from './calendarModel';
import { ruleCoversDate } from './recurrence';

// Shared between the full Calendar page and the dashboard's today-only copy, so
// both read the exact same events and a change in one shows up in the other
// without a reload. Same storage keys the planner has always used.
//
// Storage is this file's job; what an event *means* lives in calendarModel.js
// and recurrence.js. Views ask for occurrences, never for raw rows.
export const BLOCKS_KEY = 'planner_blocks';
export const QTASKS_KEY = 'planner_qtasks';
export const CALENDARS_KEY = 'planner_calendars';
// 0 = Sunday, 1 = Monday. Monday is the default because that is how the week is
// counted where this app is used; Apple exposes the same choice as "Start week
// on" and every grid in the calendar reads it.
export const WEEK_START_KEY = 'calendar_week_start';
export const PLANNER_EVENT = 'planner-data-changed';

// The v1 rows, kept verbatim the first time a device migrates. The new shape is
// a one-way upgrade — an older build can't read an rrule — so this is the only
// copy of what was there before, and nothing ever overwrites it.
export const V1_BACKUP_KEY = 'planner_blocks_v1_backup';

export const COLORS = [
  { id: 'blue',   hex: '#3b82f6' },
  { id: 'green',  hex: '#22c55e' },
  { id: 'amber',  hex: '#f59e0b' },
  { id: 'red',    hex: '#ef4444' },
  { id: 'purple', hex: '#a855f7' },
  { id: 'pink',   hex: '#ec4899' },
  { id: 'teal',   hex: '#14b8a6' },
  { id: 'gold',   hex: '#d4a017' },
];

export const pad = (n) => String(n).padStart(2, '0');
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const minutesToTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const timeToMinutes = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
export const colorHex = (id) => COLORS.find(c => c.id === id)?.hex || '#3b82f6';

// Habit colours are raw hex; event colours are palette ids. Anything that shows
// both — the dashboard strip, the calendar's sidebar — resolves through here.
export const resolveColor = (c) => (typeof c === 'string' && c.startsWith('#') ? c : colorHex(c));

// An event created from a habit still has to render everywhere else, and
// everywhere else understands palette ids — so the habit's hex is snapped to
// the nearest palette colour rather than stored raw.
export function nearestPaletteId(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return 'blue';
  const [r, g, b] = m.slice(1).map(v => parseInt(v, 16));
  let best = COLORS[0], bestD = Infinity;
  COLORS.forEach(c => {
    const p = /^#(..)(..)(..)$/.exec(c.hex).slice(1).map(v => parseInt(v, 16));
    const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  });
  return best.id;
}

export const HABITS_KEY = 'habitTracker_habits';
export const HABITS_EVENT = 'habits-updated';

// The four the Habits view offers, so a colour chosen anywhere looks the same
// everywhere.
export const HABIT_COLORS = ['#ef4444', '#fb923c', '#facc15', '#9ca3af'];

export function loadHabitList() {
  try {
    const list = JSON.parse(localStorage.getItem(HABITS_KEY));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

// Every habit write goes through here: stored, pushed to the account's copy,
// and announced so the dashboard strip and the calendar sidebar both refresh.
// The dashboard used to write this key directly and skip the push, which left
// the cloud copy stale until something else happened to sync.
export function saveHabitList(list) {
  const val = JSON.stringify(list);
  localStorage.setItem(HABITS_KEY, val);
  pushKeyToSupabase(HABITS_KEY, val);
  window.dispatchEvent(new CustomEvent(HABITS_EVENT));
}

// The habits the tracker knows about, shaped like quick tasks so a sidebar or a
// strip can list both without caring which is which.
export function loadHabitTasks() {
  return loadHabitList().map(h => ({
    id: `habit-${h.id}`,
    habitId: h.id,
    title: h.name,
    color: h.color || '#9ca3af',
    defaultDuration: 60,
    isHabit: true,
  }));
}
export const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}

// ── Migration ────────────────────────────────────────────────────────────────

// Runs at most once per session, and writes at most once per device: after the
// first pass every row carries v:2, so needsMigration() is false forever after.
let migrationDone = false;

function migrateOnce(raw) {
  if (migrationDone || !needsMigration(raw)) return null;
  migrationDone = true;
  try {
    if (localStorage.getItem(V1_BACKUP_KEY) === null) {
      localStorage.setItem(V1_BACKUP_KEY, JSON.stringify(raw));
    }
  } catch { /* out of quota — the migration itself still matters more */ }
  const next = migrateEvents(raw);
  writeKey(BLOCKS_KEY, next);
  return next;
}

// Called once at app start so the upgrade isn't deferred to whenever the
// calendar first renders.
export function ensureCalendarMigrated() {
  const raw = readJSON(BLOCKS_KEY);
  return migrateOnce(raw) || raw;
}

export const loadBlocks = () => {
  const raw = readJSON(BLOCKS_KEY);
  return migrateOnce(raw) || raw;
};

export const loadQTasks = () => readJSON(QTASKS_KEY);

export function loadCalendars() {
  const stored = readJSON(CALENDARS_KEY);
  // A device that has never seen the sidebar starts with the defaults rather
  // than an empty list, so a new event always has a calendar to belong to.
  if (!Array.isArray(stored) || stored.length === 0) return DEFAULT_CALENDARS.map(c => ({ ...c }));
  return stored;
}

// Writers notify every mounted planner view in this window — localStorage's own
// 'storage' event only fires in OTHER tabs, so same-window views need this.
function writeKey(key, value) {
  const val = JSON.stringify(value);
  localStorage.setItem(key, val);
  pushKeyToSupabase(key, val);
  window.dispatchEvent(new CustomEvent(PLANNER_EVENT, { detail: { key } }));
}

export const saveBlocks = (blocks) => writeKey(BLOCKS_KEY, blocks);
export const saveQTasks = (tasks) => writeKey(QTASKS_KEY, tasks);
export const saveCalendars = (cals) => writeKey(CALENDARS_KEY, cals);

export function loadWeekStart() {
  const raw = localStorage.getItem(WEEK_START_KEY);
  const n = Number(raw);
  return raw !== null && (n === 0 || n === 1) ? n : 1;
}
export const saveWeekStart = (n) => writeKey(WEEK_START_KEY, n === 0 ? 0 : 1);

// The first day of the week containing `dateStr`, honouring the preference.
export function weekStartOf(dateStr, weekStart = loadWeekStart()) {
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  const shift = (d.getDay() - weekStart + 7) % 7;
  d.setDate(d.getDate() - shift);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Reads the views use ──────────────────────────────────────────────────────

// Re-exported so a view imports one module instead of three.
export { expandRange, expandDay, timedForDay, allDayForDay, MODEL_VERSION };

// Only events on visible calendars. Hiding a calendar is a view filter, never a
// change to the data, so this is applied on read and nothing else.
export function visibleEvents(blocks, calendars) {
  if (!Array.isArray(calendars) || !calendars.length) return blocks;
  const hidden = new Set(calendars.filter(c => c.visible === false).map(c => c.id));
  if (!hidden.size) return blocks;
  return blocks.filter(b => !hidden.has(b.calendarId || 'personal'));
}

// A block belongs to a date either directly or through its repeat rule. Kept as
// a named export because the habit bridge and the dashboard both ask the
// question, and there must be exactly one answer in the codebase.
export function blockMatchesDate(block, dateStr) {
  if (!block) return false;
  if (block.date === dateStr) return true;
  // Multi-day events cover every day between their ends.
  if (block.endDate && block.endDate > block.date && dateStr > block.date && dateStr <= block.endDate) return true;
  if (!block.rrule) {
    // A row that predates the migration can still be asked about.
    if (!block.recur || block.recur === 'none') return false;
    const origin = new Date(block.date + 'T00:00:00');
    const target = new Date(dateStr + 'T00:00:00');
    if (target < origin) return false;
    const dow = target.getDay();
    if (block.recur === 'daily') return true;
    if (block.recur === 'weekday') return dow >= 1 && dow <= 5;
    if (block.recur === 'weekly') return dow === origin.getDay();
    if (block.recur === 'monthly') return origin.getDate() === target.getDate();
    return false;
  }
  if (block.exdates?.includes(dateStr)) return false;
  return ruleCoversDate(block.date, block.rrule, dateStr);
}

// The day's timed events, in order — what an hour grid draws. All-day and
// multi-day bars are deliberately excluded: they belong in the strip above the
// grid, and placing them on the hour scale is what used to stretch a holiday
// across the whole working day.
export function todayBlocks(blocks, dateStr = todayStr()) {
  return timedForDay(expandDay(blocks, dateStr), dateStr);
}

// The day's all-day and multi-day bars.
export function todayAllDay(blocks, dateStr = todayStr()) {
  return allDayForDay(expandDay(blocks, dateStr), dateStr);
}

// Gaps between consecutive blocks are breaks — the user asked to be told about
// those the same way as the work blocks ("10 min break, starts X, ends Y"), so
// they're derived here rather than stored.
export function breaksBetween(sorted, minLength = 5) {
  const out = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const end = timeToMinutes(sorted[i].endTime);
    const nextStart = timeToMinutes(sorted[i + 1].startTime);
    if (nextStart - end >= minLength) {
      out.push({ id: `break-${sorted[i].id}`, isBreak: true, startTime: minutesToTime(end), endTime: minutesToTime(nextStart), title: 'Break' });
    }
  }
  return out;
}

// Merged, time-ordered view of the day: blocks plus the breaks between them.
export function dayAgenda(blocks, dateStr = todayStr()) {
  const sorted = todayBlocks(blocks, dateStr);
  return [...sorted, ...breaksBetween(sorted)].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );
}

// First free slot of `duration` minutes from `from` onward, so a quick task can
// be dropped onto the day without the user picking a time.
export function findFreeSlot(sorted, duration, from = nowMinutes()) {
  let cursor = Math.ceil(from / 15) * 15;
  for (const b of sorted) {
    const s = timeToMinutes(b.startTime);
    const e = timeToMinutes(b.endTime);
    if (e <= cursor) continue;
    if (s - cursor >= duration) return cursor;
    cursor = Math.max(cursor, e);
  }
  return Math.min(cursor, 24 * 60 - duration);
}
