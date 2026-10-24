import { useEffect, useState } from 'react';
import WidgetFrame, { WidgetEmpty } from './WidgetFrame';
import { playCompleteSound, playUncompleteSound } from '../../utils/sounds';

// The daily checklist, ticked off from the dashboard. It resets each day, the
// way the Checklists page resets it: ticks from an earlier day show as
// unticked, and the first tick today clears them before it lands.
const ITEMS = 'dailyChecklistItems';
const RESET = 'dailyChecklistLastReset';
const readItems = () => { try { return JSON.parse(localStorage.getItem(ITEMS)) || []; } catch { return []; } };
const todayStamp = () => new Date().toDateString();

export function visibleItems(items, lastReset, today = todayStamp()) {
  return lastReset === today ? items : items.map(i => ({ ...i, completed: false }));
}

export default function ChecklistWidget({ title, collapsed, onToggle, onOpenChecklists }) {
  const [items, setItems] = useState(readItems);
  const [lastReset, setLastReset] = useState(() => localStorage.getItem(RESET));

  useEffect(() => {
    const reload = () => { setItems(readItems()); setLastReset(localStorage.getItem(RESET)); };
    window.addEventListener('storage', reload);
    return () => window.removeEventListener('storage', reload);
  }, []);

  const shown = visibleItems(items, lastReset);

  const toggle = (id) => {
    const today = todayStamp();
    const base = visibleItems(readItems(), localStorage.getItem(RESET), today);
    const next = base.map(i => (i.id === id ? { ...i, completed: !i.completed } : i));
    const nowOn = next.find(i => i.id === id)?.completed;
    if (localStorage.getItem(RESET) !== today) localStorage.setItem(RESET, today);
    localStorage.setItem(ITEMS, JSON.stringify(next));
    setItems(next);
    setLastReset(today);
    if (nowOn) playCompleteSound(); else playUncompleteSound();
  };

  const done = shown.filter(i => i.completed).length;

  return (
    <WidgetFrame
      title={title || 'Daily checklist'}
      badge={shown.length ? `${done}/${shown.length}` : null}
      collapsed={collapsed}
      onToggle={onToggle}
      onOpen={onOpenChecklists}
      openTitle="Open Checklists"
    >
      {shown.length === 0 ? (
        <WidgetEmpty action="Add items" onAction={onOpenChecklists}>The checklist is empty.</WidgetEmpty>
      ) : shown.map(i => (
        <button
          key={i.id}
          className={`wg-row${i.completed ? ' done' : ''}`}
          style={{ '--wg-accent': 'var(--accent)' }}
          onClick={() => toggle(i.id)}
        >
          <span className="wg-check">{i.completed ? '✓' : ''}</span>
          <span className="wg-row-main"><span className="wg-row-name">{i.text}</span></span>
        </button>
      ))}
    </WidgetFrame>
  );
}
