import { useEffect, useState } from 'react';
import WidgetFrame, { WidgetEmpty } from './WidgetFrame';
import { playCompleteSound, playUncompleteSound } from '../../utils/sounds';

// Today's habits, ticked off from the dashboard. Writes the same log the
// Habits page keeps and tells it (and the Today panel) through the event they
// already listen for.
const readHabits = () => { try { return JSON.parse(localStorage.getItem('habitTracker_habits')) || []; } catch { return []; } };
const readLog = () => { try { return JSON.parse(localStorage.getItem('habitTracker_log')) || {}; } catch { return {}; } };
const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Days in a row, counting back from today — or from yesterday if today is not
// done yet, so a streak does not read as broken in the morning.
export function streakOf(log, habitId, today = new Date()) {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  if (!log[dateKey(d)]?.[habitId]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (log[dateKey(d)]?.[habitId]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export default function HabitsWidget({ collapsed, onToggle, onOpenHabits }) {
  const [habits, setHabits] = useState(readHabits);
  const [log, setLog] = useState(readLog);
  const [today, setToday] = useState(() => dateKey(new Date()));

  useEffect(() => {
    const reload = () => { setHabits(readHabits()); setLog(readLog()); };
    window.addEventListener('habits-updated', reload);
    window.addEventListener('storage', reload);
    // Left open overnight, the dashboard still has to be about today.
    const iv = setInterval(() => setToday(dateKey(new Date())), 60000);
    return () => {
      window.removeEventListener('habits-updated', reload);
      window.removeEventListener('storage', reload);
      clearInterval(iv);
    };
  }, []);

  const toggle = (id) => {
    const current = readLog();
    const day = current[today] || {};
    const on = !day[id];
    const next = { ...current, [today]: { ...day, [id]: on } };
    localStorage.setItem('habitTracker_log', JSON.stringify(next));
    setLog(next);
    if (on) playCompleteSound(); else playUncompleteSound();
    window.dispatchEvent(new Event('habits-updated'));
  };

  const done = habits.filter(h => log[today]?.[h.id]).length;

  return (
    <WidgetFrame
      title="Habits"
      badge={habits.length ? `${done}/${habits.length}` : null}
      collapsed={collapsed}
      onToggle={onToggle}
      onOpen={onOpenHabits}
      openTitle="Open Habits"
    >
      {habits.length === 0 ? (
        <WidgetEmpty action="Add a habit" onAction={onOpenHabits}>No habits yet.</WidgetEmpty>
      ) : habits.map(h => {
        const on = !!log[today]?.[h.id];
        const streak = streakOf(log, h.id);
        return (
          <button
            key={h.id}
            className={`wg-row${on ? ' done' : ''}`}
            style={{ '--wg-accent': h.color || 'var(--accent)' }}
            onClick={() => toggle(h.id)}
            title={on ? 'Done today — click to undo' : 'Mark as done today'}
          >
            <span className="wg-check">{on ? '✓' : ''}</span>
            {h.icon && <span className="wg-icon">{h.icon}</span>}
            <span className="wg-row-main"><span className="wg-row-name">{h.name}</span></span>
            {streak > 0 && <span className="wg-row-meta">{streak} day{streak === 1 ? '' : 's'}</span>}
          </button>
        );
      })}
    </WidgetFrame>
  );
}
