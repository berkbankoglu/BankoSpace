import { useState, useEffect, useRef, useCallback } from 'react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { pushKeyToSupabase } from '../supabase';
import './Planner.css';

const STORAGE_KEY = 'planner_blocks';
const QTASKS_KEY  = 'planner_qtasks';
const HOUR_HEIGHT = 64;
const TIME_COL_W  = 52;
const SNAP        = 15;

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

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const pad           = (n) => String(n).padStart(2, '0');
const todayStr      = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const minutesToTime = (m) => `${pad(Math.floor(m/60))}:${pad(m%60)}`;
const timeToMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h*60+m; };
const colorHex      = (id) => COLORS.find(c => c.id === id)?.hex || '#3b82f6';
const snapTo        = (m) => Math.round(m / SNAP) * SNAP;
const clamp         = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
  for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++) days.push(d);
  return days;
}

function getWeekStart(year, month, day) {
  const d = new Date(year, month, day);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return {
      dateStr:  `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
      dayShort: DAYS[d.getDay()],
      dayNum:   d.getDate(),
      year:     d.getFullYear(),
      month:    d.getMonth(),
      day:      d.getDate(),
    };
  });
}

function layoutVertical(dayBlocks) {
  const sorted = [...dayBlocks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const cols = [];
  sorted.forEach(block => {
    const startM = timeToMinutes(block.startTime);
    let ci = cols.findIndex(col => timeToMinutes(col[col.length - 1].endTime) <= startM);
    if (ci === -1) { ci = cols.length; cols.push([]); }
    cols[ci].push(block);
  });
  const result = new Map();
  const total = cols.length || 1;
  cols.forEach((col, ci) => col.forEach(block => result.set(block.id, { left: ci / total, width: 1 / total })));
  return result;
}

export default function Planner({ onPlannerToast }) {
  const [blocks,      setBlocks]      = useState(() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } });
  const [qTasks,      setQTasks]      = useState(() => { try { return JSON.parse(localStorage.getItem(QTASKS_KEY))  || []; } catch { return []; } });
  const [viewMode,    setViewMode]    = useState('week');
  const [currentDate, setCurrentDate] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }; });
  const [modal,       setModal]       = useState(null);
  const [form,        setForm]        = useState({});
  const [qtModal,     setQtModal]     = useState(null);
  const [qtForm,      setQtForm]      = useState({});
  const [notifOk,     setNotifOk]     = useState(false);
  const [nowMins,     setNowMins]     = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  const [ghost,       setGhost]       = useState(null);

  const weekGridRef = useRef(null);
  const notifTimers = useRef([]);

  useEffect(() => {
    const val = JSON.stringify(blocks);
    localStorage.setItem(STORAGE_KEY, val);
    pushKeyToSupabase(STORAGE_KEY, val);
  }, [blocks]);

  useEffect(() => {
    const val = JSON.stringify(qTasks);
    localStorage.setItem(QTASKS_KEY, val);
    pushKeyToSupabase(QTASKS_KEY, val);
  }, [qTasks]);

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
    const nowM  = new Date().getHours() * 60 + new Date().getMinutes();
    allBlocks.filter(b => blockMatchesDate(b, today)).forEach(block => {
      [[timeToMinutes(block.startTime), 'Starting'], [timeToMinutes(block.endTime), 'Ending']].forEach(([mins, label]) => {
        const ms = (mins - nowM) * 60000 - new Date().getSeconds() * 1000;
        if (ms > 0) notifTimers.current.push(setTimeout(async () => {
          if (onPlannerToast) onPlannerToast(`${label}: ${block.title}`, minutesToTime(mins));
          if (notifOk) try { await sendNotification({ title: `${label}: ${block.title}`, body: minutesToTime(mins) }); } catch {}
        }, ms));
      });
    });
  }, [notifOk, onPlannerToast]);

  useEffect(() => {
    scheduleNotifications(blocks);
    const iv = setInterval(() => scheduleNotifications(blocks), 60000);
    return () => { clearInterval(iv); notifTimers.current.forEach(clearTimeout); };
  }, [blocks, scheduleNotifications]);

  useEffect(() => {
    const tick = () => setNowMins(new Date().getHours() * 60 + new Date().getMinutes());
    let ivId = null;
    const tid = setTimeout(() => { tick(); ivId = setInterval(tick, 60000); }, (60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds());
    return () => { clearTimeout(tid); if (ivId) clearInterval(ivId); };
  }, []);

  useEffect(() => {
    if (viewMode === 'week' && weekGridRef.current) {
      weekGridRef.current.scrollTop = Math.max((nowMins / 60) * HOUR_HEIGHT - 200, 0);
    }
  }, [viewMode]);

  // Derived
  const today     = todayStr();
  const monthDays = getMonthDays(currentDate.year, currentDate.month);
  const weekStart = getWeekStart(currentDate.year, currentDate.month, currentDate.day);
  const weekDays  = getWeekDays(weekStart);
  const weekLabel = (() => {
    const f = weekDays[0], l = weekDays[6];
    return f.month === l.month && f.year === l.year
      ? `${MONTHS[f.month]} ${f.year}`
      : `${MONTHS[f.month]} – ${MONTHS[l.month]} ${l.year}`;
  })();

  // Navigation
  const prevMonth = () => setCurrentDate(d => { const m = d.month===0?11:d.month-1; return {...d, month:m, year:d.month===0?d.year-1:d.year}; });
  const nextMonth = () => setCurrentDate(d => { const m = d.month===11?0:d.month+1; return {...d, month:m, year:d.month===11?d.year+1:d.year}; });
  const prevWeek  = () => { const d = new Date(weekStart); d.setDate(d.getDate()-7); setCurrentDate({ year:d.getFullYear(), month:d.getMonth(), day:d.getDate() }); };
  const nextWeek  = () => { const d = new Date(weekStart); d.setDate(d.getDate()+7); setCurrentDate({ year:d.getFullYear(), month:d.getMonth(), day:d.getDate() }); };
  const goToday   = () => { const d = new Date(); setCurrentDate({ year:d.getFullYear(), month:d.getMonth(), day:d.getDate() }); };

  // Block CRUD
  const openAdd   = (date, startMins = 540) => {
    const s = clamp(startMins, 0, 23*60);
    setForm({ title:'', startTime:minutesToTime(s), endTime:minutesToTime(clamp(s+60,1,24*60-1)), color:'blue', recur:'none', note:'' });
    setModal({ mode:'add', date });
  };
  const openEdit  = (block) => { setForm({...block}); setModal({ mode:'edit', block }); };
  const saveBlock = () => {
    if (!form.title?.trim()) return;
    if (timeToMinutes(form.startTime) >= timeToMinutes(form.endTime)) return;
    if (modal.mode === 'add') setBlocks(prev => [...prev, { id:Date.now(), date:modal.date, ...form, title:form.title.trim() }]);
    else setBlocks(prev => prev.map(b => b.id === modal.block.id ? { ...b, ...form, title:form.title.trim() } : b));
    setModal(null);
  };
  const deleteBlock = (id) => { setBlocks(prev => prev.filter(b => b.id !== id)); setModal(null); };

  // Quick task CRUD
  const openQtAdd  = () => { setQtForm({ title:'', color:COLORS[Math.floor(Math.random()*COLORS.length)].id, defaultDuration:60, note:'' }); setQtModal({ mode:'add' }); };
  const openQtEdit = (task) => { setQtForm({...task}); setQtModal({ mode:'edit', task }); };
  const saveQTask  = () => {
    if (!qtForm.title?.trim()) return;
    if (qtModal.mode === 'add') setQTasks(prev => [...prev, { id:Date.now(), ...qtForm, title:qtForm.title.trim() }]);
    else setQTasks(prev => prev.map(t => t.id === qtModal.task.id ? { ...t, ...qtForm, title:qtForm.title.trim() } : t));
    setQtModal(null);
  };
  const deleteQTask = (id) => { setQTasks(prev => prev.filter(t => t.id !== id)); setQtModal(null); };

  // Click on empty area of a day column → open add modal
  const handleWeekColClick = (e, dateStr) => {
    if (e.target.closest('.pl-wk-block')) return;
    const rect   = e.currentTarget.getBoundingClientRect();
    const y      = e.clientY - rect.top;
    openAdd(dateStr, clamp(snapTo((y / HOUR_HEIGHT) * 60), 0, 23*60));
  };

  // Drag block in week view
  const handleWeekBlockMove = (e, block) => {
    e.preventDefault();
    e.stopPropagation();
    const gridEl = weekGridRef.current;
    if (!gridEl) return;

    const startM   = timeToMinutes(block.startTime);
    const duration = timeToMinutes(block.endTime) - startM;
    const gridRect = gridEl.getBoundingClientRect();
    const clickOffY = (e.clientY - gridRect.top + gridEl.scrollTop) - (startM / 60) * HOUR_HEIGHT;

    setGhost({ blockId: block.id, dateStr: block.date, startM, endM: startM + duration, color: block.color, title: block.title });
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    const getPos = (ev) => {
      const y    = ev.clientY - gridRect.top + gridEl.scrollTop;
      const newS = clamp(snapTo(((y - clickOffY) / HOUR_HEIGHT) * 60), 0, 24*60 - duration);
      const colW = (gridRect.width - TIME_COL_W) / 7;
      const ci   = clamp(Math.floor((ev.clientX - gridRect.left - TIME_COL_W) / colW), 0, 6);
      return { startM: newS, endM: newS + duration, dateStr: weekDays[ci].dateStr };
    };

    const onMove = (ev) => {
      const pos = getPos(ev);
      setGhost(g => ({ ...g, dateStr: pos.dateStr, startM: pos.startM, endM: pos.endM }));
    };
    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const pos = getPos(ev);
      setGhost(null);
      setBlocks(prev => prev.map(b => b.id === block.id
        ? { ...b, date: pos.dateStr, startTime: minutesToTime(pos.startM), endTime: minutesToTime(pos.endM) }
        : b));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="planner">

      {/* Header */}
      <div className="pl-header">
        <div className="pl-header-left">
          <button className="pl-nav-btn" onClick={viewMode === 'month' ? prevMonth : prevWeek}>‹</button>
          <h2 className="pl-title">
            {viewMode === 'month' ? `${MONTHS[currentDate.month]} ${currentDate.year}` : weekLabel}
          </h2>
          <button className="pl-nav-btn" onClick={viewMode === 'month' ? nextMonth : nextWeek}>›</button>
          <button className="pl-today-btn" onClick={goToday}>Today</button>
        </div>
        <div className="pl-header-right">
          <div className="pl-view-switch">
            <button className={`pl-view-btn${viewMode==='month'?' active':''}`} onClick={() => setViewMode('month')}>Month</button>
            <button className={`pl-view-btn${viewMode==='week'?' active':''}`}  onClick={() => setViewMode('week')}>Week</button>
          </div>
        </div>
      </div>

      {/* Month View */}
      {viewMode === 'month' && (
        <div className="pl-month">
          <div className="pl-month-weekdays">
            {DAYS.map(d => <div key={d} className="pl-weekday">{d}</div>)}
          </div>
          <div className="pl-month-grid">
            {monthDays.map((day, i) => {
              if (!day) return <div key={`e${i}`} className="pl-day-cell empty" />;
              const ds      = `${currentDate.year}-${pad(currentDate.month+1)}-${pad(day)}`;
              const dayBlks = blocks.filter(b => blockMatchesDate(b, ds));
              return (
                <div key={day}
                  className={`pl-day-cell${ds===today?' today':''}`}
                  onClick={() => { setCurrentDate(d => ({...d, day})); setViewMode('week'); }}
                >
                  <span className="pl-day-num">{day}</span>
                  {dayBlks.slice(0,2).map(b => (
                    <div key={b.id} className="pl-month-block" style={{ background: colorHex(b.color) }}>
                      <span className="pl-month-block-time">{b.startTime}</span>
                      <span className="pl-month-block-title">{b.title}</span>
                    </div>
                  ))}
                  {dayBlks.length > 2 && <div className="pl-month-more">+{dayBlks.length-2}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week View */}
      {viewMode === 'week' && (
        <div className="pl-week-outer">

          {/* Sticky day headers */}
          <div className="pl-wk-header">
            <div className="pl-wk-gutter" />
            {weekDays.map(wd => (
              <div key={wd.dateStr}
                className={`pl-wk-day-hdr${wd.dateStr === today ? ' today' : ''}`}
                onClick={() => openAdd(wd.dateStr)}
              >
                <span className="pl-wk-day-name">{wd.dayShort}</span>
                <span className={`pl-wk-day-num${wd.dateStr === today ? ' today' : ''}`}>{wd.dayNum}</span>
              </div>
            ))}
            <div className="pl-wk-panel-spacer" />
          </div>

          {/* Grid + panel */}
          <div className="pl-wk-body-row">

            <div className="pl-wk-grid" ref={weekGridRef}>
              {/* Time gutter */}
              <div className="pl-wk-times">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="pl-wk-time-cell" style={{ height: HOUR_HEIGHT }}>
                    {h > 0 && <span className="pl-wk-time-label">{pad(h)}:00</span>}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map(wd => {
                const dayBlks = blocks.filter(b => blockMatchesDate(b, wd.dateStr));
                const layout  = layoutVertical(dayBlks);
                return (
                  <div key={wd.dateStr}
                    className={`pl-wk-day-col${wd.dateStr === today ? ' today' : ''}`}
                    style={{ height: 24 * HOUR_HEIGHT }}
                    onClick={(e) => handleWeekColClick(e, wd.dateStr)}
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="pl-wk-hline" style={{ top: h * HOUR_HEIGHT }} />
                    ))}
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={`hf${h}`} className="pl-wk-hline-half" style={{ top: (h + 0.5) * HOUR_HEIGHT }} />
                    ))}

                    {wd.dateStr === today && (
                      <div className="pl-wk-now" style={{ top: (nowMins / 60) * HOUR_HEIGHT }}>
                        <span className="pl-wk-now-dot" />
                      </div>
                    )}

                    {ghost?.dateStr === wd.dateStr && (
                      <div className="pl-wk-block pl-wk-ghost" style={{
                        top:    (ghost.startM / 60) * HOUR_HEIGHT,
                        height: Math.max(((ghost.endM - ghost.startM) / 60) * HOUR_HEIGHT, 22),
                        left: '2px', right: '2px',
                        background: colorHex(ghost.color) + '40',
                        borderLeft: `3px solid ${colorHex(ghost.color)}`,
                      }}>
                        <div className="pl-wk-block-title">{ghost.title}</div>
                        <div className="pl-wk-block-time">{minutesToTime(ghost.startM)}–{minutesToTime(ghost.endM)}</div>
                      </div>
                    )}

                    {dayBlks.map(block => {
                      const startM = timeToMinutes(block.startTime);
                      const endM   = timeToMinutes(block.endTime);
                      const topPx  = (startM / 60) * HOUR_HEIGHT;
                      const hPx    = Math.max(((endM - startM) / 60) * HOUR_HEIGHT, 22);
                      const { left, width } = layout.get(block.id) || { left: 0, width: 1 };
                      const color  = colorHex(block.color);
                      return (
                        <div key={block.id}
                          className={`pl-wk-block${ghost?.blockId === block.id ? ' pl-wk-dragging' : ''}`}
                          style={{
                            top:    topPx,
                            height: hPx,
                            left:   `calc(${left * 100}% + 2px)`,
                            width:  `calc(${width * 100}% - 4px)`,
                            background: color + '22',
                            borderLeft: `3px solid ${color}`,
                          }}
                          onMouseDown={(e) => handleWeekBlockMove(e, block)}
                          onDoubleClick={(e) => { e.stopPropagation(); openEdit(block); }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="pl-wk-block-title">{block.title}</div>
                          {hPx > 38 && <div className="pl-wk-block-time">{block.startTime}–{block.endTime}</div>}
                          {block.recur !== 'none' && <span className="pl-wk-recur">↻</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Right panel */}
            <div className="pl-wk-panel">
              <div className="pl-panel-header">
                <span className="pl-panel-title">Quick Tasks</span>
                <button className="pl-qt-add-btn" onClick={openQtAdd}>+</button>
              </div>
              <div className="pl-qtasks-list">
                {qTasks.length === 0 && <div className="pl-empty-day">Add tasks here</div>}
                {qTasks.map(task => (
                  <div key={task.id} className="pl-qtask-item" onClick={() => openQtEdit(task)}>
                    <span className="pl-qtask-bar" style={{ background: colorHex(task.color) }} />
                    <span className="pl-qtask-title">{task.title}</span>
                    {task.defaultDuration && <span className="pl-qtask-dur">{task.defaultDuration}m</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Block Modal */}
      {modal && (
        <div className="pl-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="pl-modal">
            <div className="pl-modal-header">
              <h3>{modal.mode==='add'?'New Block':'Edit Block'}</h3>
              <button className="pl-modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="pl-modal-body">
              <div className="pl-field">
                <label>Title</label>
                <input className="pl-input" placeholder="e.g. Deep work, Meeting..." value={form.title||''} onChange={e => setForm(f => ({...f,title:e.target.value}))} onKeyDown={e => e.key==='Enter'&&saveBlock()} autoFocus />
              </div>
              <div className="pl-field-row">
                <div className="pl-field"><label>Start</label><input className="pl-input" type="time" value={form.startTime||'09:00'} onChange={e => setForm(f => ({...f,startTime:e.target.value}))} /></div>
                <div className="pl-field"><label>End</label><input className="pl-input" type="time" value={form.endTime||'10:00'} onChange={e => setForm(f => ({...f,endTime:e.target.value}))} /></div>
              </div>
              <div className="pl-field">
                <label>Color</label>
                <div className="pl-color-row">
                  {COLORS.map(c => <button key={c.id} className={`pl-color-swatch${form.color===c.id?' active':''}`} style={{background:c.hex}} onClick={() => setForm(f => ({...f,color:c.id}))} />)}
                </div>
              </div>
              <div className="pl-field">
                <label>Repeat</label>
                <select className="pl-select" value={form.recur||'none'} onChange={e => setForm(f => ({...f,recur:e.target.value}))}>
                  {RECUR_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="pl-field">
                <label>Note (optional)</label>
                <textarea className="pl-input pl-textarea" value={form.note||''} onChange={e => setForm(f => ({...f,note:e.target.value}))} rows={2} />
              </div>
            </div>
            <div className="pl-modal-footer">
              {modal.mode==='edit' && <button className="pl-btn-delete" onClick={() => deleteBlock(modal.block.id)}>Delete</button>}
              <button className="pl-btn-cancel" onClick={() => setModal(null)}>Cancel</button>
              <button className="pl-btn-save" onClick={saveBlock}>{modal.mode==='add'?'Add':'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Task Modal */}
      {qtModal && (
        <div className="pl-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setQtModal(null); }}>
          <div className="pl-modal">
            <div className="pl-modal-header">
              <h3>{qtModal.mode==='add'?'New Quick Task':'Edit Quick Task'}</h3>
              <button className="pl-modal-close" onClick={() => setQtModal(null)}>×</button>
            </div>
            <div className="pl-modal-body">
              <div className="pl-field">
                <label>Title</label>
                <input className="pl-input" value={qtForm.title||''} onChange={e => setQtForm(f => ({...f,title:e.target.value}))} onKeyDown={e => e.key==='Enter'&&saveQTask()} autoFocus />
              </div>
              <div className="pl-field">
                <label>Default Duration (min)</label>
                <input className="pl-input" type="number" min="5" max="480" step="5" value={qtForm.defaultDuration||60} onChange={e => setQtForm(f => ({...f,defaultDuration:parseInt(e.target.value)||60}))} />
              </div>
              <div className="pl-field">
                <label>Color</label>
                <div className="pl-color-row">
                  {COLORS.map(c => <button key={c.id} className={`pl-color-swatch${qtForm.color===c.id?' active':''}`} style={{background:c.hex}} onClick={() => setQtForm(f => ({...f,color:c.id}))} />)}
                </div>
              </div>
              <div className="pl-field">
                <label>Note (optional)</label>
                <textarea className="pl-input pl-textarea" value={qtForm.note||''} onChange={e => setQtForm(f => ({...f,note:e.target.value}))} rows={2} />
              </div>
            </div>
            <div className="pl-modal-footer">
              {qtModal.mode==='edit' && <button className="pl-btn-delete" onClick={() => deleteQTask(qtModal.task.id)}>Delete</button>}
              <button className="pl-btn-cancel" onClick={() => setQtModal(null)}>Cancel</button>
              <button className="pl-btn-save" onClick={saveQTask}>{qtModal.mode==='add'?'Add':'Save'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
