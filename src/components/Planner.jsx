import { useState, useEffect, useRef, useCallback } from 'react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import './Planner.css';

const STORAGE_KEY = 'planner_blocks';
const QTASKS_KEY  = 'planner_qtasks';

const COLORS = [
  { id: 'blue',   hex: '#3b82f6' },
  { id: 'green',  hex: '#22c55e' },
  { id: 'amber',  hex: '#f59e0b' },
  { id: 'red',    hex: '#ef4444' },
  { id: 'purple', hex: '#a855f7' },
  { id: 'pink',   hex: '#ec4899' },
  { id: 'teal',   hex: '#14b8a6' },
  { id: 'gold',   hex: '#d4a017' },
];

const RECUR_OPTIONS = [
  { value: 'none',    label: 'No repeat' },
  { value: 'daily',   label: 'Every day' },
  { value: 'weekday', label: 'Weekdays (Mon–Fri)' },
  { value: 'weekly',  label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
];

const HOUR_WIDTH  = 80;
const TOTAL_WIDTH = 24 * HOUR_WIDTH; // fallback, overridden by container width
const LABEL_H     = 28;
const BLOCKS_H    = 110;
const SNAP        = 15; // minutes

const pad            = (n) => String(n).padStart(2, '0');
const todayStr       = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const minutesToTime  = (m) => `${pad(Math.floor(m/60))}:${pad(m%60)}`;
const timeToMinutes  = (t) => { const [h,m] = t.split(':').map(Number); return h*60+m; };
const colorHex       = (id) => COLORS.find(c => c.id === id)?.hex || '#3b82f6';
const snapTo         = (m) => Math.round(m / SNAP) * SNAP;
const clamp          = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const xToMins        = (x, tw) => clamp(snapTo((x / tw) * 1440), 0, 23*60);

function blockMatchesDate(block, dateStr) {
  if (block.date === dateStr) return true;
  if (!block.recur || block.recur === 'none') return false;
  const origin = new Date(block.date + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  if (target < origin) return false;
  const dow = target.getDay();
  if (block.recur === 'daily')   return true;
  if (block.recur === 'weekday') return dow >= 1 && dow <= 5;
  if (block.recur === 'weekly')  return dow === origin.getDay();
  if (block.recur === 'monthly') return origin.getDate() === target.getDate();
  return false;
}

function getMonthDays(year, month) {
  const days = [];
  const startPad = new Date(year, month, 1).getDay();
  for (let i = 0; i < startPad; i++) days.push(null);
  const total = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= total; d++) days.push(d);
  return days;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function Planner({ onPlannerToast, onOpenPlanner }) {
  const [blocks,  setBlocks]  = useState(() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } });
  const [qTasks,  setQTasks]  = useState(() => { try { return JSON.parse(localStorage.getItem(QTASKS_KEY))  || []; } catch { return []; } });
  const [viewMode, setViewMode] = useState('day');
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    if (d.getHours() >= 12) d.setDate(d.getDate() + 1);
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
  });
  const [modal,    setModal]   = useState(null);
  const [form,     setForm]    = useState({});
  const [qtModal,  setQtModal] = useState(null);
  const [qtForm,   setQtForm]  = useState({});
  const [notifOk,  setNotifOk] = useState(false);

  // Pointer-based drag state — stored in refs so mousemove never causes re-renders
  // ghost state only triggers renders for visual feedback
  const [ghost, setGhost] = useState(null); // { left, width, colorHex, title, startTime, endTime } | null
  const dragRef = useRef(null);
  /* dragRef.current shape:
     type: 'move'   — moving an existing block
       blockId, origStart, duration, originX, scrollOrigin
     type: 'resize' — resizing right edge of existing block
       blockId, fixedStart, originX, scrollOrigin
     type: 'qtask'  — dragging a quick-task from the panel
       qtask, originX, originY, scrollOrigin, placed (bool)
  */

  const timelineRef = useRef(null);
  const notifTimers = useRef([]);
  const [hourWidth, setHourWidth] = useState(HOUR_WIDTH);

  useEffect(() => {
    const update = () => {
      if (timelineRef.current) {
        setHourWidth(timelineRef.current.clientWidth / 24);
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks)); }, [blocks]);
  useEffect(() => { localStorage.setItem(QTASKS_KEY,  JSON.stringify(qTasks));  }, [qTasks]);

  // Notifications
  useEffect(() => {
    (async () => {
      try {
        let ok = await isPermissionGranted();
        if (!ok) ok = (await requestPermission()) === 'granted';
        setNotifOk(ok);
      } catch {}
    })();
  }, []);

  const scheduleNotifications = useCallback((allBlocks) => {
    notifTimers.current.forEach(clearTimeout);
    notifTimers.current = [];
    const today = todayStr();
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    allBlocks.filter(b => blockMatchesDate(b, today)).forEach(block => {
      [[timeToMinutes(block.startTime), 'Starting'], [timeToMinutes(block.endTime), 'Ending']].forEach(([mins, label]) => {
        const ms = (mins - nowMins) * 60000 - new Date().getSeconds() * 1000;
        if (ms > 0) notifTimers.current.push(setTimeout(async () => {
          if (onPlannerToast) onPlannerToast(`${label}: ${block.title}`, minutesToTime(mins));
          if (notifOk) try { await sendNotification({ title: `${label}: ${block.title}`, body: minutesToTime(mins), actionTypeId: 'planner-block', data: { type: 'planner' } }); } catch {}
        }, ms));
      });
    });
  }, [notifOk, onPlannerToast]);

  useEffect(() => {
    scheduleNotifications(blocks);
    const iv = setInterval(() => scheduleNotifications(blocks), 60000);
    return () => { clearInterval(iv); notifTimers.current.forEach(clearTimeout); };
  }, [blocks, scheduleNotifications]);

  // ── Derived ───────────────────────────────────────────────
  const selectedDateStr = `${currentDate.year}-${pad(currentDate.month+1)}-${pad(currentDate.day)}`;
  const dayBlocks = blocks.filter(b => blockMatchesDate(b, selectedDateStr)).sort((a,b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const monthDays = getMonthDays(currentDate.year, currentDate.month);
  const isToday   = selectedDateStr === todayStr();
  const nowMins   = new Date().getHours() * 60 + new Date().getMinutes();
  const nowLeft   = `${(nowMins / 1440) * 100}%`;
  const totalWidth = 24 * hourWidth;

  // Navigation
  const prevMonth = () => setCurrentDate(d => { const m = d.month===0?11:d.month-1; return {...d, month:m, year:d.month===0?d.year-1:d.year}; });
  const nextMonth = () => setCurrentDate(d => { const m = d.month===11?0:d.month+1; return {...d, month:m, year:d.month===11?d.year+1:d.year}; });
  const goToday   = () => { const d = new Date(); setCurrentDate({ year:d.getFullYear(), month:d.getMonth(), day:d.getDate() }); };
  const prevDay   = () => { const d = new Date(selectedDateStr+'T00:00:00'); d.setDate(d.getDate()-1); setCurrentDate({ year:d.getFullYear(), month:d.getMonth(), day:d.getDate() }); };
  const nextDay   = () => { const d = new Date(selectedDateStr+'T00:00:00'); d.setDate(d.getDate()+1); setCurrentDate({ year:d.getFullYear(), month:d.getMonth(), day:d.getDate() }); };

  // Scroll to now on day view open
  useEffect(() => {
    if (viewMode === 'day' && timelineRef.current && isToday) {
      timelineRef.current.scrollLeft = Math.max(nowLeft - 200, 0);
    }
  }, [viewMode, isToday]);

  // Block modals
  const openAdd  = (date, startMins = 540) => {
    const s = clamp(startMins, 0, 23*60);
    setForm({ title:'', startTime:minutesToTime(s), endTime:minutesToTime(clamp(s+60,1,24*60-1)), color:'blue', recur:'none', note:'' });
    setModal({ mode:'add', date });
  };
  const openEdit = (block) => { setForm({...block}); setModal({ mode:'edit', block }); };
  const saveBlock = () => {
    if (!form.title?.trim()) return;
    if (timeToMinutes(form.startTime) >= timeToMinutes(form.endTime)) return;
    if (modal.mode === 'add') {
      setBlocks(prev => [...prev, { id:Date.now(), date:modal.date, ...form, title:form.title.trim() }]);
    } else {
      setBlocks(prev => prev.map(b => b.id === modal.block.id ? {...b, ...form, title:form.title.trim()} : b));
    }
    setModal(null);
  };
  const deleteBlock = (id) => { setBlocks(prev => prev.filter(b => b.id !== id)); setModal(null); };

  // Quick-task modals
  const openQtAdd  = () => {
    const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)].id;
    setQtForm({ title:'', color:randomColor, defaultDuration:60, note:'' });
    setQtModal({ mode:'add' });
  };
  const openQtEdit = (task) => { setQtForm({...task}); setQtModal({ mode:'edit', task }); };
  const saveQTask  = () => {
    if (!qtForm.title?.trim()) return;
    if (qtModal.mode === 'add') {
      setQTasks(prev => [...prev, { id:Date.now(), ...qtForm, title:qtForm.title.trim() }]);
    } else {
      setQTasks(prev => prev.map(t => t.id === qtModal.task.id ? {...t, ...qtForm, title:qtForm.title.trim()} : t));
    }
    setQtModal(null);
  };
  const deleteQTask = (id) => { setQTasks(prev => prev.filter(t => t.id !== id)); setQtModal(null); };

  // ── Unified pointer drag system ───────────────────────────
  const getTimelineX = (clientX) => {
    const wrapEl = timelineRef.current;
    if (!wrapEl) return 0;
    const rect = wrapEl.getBoundingClientRect();
    return clientX - rect.left + wrapEl.scrollLeft;
  };

  // Called on every mousemove while any drag is active
  const onGlobalMouseMove = useCallback((e) => {
    const dr = dragRef.current;
    if (!dr) return;

    if (dr.type === 'move') {
      const dx   = e.clientX - dr.originX;
      const dMins = snapTo((dx / hourWidth) * 60);
      const start = clamp(dr.origStart + dMins, 0, 24*60 - dr.duration);
      const end   = start + dr.duration;
      setGhost(g => g ? {...g, left:`${(start/1440)*100}%`, startTime:minutesToTime(start), endTime:minutesToTime(end)} : g);
    }

    if (dr.type === 'resize') {
      const x    = getTimelineX(e.clientX);
      const end  = clamp(snapTo((x / totalWidth) * 1440), dr.fixedStart + SNAP, 24*60);
      setGhost(g => g ? {...g, width:`${((end-dr.fixedStart)/1440)*100}%`, endTime:minutesToTime(end)} : g);
    }

    if (dr.type === 'qtask') {
      // show ghost near cursor when over timeline area
      const wrapEl = timelineRef.current;
      if (!wrapEl) return;
      const rect = wrapEl.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const x     = e.clientX - rect.left + wrapEl.scrollLeft;
        const start = clamp(snapTo((x / totalWidth) * 1440), 0, 23*60);
        const dur   = dr.qtask.defaultDuration || 60;
        const end   = clamp(start + dur, SNAP, 24*60);
        setGhost({ left:`${(start/1440)*100}%`, width:`${((end-start)/1440)*100}%`, colorHex:colorHex(dr.qtask.color), title:dr.qtask.title, startTime:minutesToTime(start), endTime:minutesToTime(end) });
      } else {
        setGhost(null);
      }
    }
  }, []);

  // Called on mouseup — finalise the drag
  const onGlobalMouseUp = useCallback((e) => {
    const dr = dragRef.current;
    if (!dr) return;
    dragRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    if (dr.type === 'move') {
      const dx    = e.clientX - dr.originX;
      const dMins = snapTo((dx / hourWidth) * 60);
      if (Math.abs(dMins) >= SNAP) {
        const start = clamp(dr.origStart + dMins, 0, 24*60 - dr.duration);
        const end   = start + dr.duration;
        setBlocks(prev => prev.map(b => b.id === dr.blockId
          ? {...b, startTime:minutesToTime(start), endTime:minutesToTime(end)}
          : b));
        dr.wasDragged = true;
      }
    }

    if (dr.type === 'resize') {
      const x   = getTimelineX(e.clientX);
      const end = clamp(snapTo((x / totalWidth) * 1440), dr.fixedStart + SNAP, 24*60);
      setBlocks(prev => prev.map(b => b.id === dr.blockId
        ? {...b, endTime:minutesToTime(end)}
        : b));
    }

    if (dr.type === 'qtask') {
      const wrapEl = timelineRef.current;
      if (wrapEl) {
        const rect = wrapEl.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const x     = e.clientX - rect.left + wrapEl.scrollLeft;
          const start = clamp(snapTo((x / totalWidth) * 1440), 0, 23*60);
          const dur   = dr.qtask.defaultDuration || 60;
          const end   = clamp(start + dur, SNAP, 24*60);
          setBlocks(prev => [...prev, {
            id: Date.now(),
            date: selectedDateStr,
            title: dr.qtask.title,
            startTime: minutesToTime(start),
            endTime: minutesToTime(end),
            color: dr.qtask.color,
            recur: 'none',
            note: dr.qtask.note || '',
          }]);
        }
      }
    }

    setGhost(null);
    window.removeEventListener('mousemove', onGlobalMouseMove);
    window.removeEventListener('mouseup',   onGlobalMouseUp);
  }, [selectedDateStr, onGlobalMouseMove]);

  const startDrag = (drState) => {
    dragRef.current = drState;
    document.body.style.cursor     = drState.type === 'resize' ? 'ew-resize' : 'grabbing';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup',   onGlobalMouseUp);
  };

  // Move existing block
  const handleBlockMove = (e, block) => {
    e.preventDefault();
    e.stopPropagation();
    const { left, width, color } = posStyle(block);
    setGhost({ left, width, colorHex:colorHex(block.color), title:block.title, startTime:block.startTime, endTime:block.endTime });
    startDrag({
      type: 'move',
      blockId: block.id,
      origStart: timeToMinutes(block.startTime),
      duration: timeToMinutes(block.endTime) - timeToMinutes(block.startTime),
      originX: e.clientX,
      wasDragged: false,
    });
  };

  // Resize (right edge)
  const handleBlockResize = (e, block) => {
    e.preventDefault();
    e.stopPropagation();
    const { left, width, color } = posStyle(block);
    setGhost({ left, width, colorHex:colorHex(block.color), title:block.title, startTime:block.startTime, endTime:block.endTime });
    startDrag({
      type: 'resize',
      blockId: block.id,
      fixedStart: timeToMinutes(block.startTime),
      originX: e.clientX,
    });
  };

  // Quick-task drag start
  const handleQtaskMouseDown = (e, qtask) => {
    e.preventDefault();
    setGhost(null);
    startDrag({ type:'qtask', qtask, originX:e.clientX, originY:e.clientY });
  };

  const handleTimelineClick = () => {}; // clicking timeline does nothing, use + Add Block button

  // Helper: pixel position of a block
  const posStyle = (block) => {
    const start = timeToMinutes(block.startTime);
    const end   = timeToMinutes(block.endTime);
    return {
      left:  `${(start / 1440) * 100}%`,
      width: `${Math.max((end - start) / 1440 * 100, 1)}%`,
      color: colorHex(block.color),
    };
  };

  const getBlocksForDay = (day) => {
    if (!day) return [];
    return blocks.filter(b => blockMatchesDate(b, `${currentDate.year}-${pad(currentDate.month+1)}-${pad(day)}`));
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="planner">

      {/* Header */}
      <div className="pl-header">
        <div className="pl-header-left">
          <button className="pl-nav-btn" onClick={prevMonth}>‹</button>
          <h2 className="pl-title">
            {viewMode === 'month'
              ? `${MONTHS[currentDate.month]} ${currentDate.year}`
              : `${MONTHS[currentDate.month]} ${pad(currentDate.day)}, ${currentDate.year}`}
          </h2>
          <button className="pl-nav-btn" onClick={nextMonth}>›</button>
          <button className="pl-today-btn" onClick={goToday}>Today</button>
        </div>
        <div className="pl-header-right">
          <div className="pl-view-switch">
            <button className={`pl-view-btn ${viewMode==='month'?'active':''}`} onClick={() => setViewMode('month')}>Month</button>
            <button className={`pl-view-btn ${viewMode==='day'?'active':''}`}   onClick={() => setViewMode('day')}>Day</button>
          </div>
          {viewMode === 'day' && (
            <button className="pl-add-btn" onClick={() => openAdd(selectedDateStr)}>+ Add Block</button>
          )}
        </div>
      </div>

      {/* ── Month View ── */}
      {viewMode === 'month' && (
        <div className="pl-month">
          <div className="pl-month-weekdays">
            {DAYS.map(d => <div key={d} className="pl-weekday">{d}</div>)}
          </div>
          <div className="pl-month-grid">
            {monthDays.map((day, i) => {
              if (!day) return <div key={`e${i}`} className="pl-day-cell empty" />;
              const dayBlks     = getBlocksForDay(day);
              const isSelected  = currentDate.day === day;
              const isTodayCell = `${currentDate.year}-${pad(currentDate.month+1)}-${pad(day)}` === todayStr();
              return (
                <div
                  key={day}
                  className={`pl-day-cell${isSelected?' selected':''}${isTodayCell?' today':''}`}
                  onClick={() => { setCurrentDate(d => ({...d, day})); setViewMode('day'); }}
                >
                  <span className="pl-day-num">{day}</span>
                  {dayBlks.slice(0,2).map(b => (
                    <div key={b.id} className="pl-month-block" style={{ background: colorHex(b.color) }}>
                      <span className="pl-month-block-time">{b.startTime}</span>
                      <span className="pl-month-block-title">{b.title}</span>
                    </div>
                  ))}
                  {dayBlks.length > 2 && <div className="pl-month-more">+{dayBlks.length-2} more</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Day View ── */}
      {viewMode === 'day' && (
        <div className="pl-day-view">

          {/* Day nav */}
          <div className="pl-day-nav">
            <button className="pl-nav-btn" onClick={prevDay}>‹ Prev</button>
            <span className="pl-day-label">
              {new Date(selectedDateStr+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long'})}
              {isToday && <span className="pl-today-badge">Today</span>}
            </span>
            <button className="pl-nav-btn" onClick={nextDay}>Next ›</button>
          </div>

          {/* Schedule list */}
          <div className="pl-day-list-panel">
            <div className="pl-panel-header">
              <span className="pl-panel-title">Schedule</span>
            </div>
            <div className="pl-day-list">
              {dayBlocks.length === 0 && (
                <div className="pl-empty-day">No blocks yet — click the timeline or drag a quick task above</div>
              )}
              {dayBlocks.map(block => {
                const color = colorHex(block.color);
                return (
                  <div key={block.id} className="pl-day-list-item" onClick={() => openEdit(block)}>
                    <span className="pl-day-list-bar" style={{ background:color }} />
                    <span className="pl-day-list-time">{block.startTime}–{block.endTime}</span>
                    <span className="pl-day-list-title">{block.title}</span>
                    {block.recur !== 'none' && <span className="pl-recur-icon">↻</span>}
                    {block.note && <span className="pl-day-list-note">{block.note}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center: timeline */}
          <div className="pl-center-area">

          {/* Horizontal Timeline */}
          <div className="pl-timeline-wrapper" ref={timelineRef}>
            <div className="pl-timeline" style={{ width: '100%' }}>

              {/* Hour labels */}
              <div className="pl-hour-labels-row" style={{ height: LABEL_H }}>
                {Array.from({length:24}, (_,h) => (
                  <div key={h} className="pl-hour-label-col" style={{ left:`${(h/24)*100}%`, width:`${(1/24)*100}%` }}>
                    <span className="pl-hour-label">{pad(h)}:00</span>
                  </div>
                ))}
              </div>

              {/* Blocks area */}
              <div
                className="pl-blocks-area"
                style={{ height: BLOCKS_H }}
                onClick={handleTimelineClick}
              >
                {/* Vertical hour lines */}
                {Array.from({length:25}, (_,h) => (
                  <div key={h} className="pl-vline" style={{ left:`${(h/24)*100}%` }} />
                ))}
                {/* Half-hour lines */}
                {Array.from({length:24}, (_,h) => (
                  <div key={`h${h}`} className="pl-vline-half" style={{ left:`${((h+0.5)/24)*100}%` }} />
                ))}

                {/* Now line */}
                {isToday && (
                  <div className="pl-now-line" style={{ left:nowLeft }}>
                    <span className="pl-now-dot" />
                  </div>
                )}

                {/* Ghost preview */}
                {ghost && (
                  <div className="pl-block pl-block-ghost" style={{
                    left: ghost.left, width: ghost.width,
                    top:6, bottom:6,
                    borderTopColor: ghost.colorHex,
                    background: ghost.colorHex + '33',
                    pointerEvents: 'none',
                  }}>
                    <span className="pl-block-title">{ghost.title}</span>
                    <span className="pl-block-time">{ghost.startTime}–{ghost.endTime}</span>
                  </div>
                )}

                {/* Actual blocks */}
                {dayBlocks.map(block => {
                  const { left, width, color } = posStyle(block);
                  const isGhosted = ghost && dragRef.current?.blockId === block.id;
                  return (
                    <div
                      key={block.id}
                      className={`pl-block${isGhosted?' pl-block-hidden':''}`}
                      style={{ left, width, top:6, bottom:6, borderTopColor:color, background:color+'22' }}
                      onMouseDown={(e) => { if (!e.target.classList.contains('pl-resize-handle') && !e.target.classList.contains('pl-block-edit-btn')) handleBlockMove(e, block); }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="pl-block-header">
                        <span className="pl-block-title">{block.title}</span>
                        {block.recur !== 'none' && <span className="pl-recur-icon">↻</span>}
                      </div>
                      <span className="pl-block-time">{block.startTime}–{block.endTime}</span>
                      {block.note && width > 130 && <span className="pl-block-note">{block.note}</span>}
                      {/* Action buttons */}
                      <div className="pl-block-actions" onMouseDown={(e) => e.stopPropagation()}>
                        <button className="pl-block-edit-btn" onClick={(e) => { e.stopPropagation(); openEdit(block); }} title="Edit">✎</button>
                        <button className="pl-block-del-btn"  onClick={(e) => { e.stopPropagation(); deleteBlock(block.id); }} title="Delete">×</button>
                      </div>
                      {/* Resize handle */}
                      <div
                        className="pl-resize-handle"
                        onMouseDown={(e) => handleBlockResize(e, block)}
                      />
                    </div>
                  );
                })}
              </div>

            </div>
          </div>

          </div>{/* end pl-center-area */}

          {/* Quick Tasks */}
          <div className="pl-qtasks-panel">
            <div className="pl-panel-header">
              <span className="pl-panel-title">Quick Tasks</span>
              <button className="pl-qt-add-btn" onClick={openQtAdd}>+</button>
            </div>
            <div className="pl-qtasks-list">
              {qTasks.length === 0 && (
                <div className="pl-empty-day">Add tasks here, then drag to timeline</div>
              )}
              {qTasks.map(task => {
                const color = colorHex(task.color);
                return (
                  <div
                    key={task.id}
                    className="pl-qtask-item"
                    onMouseDown={(e) => handleQtaskMouseDown(e, task)}
                    onClick={() => openQtEdit(task)}
                  >
                    <span className="pl-qtask-bar" style={{ background:color }} />
                    <span className="pl-qtask-title">{task.title}</span>
                    <span className="pl-qtask-drag-hint">⠿</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Block Modal ── */}
      {modal && (
        <div className="pl-modal-overlay" onClick={e=>{ if(e.target===e.currentTarget) setModal(null); }}>
          <div className="pl-modal">
            <div className="pl-modal-header">
              <h3>{modal.mode==='add'?'New Block':'Edit Block'}</h3>
              <button className="pl-modal-close" onClick={()=>setModal(null)}>×</button>
            </div>
            <div className="pl-modal-body">
              <div className="pl-field">
                <label>Title</label>
                <input className="pl-input" placeholder="e.g. Deep work, Meeting..." value={form.title||''} onChange={e=>setForm(f=>({...f,title:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&saveBlock()} autoFocus />
              </div>
              <div className="pl-field-row">
                <div className="pl-field"><label>Start</label><input className="pl-input" type="time" value={form.startTime||'09:00'} onChange={e=>setForm(f=>({...f,startTime:e.target.value}))} /></div>
                <div className="pl-field"><label>End</label><input className="pl-input" type="time" value={form.endTime||'10:00'} onChange={e=>setForm(f=>({...f,endTime:e.target.value}))} /></div>
              </div>
              <div className="pl-field">
                <label>Color</label>
                <div className="pl-color-row">
                  {COLORS.map(c=><button key={c.id} className={`pl-color-swatch${form.color===c.id?' active':''}`} style={{background:c.hex}} onClick={()=>setForm(f=>({...f,color:c.id}))} />)}
                </div>
              </div>
              <div className="pl-field">
                <label>Repeat</label>
                <select className="pl-select" value={form.recur||'none'} onChange={e=>setForm(f=>({...f,recur:e.target.value}))}>
                  {RECUR_OPTIONS.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="pl-field">
                <label>Note (optional)</label>
                <textarea className="pl-input pl-textarea" placeholder="Extra details..." value={form.note||''} onChange={e=>setForm(f=>({...f,note:e.target.value}))} rows={2} />
              </div>
            </div>
            <div className="pl-modal-footer">
              {modal.mode==='edit' && <button className="pl-btn-delete" onClick={()=>deleteBlock(modal.block.id)}>Delete</button>}
              <button className="pl-btn-cancel" onClick={()=>setModal(null)}>Cancel</button>
              <button className="pl-btn-save" onClick={saveBlock}>{modal.mode==='add'?'Add':'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Task Modal ── */}
      {qtModal && (
        <div className="pl-modal-overlay" onClick={e=>{ if(e.target===e.currentTarget) setQtModal(null); }}>
          <div className="pl-modal">
            <div className="pl-modal-header">
              <h3>{qtModal.mode==='add'?'New Quick Task':'Edit Quick Task'}</h3>
              <button className="pl-modal-close" onClick={()=>setQtModal(null)}>×</button>
            </div>
            <div className="pl-modal-body">
              <div className="pl-field">
                <label>Title</label>
                <input className="pl-input" placeholder="e.g. Deep Work, Gym, Meeting..." value={qtForm.title||''} onChange={e=>setQtForm(f=>({...f,title:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&saveQTask()} autoFocus />
              </div>
              <div className="pl-field">
                <label>Default Duration (minutes)</label>
                <input className="pl-input" type="number" min="5" max="480" step="5" value={qtForm.defaultDuration||60} onChange={e=>setQtForm(f=>({...f,defaultDuration:parseInt(e.target.value)||60}))} />
              </div>
              <div className="pl-field">
                <label>Color</label>
                <div className="pl-color-row">
                  {COLORS.map(c=><button key={c.id} className={`pl-color-swatch${qtForm.color===c.id?' active':''}`} style={{background:c.hex}} onClick={()=>setQtForm(f=>({...f,color:c.id}))} />)}
                </div>
              </div>
              <div className="pl-field">
                <label>Note (optional)</label>
                <textarea className="pl-input pl-textarea" placeholder="Default note..." value={qtForm.note||''} onChange={e=>setQtForm(f=>({...f,note:e.target.value}))} rows={2} />
              </div>
            </div>
            <div className="pl-modal-footer">
              {qtModal.mode==='edit' && <button className="pl-btn-delete" onClick={()=>deleteQTask(qtModal.task.id)}>Delete</button>}
              <button className="pl-btn-cancel" onClick={()=>setQtModal(null)}>Cancel</button>
              <button className="pl-btn-save" onClick={saveQTask}>{qtModal.mode==='add'?'Add':'Save'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
