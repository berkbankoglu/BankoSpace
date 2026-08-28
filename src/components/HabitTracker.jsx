import { useState, useRef, Fragment } from 'react';
import { confirmAsync } from '../platform';
import './HabitTracker.css';
import { playAddSound, playDeleteSound, playCompleteSound, playUncompleteSound } from '../utils/sounds';

const ICON_CHOICES = [
  '💧', '⏰', '📖', '🗣️', '🏃', '🎨', '✏️', '🏋️', '🧘', '☀️',
  '🌙', '🍎', '💊', '🎯', '📝', '🎵', '🎮', '🚰', '🧹', '🪥',
  '🚿', '🥗', '🛌', '📵', '🎧', '☕', '🚭', '✍️', '🧠', '💰',
  '🐕', '🌱', '📞',
];

// Importance coding: red (critical) > orange (high) > yellow (medium) > gray
// (default/low). Gray is the default for a new habit until it's marked up.
const HABIT_COLORS = ['#ef4444', '#fb923c', '#facc15', '#9ca3af'];
const DEFAULT_HABIT_COLOR = '#9ca3af';

// Icon picker shows one 4x4 page at a time, paged with arrows either side —
// a full grid of all 33 choices was overflowing into the stats column.
const ICONS_PER_PAGE = 16;
const ICON_PAGE_COUNT = Math.ceil(ICON_CHOICES.length / ICONS_PER_PAGE);

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HabitTracker() {
  const [habits, setHabits] = useState(() => {
    try { return JSON.parse(localStorage.getItem('habitTracker_habits')) || []; } catch { return []; }
  });
  const [log, setLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem('habitTracker_log')) || {}; } catch { return {}; }
  });
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState(ICON_CHOICES[0]);
  const [newColor, setNewColor] = useState(DEFAULT_HABIT_COLOR);
  const [newIconPage, setNewIconPage] = useState(0);
  const [editingHabitId, setEditingHabitId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState(ICON_CHOICES[0]);
  const [editColor, setEditColor] = useState(DEFAULT_HABIT_COLOR);
  const [editIconPage, setEditIconPage] = useState(0);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth()); // 0-11

  // Data (habits + log) is stored completely separately from which month is
  // currently being viewed — switching months only changes what's displayed,
  // it can never touch or drop a single logged day.
  const persistHabits = (next) => {
    setHabits(next);
    localStorage.setItem('habitTracker_habits', JSON.stringify(next));
  };
  const persistLog = (next) => {
    setLog(next);
    localStorage.setItem('habitTracker_log', JSON.stringify(next));
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => toDateKey(new Date(viewYear, viewMonth, i + 1)));
  const tKey = toDateKey(new Date());

  function goPrevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function goNextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function goToday() {
    const d = new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function startEditHabit(h) {
    setEditingHabitId(h.id);
    setEditName(h.name);
    setEditIcon(h.icon);
    setEditColor(h.color || DEFAULT_HABIT_COLOR);
    const idx = ICON_CHOICES.indexOf(h.icon);
    setEditIconPage(idx >= 0 ? Math.floor(idx / ICONS_PER_PAGE) : 0);
  }

  function saveEditHabit() {
    const name = editName.trim();
    if (!name) return;
    persistHabits(habits.map(h => h.id === editingHabitId ? { ...h, name, icon: editIcon, color: editColor } : h));
    setEditingHabitId(null);
  }

  function addHabit() {
    const name = newName.trim();
    if (!name) return;
    persistHabits([...habits, { id: Date.now(), name, icon: newIcon, color: newColor }]);
    setNewName('');
    setNewIcon(ICON_CHOICES[0]);
    setNewColor(DEFAULT_HABIT_COLOR);
    setShowAdd(false);
    playAddSound();
  }

  async function removeHabit(id) {
    const habit = habits.find(h => h.id === id);
    const confirmed = await confirmAsync(`Delete "${habit?.name}"?\n\nIts history will be deleted too. This action cannot be undone!`, {
      title: 'Delete Habit',
      kind: 'warning',
      okLabel: 'Yes, Delete',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    persistHabits(habits.filter(h => h.id !== id));
    const nextLog = {};
    for (const [dateKey, entries] of Object.entries(log)) {
      const { [id]: _removed, ...rest } = entries;
      nextLog[dateKey] = rest;
    }
    persistLog(nextLog);
    playDeleteSound();
  }

  function toggle(dateKey, habitId) {
    const dayEntries = log[dateKey] || {};
    const nextVal = !dayEntries[habitId];
    if (nextVal) playCompleteSound(); else playUncompleteSound();
    persistLog({ ...log, [dateKey]: { ...dayEntries, [habitId]: nextVal } });
  }

  function calcStreak(habitId) {
    let streak = 0;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (!log[toDateKey(d)]?.[habitId]) d.setDate(d.getDate() - 1);
    for (let i = 0; i < 3650; i++) {
      const key = toDateKey(d);
      if (log[key]?.[habitId]) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  }

  // Full picture for one habit: when it started, how consistent it's been
  // since, current vs. best-ever streak, and how this month is going.
  function computeHabitStats(habitId) {
    const checkedDates = Object.keys(log).filter(k => log[k]?.[habitId]).sort();
    if (checkedDates.length === 0) return { hasData: false };

    const firstDate = checkedDates[0];
    const lastDate = checkedDates[checkedDates.length - 1];
    const totalCompletions = checkedDates.length;

    const firstD = new Date(firstDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysTracked = Math.round((today - firstD) / 86400000) + 1;
    const missedDays = Math.max(0, daysTracked - totalCompletions);
    const completionRate = daysTracked > 0 ? Math.round((totalCompletions / daysTracked) * 100) : 0;

    let longestStreak = 0, run = 0, prevD = null;
    for (const key of checkedDates) {
      const d = new Date(key + 'T00:00:00');
      run = prevD && Math.round((d - prevD) / 86400000) === 1 ? run + 1 : 1;
      if (run > longestStreak) longestStreak = run;
      prevD = d;
    }

    const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
    const thisMonthChecked = checkedDates.filter(k => k.startsWith(monthPrefix)).length;
    const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
    const thisMonthDaysSoFar = isCurrentMonth ? today.getDate() : new Date(viewYear, viewMonth + 1, 0).getDate();
    const thisMonthRate = thisMonthDaysSoFar > 0 ? Math.round((thisMonthChecked / thisMonthDaysSoFar) * 100) : 0;

    return {
      hasData: true,
      firstDate, lastDate, daysTracked, totalCompletions, missedDays, completionRate,
      currentStreak: calcStreak(habitId), longestStreak,
      thisMonthChecked, thisMonthDaysSoFar, thisMonthRate,
    };
  }

  function formatStatDate(key) {
    const d = new Date(key + 'T00:00:00');
    return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  // Column drag-to-reorder: grab a habit's header and drop it on another
  // habit's header to swap its position — the checked days move with it
  // since they're keyed by habit id, not by column position.
  const dragHabitIdRef = useRef(null);
  function handleHabitDragStart(e, habitId) {
    dragHabitIdRef.current = habitId;
    e.dataTransfer.effectAllowed = 'move';
  }
  function handleHabitDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
  function handleHabitDrop(e, targetId) {
    e.preventDefault();
    const draggedId = dragHabitIdRef.current;
    dragHabitIdRef.current = null;
    if (!draggedId || draggedId === targetId) return;
    const dragIdx = habits.findIndex(h => h.id === draggedId);
    const targetIdx = habits.findIndex(h => h.id === targetId);
    if (dragIdx === -1 || targetIdx === -1) return;
    const next = [...habits];
    const [removed] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, removed);
    persistHabits(next);
  }

  function rowStats(dateKey) {
    if (habits.length === 0) return { pct: 0 };
    const dayEntries = log[dateKey] || {};
    const done = habits.filter(h => dayEntries[h.id]).length;
    return { pct: Math.round((done / habits.length) * 100) };
  }

  return (
    <div className="ht-root">
      <div className="ht-header">
        <div className="ht-title">Habits</div>
        {habits.length > 0 && (
          <button className="ht-add-btn" onClick={() => { setNewIconPage(0); setShowAdd(true); }}>+ Add Habit</button>
        )}
      </div>

      {habits.length > 0 && (
        <div className="ht-month-nav">
          <button className="ht-month-arrow" onClick={goPrevMonth} title="Previous month">‹</button>
          <button className="ht-month-label" onClick={goToday} title="Jump to today">{MONTH_NAMES[viewMonth]} {viewYear}</button>
          <button className="ht-month-arrow" onClick={goNextMonth} title="Next month">›</button>
        </div>
      )}

      {habits.length === 0 ? (
        <div className="ht-empty">
          <button className="ht-add-btn-big" onClick={() => { setNewIconPage(0); setShowAdd(true); }}>+ Add Habit</button>
        </div>
      ) : (
        // Every day of the month renders as its own grid row sized `1fr` — the
        // grid always fills the available height exactly, so the whole month
        // is always fully visible and there is never anything to scroll.
        <div
          className="ht-grid"
          style={{ gridTemplateColumns: `104px repeat(${habits.length}, minmax(64px, 1fr)) 56px 90px`, gridTemplateRows: `auto repeat(${days.length}, 1fr)` }}
        >
          <div className="ht-cell ht-cell-corner" />
          {habits.map(h => {
            const habitColor = h.color || DEFAULT_HABIT_COLOR;
            return (
              <div
                key={h.id}
                className="ht-cell ht-cell-habit-header"
                draggable
                onDragStart={e => handleHabitDragStart(e, h.id)}
                onDragOver={handleHabitDragOver}
                onDrop={e => handleHabitDrop(e, h.id)}
                title="Drag to reorder"
              >
                <div className="ht-habit-header">
                  <button className="ht-habit-icon-btn" onClick={() => startEditHabit(h)} title="Edit icon, name, color &amp; stats">
                    <span className="ht-habit-icon">{h.icon}</span>
                  </button>
                  <span className="ht-habit-name" title={h.name}>{h.name}</span>
                  <span className="ht-habit-color-dot" style={{ background: habitColor }} />
                  <button className="ht-habit-remove" onClick={() => removeHabit(h.id)} title={`Delete "${h.name}"`}>×</button>
                </div>
              </div>
            );
          })}
          <div className="ht-cell ht-cell-pct-header">%</div>
          <div className="ht-cell ht-cell-bar-header" />

          {days.map(dateKey => {
            const { pct } = rowStats(dateKey);
            const d = new Date(dateKey + 'T00:00:00');
            const isToday = dateKey === tKey;
            const isFuture = dateKey > tKey;
            return (
              <Fragment key={dateKey}>
                <div className={`ht-cell ht-cell-date ${isToday ? 'today' : ''}`}>
                  <span className="ht-date-weekday">{WEEKDAY_SHORT[d.getDay()]}</span>
                  <span className="ht-date-day">{d.getDate()}</span>
                  {isToday && <span className="ht-date-today-badge">Today</span>}
                </div>
                {habits.map(h => {
                  const habitColor = h.color || DEFAULT_HABIT_COLOR;
                  const checkedHere = !!log[dateKey]?.[h.id];
                  return (
                    <div key={`${dateKey}-${h.id}`} className={`ht-cell ht-cell-check ${isToday ? 'today' : ''}`}>
                      <button
                        className={`ht-check ${checkedHere ? 'checked' : ''} ${isFuture ? 'disabled' : ''}`}
                        style={checkedHere ? { background: habitColor, borderColor: habitColor } : { borderColor: habitColor }}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { if (!isFuture) toggle(dateKey, h.id); }}
                        disabled={isFuture}
                        aria-label={`${h.name} — ${dateKey}`}
                      >
                        {checkedHere && '✓'}
                      </button>
                    </div>
                  );
                })}
                <div className={`ht-cell ht-cell-pct ${isToday ? 'today' : ''}`}>{pct}%</div>
                <div className={`ht-cell ht-cell-bar ${isToday ? 'today' : ''}`}>
                  <div className="ht-bar-track">
                    <div className="ht-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="ht-modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="ht-modal" onClick={e => e.stopPropagation()}>
            <div className="ht-modal-title">New Habit</div>
            <input
              className="ht-modal-input"
              placeholder="Habit name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addHabit(); }}
              autoFocus
            />
            <div className="ht-icon-page-row">
              <button
                className="ht-icon-page-arrow"
                onClick={() => setNewIconPage(p => Math.max(0, p - 1))}
                disabled={newIconPage === 0}
              >‹</button>
              <div className="ht-icon-grid">
                {ICON_CHOICES.slice(newIconPage * ICONS_PER_PAGE, newIconPage * ICONS_PER_PAGE + ICONS_PER_PAGE).map(ic => (
                  <button
                    key={ic}
                    className={`ht-icon-choice ${newIcon === ic ? 'selected' : ''}`}
                    onClick={() => setNewIcon(ic)}
                  >
                    {ic}
                  </button>
                ))}
              </div>
              <button
                className="ht-icon-page-arrow"
                onClick={() => setNewIconPage(p => Math.min(ICON_PAGE_COUNT - 1, p + 1))}
                disabled={newIconPage === ICON_PAGE_COUNT - 1}
              >›</button>
            </div>
            <div className="ht-color-row">
              {HABIT_COLORS.map(c => (
                <button
                  key={c}
                  className={`ht-color-choice ${newColor === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewColor(c)}
                  title={c}
                />
              ))}
            </div>
            <div className="ht-modal-actions">
              <button className="ht-modal-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="ht-modal-confirm" onClick={addHabit} disabled={!newName.trim()}>Add</button>
            </div>
          </div>
        </div>
      )}

      {editingHabitId && (() => {
        const stats = computeHabitStats(editingHabitId);
        return (
          <div className="ht-modal-overlay" onClick={() => setEditingHabitId(null)}>
            <div className="ht-modal ht-modal-edit" onClick={e => e.stopPropagation()}>
              <div className="ht-modal-title">Edit Habit</div>
              <div className="ht-edit-layout">
                <div className="ht-edit-left">
                  <input
                    className="ht-modal-input"
                    placeholder="Habit name..."
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEditHabit(); }}
                    autoFocus
                  />
                  <div className="ht-icon-page-row">
                    <button
                      className="ht-icon-page-arrow"
                      onClick={() => setEditIconPage(p => Math.max(0, p - 1))}
                      disabled={editIconPage === 0}
                    >‹</button>
                    <div className="ht-icon-grid">
                      {ICON_CHOICES.slice(editIconPage * ICONS_PER_PAGE, editIconPage * ICONS_PER_PAGE + ICONS_PER_PAGE).map(ic => (
                        <button
                          key={ic}
                          className={`ht-icon-choice ${editIcon === ic ? 'selected' : ''}`}
                          onClick={() => setEditIcon(ic)}
                        >
                          {ic}
                        </button>
                      ))}
                    </div>
                    <button
                      className="ht-icon-page-arrow"
                      onClick={() => setEditIconPage(p => Math.min(ICON_PAGE_COUNT - 1, p + 1))}
                      disabled={editIconPage === ICON_PAGE_COUNT - 1}
                    >›</button>
                  </div>
                  <div className="ht-color-row">
                    {HABIT_COLORS.map(c => (
                      <button
                        key={c}
                        className={`ht-color-choice ${editColor === c ? 'selected' : ''}`}
                        style={{ background: c }}
                        onClick={() => setEditColor(c)}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
                <div className="ht-edit-right">
                  <div className="ht-stats-title">Stats</div>
                  {!stats.hasData ? (
                    <div className="ht-stats-empty">No check-ins yet</div>
                  ) : (
                    <div className="ht-stats-list">
                      <div className="ht-stat-row"><span>First checked</span><b>{formatStatDate(stats.firstDate)}</b></div>
                      <div className="ht-stat-row"><span>Tracking for</span><b>{stats.daysTracked} days</b></div>
                      <div className="ht-stat-row"><span>Current streak</span><b>{stats.currentStreak} days</b></div>
                      <div className="ht-stat-row"><span>Longest streak</span><b>{stats.longestStreak} days</b></div>
                      <div className="ht-stat-row"><span>Completed</span><b>{stats.totalCompletions} days</b></div>
                      <div className="ht-stat-row"><span>Missed</span><b>{stats.missedDays} days</b></div>
                      <div className="ht-stat-row"><span>Completion rate</span><b>{stats.completionRate}%</b></div>
                      <div className="ht-stat-row"><span>This month</span><b>{stats.thisMonthChecked}/{stats.thisMonthDaysSoFar} ({stats.thisMonthRate}%)</b></div>
                    </div>
                  )}
                </div>
              </div>
              <div className="ht-modal-actions">
                <button className="ht-modal-cancel" onClick={() => setEditingHabitId(null)}>Cancel</button>
                <button className="ht-modal-confirm" onClick={saveEditHabit} disabled={!editName.trim()}>Save</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
