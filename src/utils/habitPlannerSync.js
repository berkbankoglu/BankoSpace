import { pushKeyToSupabase } from '../supabase';
import { loadBlocks, todayBlocks, todayStr } from './plannerStore';

// Scheduling something in the planner is already the record that you did it, so
// a planner block and a habit with the same name are treated as the same thing:
// one block named "Drawing" on a given day checks off the "Drawing" habit for
// that day. One is enough — a second block changes nothing.
const HABITS_KEY = 'habitTracker_habits';
const LOG_KEY = 'habitTracker_log';
// Which habit-days this sync checked itself. Without it, removing a block you
// added by mistake couldn't be undone without also wiping ticks you made by hand.
const AUTOLOG_KEY = 'habitTracker_autolog';
export const HABITS_EVENT = 'habits-updated';

const norm = (s) => String(s || '').trim().toLowerCase();

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function write(key, value) {
  const val = JSON.stringify(value);
  localStorage.setItem(key, val);
  pushKeyToSupabase(key, val);
}

// Names in today's planner that a habit could match.
export function plannerHabitNames(dateStr = todayStr()) {
  return new Set(todayBlocks(loadBlocks(), dateStr).map(b => norm(b.title)).filter(Boolean));
}

export function syncHabitsFromPlanner(dateStr = todayStr()) {
  const habits = read(HABITS_KEY, []);
  if (!Array.isArray(habits) || habits.length === 0) return false;

  const log = read(LOG_KEY, {});
  const autolog = read(AUTOLOG_KEY, {});
  const scheduled = plannerHabitNames(dateStr);

  const day = { ...(log[dateStr] || {}) };
  const autoDay = new Set(autolog[dateStr] || []);
  let changed = false;

  habits.forEach(habit => {
    const matched = scheduled.has(norm(habit.name));
    if (matched && !day[habit.id]) {
      day[habit.id] = true;
      autoDay.add(habit.id);
      changed = true;
    } else if (!matched && autoDay.has(habit.id)) {
      // Only undo ticks this sync made; a manual one stays.
      if (day[habit.id]) { delete day[habit.id]; changed = true; }
      autoDay.delete(habit.id);
      changed = true;
    }
  });

  if (!changed) return false;

  write(LOG_KEY, { ...log, [dateStr]: day });
  const nextAuto = { ...autolog };
  if (autoDay.size) nextAuto[dateStr] = [...autoDay];
  else delete nextAuto[dateStr];
  write(AUTOLOG_KEY, nextAuto);

  window.dispatchEvent(new CustomEvent(HABITS_EVENT));
  return true;
}
