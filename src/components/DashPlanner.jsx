import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { notifyPermission, notify } from '../platform';
import {
  PLANNER_EVENT, COLORS, colorHex, minutesToTime, timeToMinutes, nowMinutes, todayStr,
  loadBlocks, loadQTasks, saveBlocks, todayBlocks, dayAgenda, findFreeSlot,
} from '../utils/plannerStore';
import './DashPlanner.css';

// How far ahead of a start/end the "get ready" warning fires.
const LEAD_MINUTES = 10;
// Between the first pass (34px, too cramped) and the second (100px, too tall).
const HOUR_H = 68;
const SNAP = 15;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function relLabel(mins) {
  if (mins <= 0) return 'now';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Side-by-side lanes for blocks that overlap in time, same idea as the Planner page.
function layoutLanes(blocks) {
  const sorted = [...blocks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const cols = [];
  sorted.forEach(block => {
    const startM = timeToMinutes(block.startTime);
    let ci = cols.findIndex(col => timeToMinutes(col[col.length - 1].endTime) <= startM);
    if (ci === -1) { ci = cols.length; cols.push([]); }
    cols[ci].push(block);
  });
  const map = new Map();
  const total = cols.length || 1;
  cols.forEach((col, ci) => col.forEach(b => map.set(b.id, { left: ci / total, width: 1 / total })));
  return map;
}

export default function DashPlanner({ onOpenPlanner, onPlannerToast, collapsed: collapsedProp, onToggle }) {
  const [ownCollapsed, setOwnCollapsed] = useState(() => localStorage.getItem('dashPlannerCollapsed') === '1');
  const collapsed = collapsedProp !== undefined ? collapsedProp : ownCollapsed;
  const toggleCollapsed = onToggle || (() => setOwnCollapsed(c => {
    localStorage.setItem('dashPlannerCollapsed', c ? '0' : '1');
    return !c;
  }));

  const [blocks, setBlocks] = useState(loadBlocks);
  const [qTasks, setQTasks] = useState(loadQTasks);
  const [now, setNow] = useState(nowMinutes);
  const [modal, setModal] = useState(null); // { mode:'add'|'edit', block? }
  const [form, setForm] = useState({ title: '', startTime: '09:00', endTime: '10:00', color: 'blue' });
  const [notifOk, setNotifOk] = useState(false);
  const firedRef = useRef(new Set());
  const gridRef = useRef(null);
  const scrolledRef = useRef(false);
  // Quick task being dragged onto the grid: { task, startM } while in flight.
  const [ghost, setGhost] = useState(null);
  const ghostRef = useRef(null);
  // Existing block being dragged to a new time: { id, startM, duration }.
  const [moving, setMoving] = useState(null);
  const movingRef = useRef(null);

  // Stay in step with the full Planner page: it writes through the same store
  // and announces every change, so an edit there lands here immediately.
  useEffect(() => {
    const reload = () => { setBlocks(loadBlocks()); setQTasks(loadQTasks()); };
    window.addEventListener(PLANNER_EVENT, reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener(PLANNER_EVENT, reload);
      window.removeEventListener('storage', reload);
    };
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setNow(nowMinutes()), 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    (async () => { try { setNotifOk(await notifyPermission()); } catch {} })();
  }, []);

  const sorted = useMemo(() => todayBlocks(blocks), [blocks]);
  const agenda = useMemo(() => dayAgenda(blocks), [blocks]);
  const lanes = useMemo(() => layoutLanes(sorted), [sorted]);

  // Open on the current hour rather than at midnight.
  useEffect(() => {
    if (collapsed || scrolledRef.current || !gridRef.current) return;
    gridRef.current.scrollTop = Math.max(0, (now / 60) * HOUR_H - 60);
    scrolledRef.current = true;
  }, [collapsed, now]);

  // Alerts are derived from the clock rather than scheduled with timers: a timer
  // set for hours ahead doesn't survive the app being backgrounded or reloaded,
  // and this recomputes from scratch on every tick. firedRef keeps each specific
  // alert (item + kind) from repeating within the session.
  useEffect(() => {
    const fireIfDue = (key, dueAt, title, body) => {
      if (now < dueAt || now >= dueAt + 2) return; // 2-minute window, ticks are 15s
      if (firedRef.current.has(key)) return;
      firedRef.current.add(key);
      if (onPlannerToast) onPlannerToast(title, body);
      if (notifOk) { try { notify(title, body); } catch {} }
    };

    agenda.forEach(item => {
      const s = timeToMinutes(item.startTime);
      const e = timeToMinutes(item.endTime);
      const what = item.isBreak ? 'Break' : item.title;
      const span = `${item.startTime} – ${item.endTime}`;
      fireIfDue(`${item.id}-pre`, s - LEAD_MINUTES, `In ${LEAD_MINUTES} min: ${what}`, `Starts ${item.startTime}, ends ${item.endTime}`);
      fireIfDue(`${item.id}-start`, s, `Starting: ${what}`, span);
      fireIfDue(`${item.id}-preend`, e - LEAD_MINUTES, `${LEAD_MINUTES} min left: ${what}`, `Ends ${item.endTime}`);
      fireIfDue(`${item.id}-end`, e, `Ending: ${what}`, span);
    });
  }, [now, agenda, notifOk, onPlannerToast]);

  const commit = useCallback((next) => { setBlocks(next); saveBlocks(next); }, []);

  const assignQTask = (task) => {
    const duration = Number(task.defaultDuration) || 60;
    const start = findFreeSlot(sorted, duration);
    commit([...blocks, {
      id: Date.now(), date: todayStr(), title: task.title,
      startTime: minutesToTime(start), endTime: minutesToTime(start + duration),
      color: task.color || 'blue', recur: 'none', note: task.note || '',
    }]);
  };

  // Pointer position -> snapped start minute inside the grid.
  const minutesAtClientY = (clientY) => {
    const scroller = gridRef.current;
    if (!scroller) return 0;
    const rect = scroller.getBoundingClientRect();
    const y = clientY - rect.top + scroller.scrollTop;
    return Math.max(0, Math.min(24 * 60 - SNAP, Math.round((y / HOUR_H) * 60 / SNAP) * SNAP));
  };

  // Drag an existing block to a different time. Duration is preserved; a press
  // that never moves far enough is treated as a click and opens the editor
  // instead, so both gestures live on the same mousedown.
  const startBlockDrag = (block) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const origStart = timeToMinutes(block.startTime);
    const duration = timeToMinutes(block.endTime) - origStart;
    let dragged = false;

    const move = (ev) => {
      if (!dragged && Math.abs(ev.clientY - startY) < 4) return;
      dragged = true;
      const deltaM = ((ev.clientY - startY) / HOUR_H) * 60;
      const startM = Math.max(0, Math.min(24 * 60 - duration, Math.round((origStart + deltaM) / SNAP) * SNAP));
      const next = { id: block.id, startM, duration };
      movingRef.current = next;
      setMoving(next);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const m = movingRef.current;
      movingRef.current = null;
      setMoving(null);
      if (!dragged || !m) { openEdit(block); return; }
      commit(blocks.map(b => b.id === block.id
        ? { ...b, startTime: minutesToTime(m.startM), endTime: minutesToTime(m.startM + m.duration) }
        : b));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // Drag a block's top or bottom edge to change when it starts or ends. Shares
  // the `moving` preview state with the move gesture — both just describe a
  // start and a duration.
  const startBlockResize = (block, edge) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const origStart = timeToMinutes(block.startTime);
    const origEnd = timeToMinutes(block.endTime);

    const move = (ev) => {
      const deltaM = ((ev.clientY - startY) / HOUR_H) * 60;
      let s = origStart;
      let en = origEnd;
      if (edge === 'top') {
        s = Math.max(0, Math.min(origEnd - SNAP, Math.round((origStart + deltaM) / SNAP) * SNAP));
      } else {
        en = Math.min(24 * 60, Math.max(origStart + SNAP, Math.round((origEnd + deltaM) / SNAP) * SNAP));
      }
      const next = { id: block.id, startM: s, duration: en - s };
      movingRef.current = next;
      setMoving(next);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const m = movingRef.current;
      movingRef.current = null;
      setMoving(null);
      if (!m) return;
      commit(blocks.map(b => b.id === block.id
        ? { ...b, startTime: minutesToTime(m.startM), endTime: minutesToTime(m.startM + m.duration) }
        : b));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // Drag a quick task from the strip onto an hour to schedule it there. Mouse
  // events rather than HTML5 drag-and-drop so the ghost can follow live and the
  // drop time can snap as it moves.
  const startQTaskDrag = (task) => (e) => {
    e.preventDefault();
    const duration = Number(task.defaultDuration) || 60;
    const move = (ev) => {
      const startM = Math.min(minutesAtClientY(ev.clientY), 24 * 60 - duration);
      const next = { task, startM, duration };
      ghostRef.current = next;
      setGhost(next);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const g = ghostRef.current;
      ghostRef.current = null;
      setGhost(null);
      if (!g) { assignQTask(task); return; } // treated as a plain click
      commit([...blocks, {
        id: Date.now(), date: todayStr(), title: task.title,
        startTime: minutesToTime(g.startM), endTime: minutesToTime(g.startM + g.duration),
        color: task.color || 'blue', recur: 'none', note: task.note || '',
      }]);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const openEdit = (block) => {
    setForm({ title: block.title, startTime: block.startTime, endTime: block.endTime, color: block.color || 'blue' });
    setModal({ mode: 'edit', block });
  };

  const saveModal = () => {
    const title = form.title.trim();
    if (!title) return;
    if (modal.mode === 'add') {
      commit([...blocks, { id: Date.now(), date: todayStr(), ...form, title, recur: 'none', note: '' }]);
    } else {
      commit(blocks.map(b => b.id === modal.block.id ? { ...b, ...form, title } : b));
    }
    setModal(null);
  };

  const removeBlock = (id) => { commit(blocks.filter(b => b.id !== id)); setModal(null); };

  const d = new Date();
  const dateLabel = `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

  // What the countdown strip shows: whatever is running plus the next thing up.
  const current = agenda.find(i => now >= timeToMinutes(i.startTime) && now < timeToMinutes(i.endTime));
  const next = agenda.find(i => timeToMinutes(i.startTime) > now);

  return (
    <div className={`dp-panel${collapsed ? ' collapsed' : ''}`}>
      <div className="dp-header" onClick={toggleCollapsed}>
        <span className={`dp-chevron${collapsed ? ' collapsed' : ''}`}>▾</span>
        <span className="dp-title">Today</span>
        <span className="dp-date">{dateLabel}</span>
        <span className="dp-count">{sorted.length}</span>
        {onOpenPlanner && (
          <button className="dp-open-btn" title="Open full planner" onClick={(e) => { e.stopPropagation(); onOpenPlanner(); }}>↗</button>
        )}
      </div>

      {!collapsed && (
        <>
          <div className="dp-now">
            {current ? (
              <div className="dp-now-row">
                <span className="dp-now-dot" style={{ background: current.isBreak ? '#6b7280' : colorHex(current.color) }} />
                <span className="dp-now-label">Now</span>
                <span className="dp-now-title">{current.isBreak ? 'Break' : current.title}</span>
                <span className="dp-now-rel">{relLabel(timeToMinutes(current.endTime) - now)} left</span>
              </div>
            ) : (
              <div className="dp-now-row dp-now-idle"><span className="dp-now-label">Now</span><span className="dp-now-title">Nothing scheduled</span></div>
            )}
            {next && (
              <div className="dp-now-row">
                <span className="dp-now-dot" style={{ background: next.isBreak ? '#6b7280' : colorHex(next.color) }} />
                <span className="dp-now-label">Next</span>
                <span className="dp-now-title">{next.isBreak ? 'Break' : next.title}</span>
                <span className="dp-now-rel">in {relLabel(timeToMinutes(next.startTime) - now)}</span>
              </div>
            )}
          </div>

          <div className="dp-grid-scroll" ref={gridRef}>
            <div className="dp-grid" style={{ height: 24 * HOUR_H }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="dp-hour" style={{ top: h * HOUR_H, height: HOUR_H }}>
                  <span className="dp-hour-label">{String(h).padStart(2, '0')}:00</span>
                </div>
              ))}

              {/* Own layer so blocks are bounded on both sides instead of
                  running to the panel edge; insets here are what make the left
                  and right margins match. */}
              <div className="dp-blocks">
                {sorted.map(b => {
                  const dragged = moving && moving.id === b.id;
                  const s = dragged ? moving.startM : timeToMinutes(b.startTime);
                  const e = dragged ? moving.startM + moving.duration : timeToMinutes(b.endTime);
                  const lane = lanes.get(b.id) || { left: 0, width: 1 };
                  const active = now >= s && now < e;
                  return (
                    <div
                      key={b.id}
                      className={`dp-block${now >= e ? ' past' : ''}${active ? ' active' : ''}${dragged ? ' dragging' : ''}`}
                      style={{
                        top: (s / 60) * HOUR_H,
                        height: Math.max(14, ((e - s) / 60) * HOUR_H - 2),
                        left: `${lane.left * 100}%`,
                        width: `calc(${lane.width * 100}% - 3px)`,
                        background: `${colorHex(b.color)}22`,
                        borderLeftColor: colorHex(b.color),
                      }}
                      title={`${b.title} · ${b.startTime}–${b.endTime}`}
                      onMouseDown={startBlockDrag(b)}
                    >
                      <span className="dp-resize dp-resize-top" onMouseDown={startBlockResize(b, 'top')} />
                      <span className="dp-block-title">{b.title}</span>
                      <span className="dp-block-time">{minutesToTime(s)}–{minutesToTime(e)}</span>
                      <span className="dp-resize dp-resize-bottom" onMouseDown={startBlockResize(b, 'bottom')} />
                    </div>
                  );
                })}

                {ghost && (
                  <div
                    className="dp-block dp-ghost"
                    style={{
                      top: (ghost.startM / 60) * HOUR_H,
                      height: Math.max(14, (ghost.duration / 60) * HOUR_H - 2),
                      left: 0,
                      width: 'calc(100% - 3px)',
                      background: `${colorHex(ghost.task.color)}33`,
                      borderLeftColor: colorHex(ghost.task.color),
                    }}
                  >
                    <span className="dp-block-title">{ghost.task.title}</span>
                    <span className="dp-block-time">{minutesToTime(ghost.startM)}–{minutesToTime(ghost.startM + ghost.duration)}</span>
                  </div>
                )}
              </div>

              <div className="dp-nowline" style={{ top: (now / 60) * HOUR_H }}>
                <span className="dp-nowdot" />
              </div>
            </div>
          </div>

          {qTasks.length > 0 && (
            <div className="dp-qtasks">
              {qTasks.map(t => (
                <button
                  key={t.id}
                  className="dp-qtask"
                  style={{ borderLeftColor: colorHex(t.color) }}
                  title={`Drag onto an hour, or click for the next free slot (${t.defaultDuration || 60} min)`}
                  onMouseDown={startQTaskDrag(t)}
                >
                  <span className="dp-qtask-dot" style={{ background: colorHex(t.color) }} />
                  {t.title}
                </button>
              ))}
            </div>
          )}

          <button className="dp-add-btn" onClick={() => {
            const start = findFreeSlot(sorted, 60);
            setForm({ title: '', startTime: minutesToTime(start), endTime: minutesToTime(start + 60), color: 'blue' });
            setModal({ mode: 'add' });
          }}>+ Add block</button>
        </>
      )}

      {modal && (
        <div className="dp-modal-overlay" onClick={() => setModal(null)}>
          <div className="dp-modal" onClick={e => e.stopPropagation()}>
            <div className="dp-modal-title">{modal.mode === 'add' ? 'New block' : 'Edit block'}</div>
            <input
              className="dp-input" placeholder="What are you working on?" autoFocus
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') saveModal(); if (e.key === 'Escape') setModal(null); }}
            />
            <div className="dp-add-row">
              <input className="dp-input dp-time-input" type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
              <span className="dp-dash">–</span>
              <input className="dp-input dp-time-input" type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
            </div>
            <div className="dp-swatches">
              {COLORS.map(c => (
                <button key={c.id} className={`dp-swatch${form.color === c.id ? ' active' : ''}`} style={{ background: c.hex }} onClick={() => setForm(f => ({ ...f, color: c.id }))} />
              ))}
            </div>
            <div className="dp-modal-actions">
              {modal.mode === 'edit' && <button className="dp-delete" onClick={() => removeBlock(modal.block.id)}>Delete</button>}
              <button className="dp-cancel" onClick={() => setModal(null)}>Cancel</button>
              <button className="dp-save" onClick={saveModal} disabled={!form.title.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
