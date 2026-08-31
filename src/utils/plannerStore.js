import { pushKeyToSupabase } from '../supabase';

// Shared between the full Planner page and the dashboard's today-only copy, so
// both read the exact same blocks and a change in one shows up in the other
// without a reload. Same storage keys the Planner has always used.
export const BLOCKS_KEY = 'planner_blocks';
export const QTASKS_KEY = 'planner_qtasks';
export const PLANNER_EVENT = 'planner-data-changed';

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
export const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}

export const loadBlocks = () => readJSON(BLOCKS_KEY);
export const loadQTasks = () => readJSON(QTASKS_KEY);

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

// A block belongs to a date either directly or through its repeat rule.
// Mirrors the Planner page's own matching so both agree on what "today" holds.
export function blockMatchesDate(block, dateStr) {
  if (block.date === dateStr) return true;
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

export function todayBlocks(blocks, dateStr = todayStr()) {
  return blocks
    .filter(b => blockMatchesDate(b, dateStr))
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
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
