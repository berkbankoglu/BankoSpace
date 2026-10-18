import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notifyPermission, notify } from '../platform';
import {
  loadBlocks, saveBlocks, loadQTasks, saveQTasks, loadCalendars, saveCalendars,
  loadWeekStart, saveWeekStart, weekStartOf,
  loadHabitTasks, loadHabitList, saveHabitList, HABIT_COLORS, resolveColor, nearestPaletteId,
  PLANNER_EVENT, COLORS, colorHex, todayStr, visibleEvents, expandRange,
  timeToMinutes, minutesToTime,
} from '../utils/plannerStore';
import { useUndoScope } from '../utils/undoHistory';
import {
  editEvent, deleteEvent, moveOccurrence, searchEvents, addDaysStr, daysBetween,
  MODEL_VERSION, DEFAULT_CALENDARS,
} from '../utils/calendarModel';
import { describeRule } from '../utils/recurrence';
import EventEditor, { ScopeDialog } from './EventEditor';
import { TimeGrid, MonthView, YearView, MiniMonth, HOUR_HEIGHT, MONTHS, fmtTime } from './CalendarViews';
import './Calendar.css';

// The calendar page.
//
// It owns the stored events and hands the grids occurrences; the grids hand back
// intents ("the user dropped this occurrence here"), and this file turns those
// into the scoped edits the model understands. That is the whole architecture:
// nothing below this file writes, and nothing above it knows about repeat rules.

const VIEWS = [
  { id: 'day',   label: 'Day',   key: '1' },
  { id: 'week',  label: 'Week',  key: '2' },
  { id: 'month', label: 'Month', key: '3' },
  { id: 'year',  label: 'Year',  key: '4' },
];

const pad = (n) => String(n).padStart(2, '0');
const parse = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Typing in a field must not trigger view shortcuts.
const inField = (el) => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

export default function Calendar({ onPlannerToast }) {
  const [events, setEvents] = useState(loadBlocks);
  const [calendars, setCalendars] = useState(loadCalendars);
  const [qTasks, setQTasks] = useState(loadQTasks);
  // Habits are draggable here for the same reason they are on the dashboard:
  // putting one on the calendar IS how it gets ticked off for the day, so the
  // things you actually schedule all live in one list.
  const [habitTasks, setHabitTasks] = useState(loadHabitTasks);

  const [weekStart, setWeekStart] = useState(loadWeekStart);
  // A week of seven columns is unreadable on a narrow window, so it opens on
  // the day instead. The view you had on the wide layout is remembered and
  // handed back when there is room for it again.
  const [view, setView] = useState(() => (window.innerWidth <= 900 ? 'day' : 'week'));
  const wideViewRef = useRef('week');
  const [cursor, setCursor] = useState(todayStr);
  const [selected, setSelected] = useState(() => new Set());
  const [editor, setEditor] = useState(null);       // { draft, anchor, isNew, occ }
  const [scopeAsk, setScopeAsk] = useState(null);   // { action, title, apply }
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  // On a narrow window the sidebar is a drawer over the grid, so it starts
  // closed — opening it would otherwise cover the calendar on first paint.
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 900);
  const [notifOk, setNotifOk] = useState(false);
  const [nowMins, setNowMins] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());

  const [drag, setDrag] = useState(null);           // { mode, occ, originM, duration }
  // Several events can be dragged at once, so what follows the pointer is a
  // list of previews, not one.
  const [ghosts, setGhosts] = useState([]);
  const [marquee, setMarquee] = useState(null);
  const [qtDrag, setQtDrag] = useState(null);
  const [dropDate, setDropDate] = useState(null);   // month-view drop target
  const [qtPointer, setQtPointer] = useState(null); // floating chip position
  // Editing a habit or a quick task, from the sidebar. { kind, id, title, color, duration }
  const [chipEdit, setChipEdit] = useState(null);
  // Narrow windows can't drag from the drawer onto the grid — the drawer is
  // over the grid. Tapping a task arms it instead, and the next tap on a time
  // places it. { task, kind }
  const [armed, setArmed] = useState(null);
  // A drag that moved must not also count as a click that opens the editor.
  const dragMovedRef = useRef(false);

  // How wide a day column has to be before an event reads as an event rather
  // than a coloured sliver — "App Dev 3 PM" and a little breathing room.
  const MIN_DAY_W = 210;

  const mainRef = useRef(null);
  const bodyRef = useRef(null);
  const [mainWidth, setMainWidth] = useState(0);
  const [bodyWidth, setBodyWidth] = useState(0);

  const gridRef = useRef(null);
  const timers = useRef([]);
  const today = todayStr();

  // The compact view shows as many days as actually fit, measured rather than
  // guessed: the window's width isn't the grid's width, because the app's own
  // sidebar is in front of it and can be collapsed.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        if (e.target === mainRef.current) setMainWidth(e.contentRect.width);
        if (e.target === bodyRef.current) setBodyWidth(e.contentRect.width);
      }
    });
    if (mainRef.current) { ro.observe(mainRef.current); setMainWidth(mainRef.current.getBoundingClientRect().width); }
    if (bodyRef.current) { ro.observe(bodyRef.current); setBodyWidth(bodyRef.current.getBoundingClientRect().width); }
    return () => ro.disconnect();
  }, []);

  // What matters is how much room the CALENDAR has, not how wide the window is:
  // the app's own sidebar sits in front of it and can be collapsed, so a 930px
  // window with that sidebar open leaves the grid about 670px — enough for two
  // days, nowhere near enough for seven. Measuring the body (which contains the
  // sidebar in either of its forms) keeps this stable: switching the sidebar to
  // a drawer doesn't change the number being measured, so the two can't
  // oscillate.
  const narrow = (bodyWidth || window.innerWidth) <= 900;

  // Only the narrow layout packs days in. On a wide window "Day" means a day —
  // someone who picked it there asked for one.
  const dayCount = useMemo(() => {
    if (!narrow) return 1;
    const usable = Math.max(0, mainWidth - 64);   // minus the hour gutter
    return Math.max(1, Math.min(7, Math.floor(usable / MIN_DAY_W) || 1));
  }, [narrow, mainWidth]);

  // ── persistence ────────────────────────────────────────────────────────────

  const commit = useCallback((next) => { setEvents(next); saveBlocks(next); }, []);

  // Ctrl+Z works on whatever you last did, anywhere in the app — but only for
  // the scopes that are mounted. The dashboard registered the planner's events
  // and this page did not, so an accidental delete here could not be undone.
  useUndoScope('planner_blocks', events, useCallback((v) => { setEvents(v); saveBlocks(v); }, []));

  // Another view (the dashboard) writing the same keys must show up here, and
  // vice versa — same contract the planner has always had.
  useEffect(() => {
    const onExternal = (e) => {
      const k = e.detail?.key;
      if (!k || k === 'planner_blocks') setEvents(loadBlocks());
      if (!k || k === 'planner_qtasks') setQTasks(loadQTasks());
      if (!k || k === 'planner_calendars') setCalendars(loadCalendars());
      if (!k || k === 'calendar_week_start') setWeekStart(loadWeekStart());
    };
    window.addEventListener(PLANNER_EVENT, onExternal);
    return () => window.removeEventListener(PLANNER_EVENT, onExternal);
  }, []);

  // Crossing between the two layouts changes what the sidebar IS: a column on
  // the left when there is room, a drawer over the grid when there isn't. A
  // drawer that stayed open from the wide layout would cover the calendar.
  // Crossing between the two layouts changes what the sidebar IS — a column
  // when there is room, a drawer over the grid when there isn't — and which
  // view makes sense. The view you had on the wide layout is handed back.
  const wasNarrow = useRef(narrow);
  useEffect(() => {
    if (wasNarrow.current === narrow) return;
    wasNarrow.current = narrow;
    setSidebarOpen(!narrow);
    setArmed(null);
    setView(v => {
      if (narrow) { if (v !== 'day') wideViewRef.current = v; return 'day'; }
      return wideViewRef.current || 'week';
    });
  }, [narrow]);

  useEffect(() => {
    const reload = () => setHabitTasks(loadHabitTasks());
    window.addEventListener('habits-updated', reload);
    return () => window.removeEventListener('habits-updated', reload);
  }, []);

  useEffect(() => { (async () => setNotifOk(await notifyPermission()))(); }, []);

  // The clock line, updated on the minute boundary rather than every 60s from
  // mount, so it never sits a few seconds off.
  useEffect(() => {
    let iv;
    const tick = () => setNowMins(new Date().getHours() * 60 + new Date().getMinutes());
    const t = setTimeout(() => { tick(); iv = setInterval(tick, 60000); },
      (60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds());
    return () => { clearTimeout(t); if (iv) clearInterval(iv); };
  }, []);

  // ── the window each view needs ─────────────────────────────────────────────

  const range = useMemo(() => {
    if (view === 'day') return { from: cursor, to: addDaysStr(cursor, dayCount - 1) };
    if (view === 'week') { const s = weekStartOf(cursor, weekStart); return { from: s, to: addDaysStr(s, 6) }; }
    if (view === 'month') {
      const d = parse(cursor);
      const first = key(new Date(d.getFullYear(), d.getMonth(), 1));
      const gridStart = weekStartOf(first, weekStart);
      return { from: gridStart, to: addDaysStr(gridStart, 41) };
    }
    const y = parse(cursor).getFullYear();
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }, [view, cursor, weekStart, dayCount]);

  const shown = useMemo(() => visibleEvents(events, calendars), [events, calendars]);
  const occurrences = useMemo(() => expandRange(shown, range.from, range.to), [shown, range]);

  // The mini-month shows a whole month regardless of which view is open, so it
  // needs its own window — in week view the main range covers seven days and
  // would leave the rest of the month looking empty.
  const miniMarks = useMemo(() => {
    const d0 = parse(cursor);
    const from = weekStartOf(key(new Date(d0.getFullYear(), d0.getMonth(), 1)), weekStart);
    const map = new Map();
    for (const occ of expandRange(shown, from, addDaysStr(from, 41))) {
      // A multi-day event marks every day it covers, and the first event of a
      // day gives the dot its colour — same rule as the year view, so the two
      // never disagree about what a day looks like.
      let ds = occ.date;
      for (let i = 0; i <= (occ.span || 0); i++) {
        if (!map.has(ds)) map.set(ds, occ.color);
        ds = addDaysStr(ds, 1);
      }
    }
    return map;
  }, [shown, cursor, weekStart]);

  const days = useMemo(() => {
    if (view === 'day') return Array.from({ length: dayCount }, (_, i) => addDaysStr(cursor, i));
    if (view === 'week') { const s = weekStartOf(cursor, weekStart); return Array.from({ length: 7 }, (_, i) => addDaysStr(s, i)); }
    return [];
  }, [view, cursor, weekStart, dayCount]);

  // ── navigation ─────────────────────────────────────────────────────────────

  const step = useCallback((dir) => {
    setCursor(c => {
      if (view === 'day') return addDaysStr(c, dir * dayCount);
      if (view === 'week') return addDaysStr(c, 7 * dir);
      const d = parse(c);
      if (view === 'month') return key(new Date(d.getFullYear(), d.getMonth() + dir, 1));
      return key(new Date(d.getFullYear() + dir, d.getMonth(), 1));
    });
  }, [view, dayCount]);

  const label = useMemo(() => {
    const d = parse(cursor);
    if (view === 'day') {
      if (dayCount === 1) return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      const e = parse(addDaysStr(cursor, dayCount - 1));
      return d.getMonth() === e.getMonth()
        ? `${MONTHS[d.getMonth()]} ${d.getDate()} – ${e.getDate()}, ${d.getFullYear()}`
        : `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()} – ${MONTHS[e.getMonth()].slice(0, 3)} ${e.getDate()}, ${e.getFullYear()}`;
    }
    if (view === 'week') {
      const s = parse(weekStartOf(cursor, weekStart)), e = parse(addDaysStr(weekStartOf(cursor, weekStart), 6));
      const sameMonth = s.getMonth() === e.getMonth();
      return sameMonth
        ? `${MONTHS[s.getMonth()]} ${s.getDate()} – ${e.getDate()}, ${s.getFullYear()}`
        : `${MONTHS[s.getMonth()].slice(0, 3)} ${s.getDate()} – ${MONTHS[e.getMonth()].slice(0, 3)} ${e.getDate()}, ${e.getFullYear()}`;
    }
    if (view === 'month') return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    return String(d.getFullYear());
  }, [view, cursor, weekStart, dayCount]);

  // Week and day views open scrolled to the working day rather than to midnight.
  useEffect(() => {
    if ((view === 'week' || view === 'day') && gridRef.current) {
      gridRef.current.scrollTop = Math.max(0, (nowMins / 60) * HOUR_HEIGHT - 180);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // ── creating and editing ───────────────────────────────────────────────────

  const blankEvent = useCallback((dateStr, allDay, startM) => {
    const cal = calendars.find(c => c.visible !== false) || calendars[0] || DEFAULT_CALENDARS[0];
    const s = startM ?? Math.round((new Date().getHours() * 60) / 15) * 15;
    return {
      id: Date.now() + Math.floor(Math.random() * 1000),
      calendarId: cal.id,
      title: '', notes: '', location: '',
      color: cal.color,
      allDay: !!allDay,
      date: dateStr, endDate: dateStr,
      startTime: minutesToTime(Math.min(23 * 60, s)),
      endTime: minutesToTime(Math.min(24 * 60 - 1, Math.min(23 * 60, s) + 60)),
      rrule: null, exdates: [], overrides: {},
      alerts: [], v: MODEL_VERSION,
    };
  }, [calendars]);

  const openNew = useCallback((dateStr, allDay, startM, anchor) => {
    const draft = blankEvent(dateStr || cursor, allDay, startM);
    setEditor({ draft, anchor, isNew: true, occ: null });
  }, [blankEvent, cursor]);

  const openExisting = useCallback((occ, anchor) => {
    const stored = events.find(e => e.id === occ.eventId);
    if (!stored) return;
    // The inspector edits what the user clicked: a detached occurrence shows its
    // own values, a plain one shows the series'.
    setEditor({ draft: { ...stored, ...(stored.overrides?.[occ.occDate] || {}) }, anchor, isNew: false, occ });
  }, [events]);

  // Every write that touches a repeating event goes through here, so there is
  // one place that decides whether to ask about scope.
  const applyScoped = useCallback((occ, action, run, title) => {
    const stored = events.find(e => e.id === occ?.eventId);
    if (!stored?.rrule) { run('all'); return; }
    setScopeAsk({ action, title: title || stored.title, apply: run });
  }, [events]);

  const saveFromEditor = useCallback((form) => {
    const clean = { ...form, title: (form.title || '').trim() };
    if (editor.isNew) {
      commit([...events, clean]);
      setEditor(null);
      return;
    }
    const occ = editor.occ;
    const patch = { ...clean };
    delete patch.id; delete patch.v;
    applyScoped(occ, 'edit', (scope) => {
      commit(editEvent(events, occ.eventId, occ.occDate, scope, patch));
      setEditor(null);
      setScopeAsk(null);
    }, clean.title);
  }, [editor, events, commit, applyScoped]);

  const deleteFromEditor = useCallback((form) => {
    const occ = editor.occ;
    if (!occ) { setEditor(null); return; }
    applyScoped(occ, 'delete', (scope) => {
      commit(deleteEvent(events, occ.eventId, occ.occDate, scope));
      setEditor(null);
      setScopeAsk(null);
      setSelected(new Set());
    }, form?.title);
  }, [editor, events, commit, applyScoped]);

  // Delete key on a selection. A selection can hold occurrences of several
  // events, so repeating ones are asked about one at a time rather than
  // guessing a single scope for the whole batch.
  const deleteSelection = useCallback(() => {
    if (!selected.size) return;
    const chosen = occurrences.filter(o => selected.has(o.instanceId));
    const plain = chosen.filter(o => !o.isRecurring);
    const repeating = chosen.filter(o => o.isRecurring);
    let next = events;
    for (const o of plain) next = deleteEvent(next, o.eventId, o.occDate, 'all');
    if (plain.length) commit(next);
    setSelected(new Set());
    if (repeating.length) {
      const first = repeating[0];
      applyScoped(first, 'delete', (scope) => {
        let after = deleteEvent(next, first.eventId, first.occDate, scope);
        // The rest of the batch follows the same answer — asking once per
        // occurrence for a 20-event selection would be worse than assuming.
        for (const o of repeating.slice(1)) after = deleteEvent(after, o.eventId, o.occDate, scope);
        commit(after);
        setScopeAsk(null);
      }, first.title);
    }
  }, [selected, occurrences, events, commit, applyScoped]);

  // A duplicate is always a plain one-off, even when the original repeats:
  // copying a series would silently create a second one you then have to find
  // and delete. This copies the occurrence you were looking at.
  const duplicateSelection = useCallback(() => {
    const chosen = occurrences.filter(o => selected.has(o.instanceId));
    if (!chosen.length) return;
    const copies = chosen.map(o => ({
      id: Date.now() + Math.floor(Math.random() * 10000),
      calendarId: o.calendarId, title: o.title, notes: o.notes || '', location: o.location || '',
      color: o.color, colorPinned: o.colorPinned, allDay: !!o.allDay,
      date: o.date, endDate: o.endDate, startTime: o.startTime, endTime: o.endTime,
      rrule: null, exdates: [], overrides: {}, alerts: o.alerts || [], v: MODEL_VERSION,
    }));
    commit([...events, ...copies]);
    setSelected(new Set(copies.map(c => `${c.id}:${c.date}`)));
  }, [occurrences, selected, events, commit]);

  const goToDate = useCallback(() => {
    const answer = (window.prompt('Go to date (YYYY-MM-DD)', cursor) || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(answer) && !Number.isNaN(parse(answer).getTime())) setCursor(answer);
  }, [cursor]);

  // ── selection ──────────────────────────────────────────────────────────────

  const onSelect = useCallback((e, occ) => {
    setSelected(prev => {
      if (e.ctrlKey || e.metaKey) {
        const next = new Set(prev);
        if (next.has(occ.instanceId)) next.delete(occ.instanceId); else next.add(occ.instanceId);
        return next;
      }
      return new Set([occ.instanceId]);
    });
  }, []);

  const onOpen = useCallback((occ) => {
    // Anchor the popover next to the event that was opened.
    const el = document.querySelector(`[data-occ="${occ.instanceId}"]`);
    const r = el?.getBoundingClientRect();
    openExisting(occ, r ? { top: r.top, left: Math.min(r.right + 12, window.innerWidth - 400) } : null);
  }, [openExisting]);

  // ── dragging ───────────────────────────────────────────────────────────────

  // Pixels to a snapped minute within a day column, and which column the pointer
  // is over — both grids share this so a drag can cross days.
  const pointerToSlot = useCallback((e) => {
    const cols = Array.from(document.querySelectorAll('.cal-col'));
    const col = cols.find(c => {
      const r = c.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right;
    }) || cols[0];
    if (!col) return null;
    const r = col.getBoundingClientRect();
    const mins = Math.round((((e.clientY - r.top) / HOUR_HEIGHT) * 60) / 15) * 15;
    return { dateStr: col.dataset.date, mins: Math.max(0, Math.min(24 * 60 - 15, mins)) };
  }, []);

  // Strict version of the above: no falling back to the first column. A quick
  // task released over the sidebar or the toolbar should schedule nothing, not
  // land on Sunday.
  const pointerToSlotStrict = useCallback((e) => {
    const col = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cal-col');
    if (!col) return null;
    const r = col.getBoundingClientRect();
    const mins = Math.round((((e.clientY - r.top) / HOUR_HEIGHT) * 60) / 15) * 15;
    return { dateStr: col.dataset.date, mins: Math.max(0, Math.min(24 * 60 - 15, mins)) };
  }, []);

  const onMoveStart = useCallback((e, occ) => {
    if (e.button !== 0) return;
    const slot = pointerToSlot(e);
    if (!slot) return;
    // Grabbing one of several selected events moves the whole selection, each
    // keeping its offset from the one under the pointer. Grabbing something
    // outside the selection moves just that.
    const group = (selected.has(occ.instanceId) && selected.size > 1)
      ? occurrences.filter(o => selected.has(o.instanceId) && !o.allDay && !o.span)
      : [occ];
    setDrag({
      mode: 'move', occ, group,
      grabOffset: slot.mins - timeToMinutes(occ.startTime),
      duration: Math.max(15, timeToMinutes(occ.endTime) - timeToMinutes(occ.startTime)),
      moved: false,
    });
  }, [pointerToSlot, selected, occurrences]);

  const onResizeStart = useCallback((e, occ, edge) => {
    if (e.button !== 0) return;
    setDrag({ mode: edge === 'top' ? 'resize-top' : 'resize-bottom', occ, moved: false });
  }, []);

  // Month view has no time axis, so a drag there is a move between days and
  // nothing else — the event keeps the time it already had.
  const onMonthDragStart = useCallback((e, occ) => {
    if (e.button !== 0) return;
    setDrag({ mode: 'month', occ, moved: false });
  }, []);

  const onMarqueeStart = useCallback((e, dateStr) => {
    const slot = pointerToSlot(e);
    if (!slot) return;
    setMarquee({ dateStr, fromM: slot.mins, toM: slot.mins });
  }, [pointerToSlot]);

  useEffect(() => {
    if (!drag && !marquee && !qtDrag) return;

    const onMove = (e) => {
      if (qtDrag) {
        // The chip follows the cursor everywhere, including outside the grid —
        // that is the whole point of carrying it in the air.
        setQtPointer({ x: e.clientX, y: e.clientY });
        dragMovedRef.current = true;
        setQtDrag(q => (q && !q.moved ? { ...q, moved: true } : q));
        return;
      }
      if (drag?.mode === 'month') {
        const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cal-month-cell');
        setDrag(d => (d && !d.moved ? { ...d, moved: true } : d));
        setDropDate(cell?.dataset.date || null);
        return;
      }
      const slot = pointerToSlot(e);
      if (!slot) return;
      if (marquee) { setMarquee(m => ({ ...m, toM: slot.mins })); return; }
      const { mode, occ } = drag;
      if (mode === 'move') {
        const startM = Math.max(0, Math.min(24 * 60 - drag.duration, slot.mins - drag.grabOffset));
        const deltaM = startM - timeToMinutes(occ.startTime);
        const deltaDays = daysBetween(occ.date, slot.dateStr);
        setGhosts((drag.group || [occ]).map(g => {
          const gs = Math.max(0, Math.min(24 * 60 - 15, timeToMinutes(g.startTime) + deltaM));
          const dur = Math.max(15, timeToMinutes(g.endTime) - timeToMinutes(g.startTime));
          return {
            instanceId: g.instanceId, dateStr: addDaysStr(g.date, deltaDays),
            startM: gs, endM: Math.min(24 * 60, gs + dur), color: g.color, title: g.title,
          };
        }));
      } else if (mode === 'resize-bottom') {
        const startM = timeToMinutes(occ.startTime);
        setGhosts([{ instanceId: occ.instanceId, dateStr: occ.date, startM, endM: Math.max(startM + 15, slot.mins), color: occ.color, title: occ.title }]);
      } else {
        const endM = timeToMinutes(occ.endTime);
        setGhosts([{ instanceId: occ.instanceId, dateStr: occ.date, startM: Math.min(endM - 15, slot.mins), endM, color: occ.color, title: occ.title }]);
      }
      setDrag(d => (d && !d.moved ? { ...d, moved: true } : d));
    };

    const onUp = (e) => {
      if (qtDrag) {
        // Only a real drag that ends over a day column schedules anything.
        const slot = qtDrag.moved ? pointerToSlotStrict(e) : null;
        if (slot) {
          const t = qtDrag.task;
          const dur = Math.max(15, t.defaultDuration || 60);
          const ev = blankEvent(slot.dateStr, false, slot.mins);
          commit([...events, {
            ...ev, title: t.title, notes: t.note || '',
            // A habit carries a raw hex; events store palette ids.
            color: t.isHabit ? nearestPaletteId(t.color) : t.color,
            endTime: minutesToTime(Math.min(24 * 60 - 1, slot.mins + dur)),
          }]);
        }
        setQtDrag(null); setQtPointer(null); setGhosts([]);
        return;
      }
      if (drag?.mode === 'month') {
        const { occ } = drag;
        if (drag.moved && dropDate && dropDate !== occ.date) {
          const run = (scope) => {
            commit(moveOccurrence(events, occ, dropDate, timeToMinutes(occ.startTime), scope));
            setScopeAsk(null);
          };
          if (occ.isRecurring) applyScoped(occ, 'edit', run, occ.title);
          else run('all');
        }
        setDrag(null); setDropDate(null);
        return;
      }
      if (marquee) {
        // A zero-height sweep is a click on empty space, not a selection.
        if (Math.abs(marquee.toM - marquee.fromM) < 15) setSelected(new Set());
        else {
          const lo = Math.min(marquee.fromM, marquee.toM), hi = Math.max(marquee.fromM, marquee.toM);
          const hit = occurrences.filter(o =>
            o.date === marquee.dateStr && !o.allDay && !o.span &&
            timeToMinutes(o.startTime) < hi && timeToMinutes(o.endTime) > lo);
          setSelected(new Set(hit.map(o => o.instanceId)));
        }
        setMarquee(null);
        return;
      }
      if (drag && ghosts.length && drag.moved) {
        const { occ, mode } = drag;
        const byId = new Map(ghosts.map(g => [g.instanceId, g]));
        const run = (scope) => {
          let next = events;
          if (mode === 'move') {
            // An 'all' edit rewrites the series itself, so a series must only be
            // moved once however many of its occurrences are in the selection.
            const done = new Set();
            for (const g of (drag.group || [occ])) {
              if (scope === 'all' && done.has(g.eventId)) continue;
              done.add(g.eventId);
              const t = byId.get(g.instanceId);
              if (t) next = moveOccurrence(next, g, t.dateStr, t.startM, scope);
            }
          } else {
            const t = byId.get(occ.instanceId);
            next = editEvent(next, occ.eventId, occ.occDate, scope, {
              startTime: minutesToTime(t.startM), endTime: minutesToTime(t.endM),
            });
          }
          commit(next);
          setScopeAsk(null);
        };
        // Dragging one occurrence of a series means that occurrence, unless the
        // user says otherwise — so the question is asked, defaulting to nothing.
        const repeating = (mode === 'move' ? (drag.group || [occ]) : [occ]).find(o => o.isRecurring);
        if (repeating) applyScoped(repeating, 'edit', run, repeating.title);
        else run('all');
      }
      setDrag(null); setGhosts([]);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [drag, marquee, qtDrag, ghosts, dropDate, events, occurrences, commit, pointerToSlot, pointerToSlotStrict, applyScoped, blankEvent]);

  // ── keyboard ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if (editor || scopeAsk) return;            // the popover owns the keyboard
      if (inField(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod) {
        const v = VIEWS.find(x => x.key === e.key);
        if (v) { e.preventDefault(); setView(v.id); return; }
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          if (e.shiftKey) goToDate(); else setCursor(todayStr());
          return;
        }
        if (e.key === 'd' || e.key === 'D') { e.preventDefault(); duplicateSelection(); return; }
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNew(cursor, false); return; }
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); setSearchOpen(true); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); step(1); return; }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selected.size) { e.preventDefault(); deleteSelection(); } return; }
      if (e.key === 'Escape') { setSelected(new Set()); setSearchOpen(false); return; }
      // Apple's bare arrows move the cursor a day/week at a time.
      if (e.key === 'ArrowLeft') { step(-1); return; }
      if (e.key === 'ArrowRight') { step(1); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, scopeAsk, selected, cursor, step, openNew, deleteSelection, duplicateSelection, goToDate]);

  // ── alerts ─────────────────────────────────────────────────────────────────

  // Timers are in-process: the app has to be running for an alert to fire, which
  // is why the window is short and the list is rebuilt every minute. A persisted
  // OS-level schedule is the next step; this at least honours per-event offsets
  // instead of only firing at the start time.
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const now = Date.now();
    const horizon = now + 36 * 3600 * 1000;
    const upcoming = expandRange(shown, today, addDaysStr(today, 2));
    let scheduled = 0;
    for (const occ of upcoming) {
      if (!occ.alerts?.length || scheduled >= 50) continue;
      const startMs = parse(occ.date).getTime() + (occ.allDay ? 9 * 60 : timeToMinutes(occ.startTime)) * 60000;
      for (const alert of occ.alerts) {
        const at = startMs - (alert.minutesBefore || 0) * 60000;
        if (at <= now || at > horizon) continue;
        scheduled++;
        timers.current.push(setTimeout(async () => {
          const when = occ.allDay ? 'All day' : fmtTime(occ.startTime);
          onPlannerToast?.(occ.title || 'Event', when);
          if (notifOk) { try { await notify(occ.title || 'Event', when); } catch { /* notifications off */ } }
        }, at - now));
      }
    }
    return () => { timers.current.forEach(clearTimeout); };
  }, [shown, today, notifOk, onPlannerToast]);

  // ── calendars sidebar ──────────────────────────────────────────────────────

  const toggleCalendar = (id) => {
    const next = calendars.map(c => (c.id === id ? { ...c, visible: c.visible === false } : c));
    setCalendars(next); saveCalendars(next);
  };

  const addCalendar = () => {
    const name = (window.prompt('Calendar name') || '').trim();
    if (!name) return;
    const used = new Set(calendars.map(c => c.color));
    const color = (COLORS.find(c => !used.has(c.id)) || COLORS[0]).id;
    const next = [...calendars, { id: `cal-${Date.now()}`, name, color, visible: true }];
    setCalendars(next); saveCalendars(next);
  };

  const renameCalendar = (cal) => {
    const name = (window.prompt('Calendar name', cal.name) || '').trim();
    if (!name) return;
    const next = calendars.map(c => (c.id === cal.id ? { ...c, name } : c));
    setCalendars(next); saveCalendars(next);
  };

  const recolorCalendar = (cal) => {
    const i = COLORS.findIndex(c => c.id === cal.color);
    const color = COLORS[(i + 1) % COLORS.length].id;
    const next = calendars.map(c => (c.id === cal.id ? { ...c, color } : c));
    setCalendars(next); saveCalendars(next);
    // Events that never chose their own colour follow the calendar's.
    const moved = events.map(e => (e.calendarId === cal.id && !e.colorPinned ? { ...e, color } : e));
    commit(moved);
  };

  const removeCalendar = (cal) => {
    if (calendars.length <= 1) return;
    const count = events.filter(e => (e.calendarId || 'personal') === cal.id).length;
    if (count && !window.confirm(`Delete “${cal.name}” and its ${count} event${count > 1 ? 's' : ''}?`)) return;
    const next = calendars.filter(c => c.id !== cal.id);
    setCalendars(next); saveCalendars(next);
    commit(events.filter(e => (e.calendarId || 'personal') !== cal.id));
  };

  // ── habits and quick tasks: add, edit, remove ──────────────────────────────

  const startChipDrag = (t, kind) => (e) => {
    dragMovedRef.current = false;
    const r = e.currentTarget.getBoundingClientRect();
    setQtDrag({ task: t, kind, moved: false, w: r.width, h: r.height, dx: e.clientX - r.left, dy: e.clientY - r.top });
  };

  // A click that wasn't a drag opens the editor — the row is both a handle and
  // a button, the way the dashboard chips already behave.
  // Narrow: a tap arms the task for placing and closes the drawer, so the grid
  // is visible for the second tap. Wide: a click opens the editor, because
  // scheduling there is done by dragging.
  const onChipTap = (t, kind) => () => {
    if (dragMovedRef.current) return;
    if (narrow) { setArmed({ task: t, kind }); setSidebarOpen(false); return; }
    setChipEdit({
      kind,
      id: kind === 'habit' ? t.habitId : t.id,
      title: t.title,
      color: t.color,
      duration: t.defaultDuration || 60,
    });
  };

  const openChipEdit = (t, kind) => () => {
    if (dragMovedRef.current) return;
    setChipEdit({
      kind,
      id: kind === 'habit' ? t.habitId : t.id,
      title: t.title,
      color: t.color,
      duration: t.defaultDuration || 60,
    });
  };

  const saveChipEdit = () => {
    const title = (chipEdit.title || '').trim();
    if (!title) return;
    if (chipEdit.kind === 'habit') {
      saveHabitList(loadHabitList().map(h => (h.id === chipEdit.id ? { ...h, name: title, color: chipEdit.color } : h)));
      setHabitTasks(loadHabitTasks());
    } else {
      const next = qTasks.map(t => (t.id === chipEdit.id
        ? { ...t, title, color: chipEdit.color, defaultDuration: chipEdit.duration }
        : t));
      setQTasks(next); saveQTasks(next);
    }
    setChipEdit(null);
  };

  const deleteChip = () => {
    if (chipEdit.kind === 'habit') {
      // Only the habit itself goes; its tick history stays keyed by id, so
      // re-adding a habit with the same id would find its past intact.
      saveHabitList(loadHabitList().filter(h => h.id !== chipEdit.id));
      setHabitTasks(loadHabitTasks());
    } else {
      const next = qTasks.filter(t => t.id !== chipEdit.id);
      setQTasks(next); saveQTasks(next);
    }
    setChipEdit(null);
  };

  // The second half of tap-to-place: a tap on the grid with something armed.
  const placeArmed = useCallback((dateStr, mins) => {
    if (!armed) return;
    const t = armed.task;
    const dur = Math.max(15, t.defaultDuration || 60);
    const start = Math.max(0, Math.min(24 * 60 - 15, mins));
    const ev = blankEvent(dateStr, false, start);
    commit([...events, {
      ...ev, title: t.title, notes: t.note || '',
      color: t.isHabit ? nearestPaletteId(t.color) : t.color,
      endTime: minutesToTime(Math.min(24 * 60 - 1, start + dur)),
    }]);
    setArmed(null);
  }, [armed, events, commit, blankEvent]);

  const addHabit = () => {
    const name = (window.prompt('Habit name') || '').trim();
    if (!name) return;
    const list = loadHabitList();
    const used = new Set(list.map(h => h.color));
    const color = HABIT_COLORS.find(c => !used.has(c)) || HABIT_COLORS[0];
    saveHabitList([...list, { id: Date.now(), name, color }]);
    setHabitTasks(loadHabitTasks());
  };

  // ── quick tasks ────────────────────────────────────────────────────────────

  const addQTask = () => {
    const title = (window.prompt('Quick task name') || '').trim();
    if (!title) return;
    const next = [...qTasks, { id: Date.now(), title, color: COLORS[Math.floor(Math.random() * COLORS.length)].id, defaultDuration: 60, note: '' }];
    setQTasks(next); saveQTasks(next);
  };

  const removeQTask = (id) => {
    const next = qTasks.filter(t => t.id !== id);
    setQTasks(next); saveQTasks(next);
  };

  // ── search ─────────────────────────────────────────────────────────────────

  const results = useMemo(() => {
    if (!searchOpen || !query.trim()) return [];
    const y = parse(cursor).getFullYear();
    return searchEvents(shown, query, `${y - 1}-01-01`, `${y + 2}-12-31`).slice(0, 100);
  }, [searchOpen, query, shown, cursor]);

  // ── render ─────────────────────────────────────────────────────────────────

  const d = parse(cursor);

  return (
    <div className={`cal-root${sidebarOpen ? '' : ' no-sidebar'}${narrow ? ' is-narrow' : ''}`}>
      <div className="cal-toolbar">
        <button className="cal-icon-btn" onClick={() => setSidebarOpen(s => !s)} title="Toggle sidebar">☰</button>
        <button className="cal-icon-btn" onClick={() => openNew(cursor, false)} title="New event (⌘N)">+</button>

        <div className="cal-views">
          {VIEWS.map(v => (
            <button
              key={v.id}
              className={`cal-view-btn${view === v.id ? ' active' : ''}`}
              onClick={() => setView(v.id)}
              title={`${v.label} (⌘${v.key})`}
            >{v.id === 'day' && dayCount > 1 ? `${dayCount} Days` : v.label}</button>
          ))}
        </div>

        <div className="cal-nav">
          <button className="cal-nav-btn" onClick={() => step(-1)} title="Previous (⌘←)">‹</button>
          <button className="cal-today-btn" onClick={() => setCursor(todayStr())} title="Today (⌘T)">Today</button>
          <button className="cal-nav-btn" onClick={() => step(1)} title="Next (⌘→)">›</button>
        </div>

        <div className="cal-title">{label}</div>

        <div className="cal-search">
          <input
            className="cal-search-input"
            placeholder="Search"
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); setSearchOpen(false); e.currentTarget.blur(); } }}
          />
          {query && <button className="cal-search-clear" onClick={() => { setQuery(''); setSearchOpen(false); }}>✕</button>}
        </div>
      </div>

      {armed && (
        <div className="cal-arm-bar">
          <span className="cal-arm-text">
            Tap a time to schedule <b>{armed.task.title}</b>
          </span>
          <button className="cal-arm-cancel" onClick={() => setArmed(null)}>Cancel</button>
        </div>
      )}

      <div className="cal-body" ref={bodyRef}>
        {sidebarOpen && (
          <div className="cal-drawer-scrim" onClick={() => setSidebarOpen(false)} />
        )}

        {sidebarOpen && (
          <aside className="cal-sidebar">
            <MiniMonth
              year={d.getFullYear()}
              month={d.getMonth()}
              selected={cursor}
              today={today}
              weekStart={weekStart}
              marks={miniMarks}
              onPick={(ds) => { setCursor(ds); if (view === 'year') setView('day'); }}
              onPrev={() => setCursor(key(new Date(d.getFullYear(), d.getMonth() - 1, 1)))}
              onNext={() => setCursor(key(new Date(d.getFullYear(), d.getMonth() + 1, 1)))}
            />

            <div className="cal-weekstart">
              <span>Week starts</span>
              <div className="cal-weekstart-opts">
                {[[1, 'Mon'], [0, 'Sun']].map(([v, label]) => (
                  <button
                    key={v}
                    className={`cal-weekstart-btn${weekStart === v ? ' active' : ''}`}
                    onClick={() => { setWeekStart(v); saveWeekStart(v); }}
                  >{label}</button>
                ))}
              </div>
            </div>

            <div className="cal-side-section">
              <div className="cal-side-head">
                <span>Calendars</span>
                <button className="cal-side-add" onClick={addCalendar} title="Add calendar">+</button>
              </div>
              <ul className="cal-list">
                {calendars.map(c => (
                  <li className="cal-list-row" key={c.id}>
                    <button
                      className={`cal-list-check${c.visible === false ? '' : ' on'}`}
                      style={{ '--cal-color': colorHex(c.color) }}
                      onClick={() => toggleCalendar(c.id)}
                      title={c.visible === false ? 'Show' : 'Hide'}
                    />
                    <button className="cal-list-name" onDoubleClick={() => renameCalendar(c)} onClick={() => toggleCalendar(c.id)}>
                      {c.name}
                    </button>
                    <span className="cal-list-tools">
                      <button onClick={() => recolorCalendar(c)} title="Next colour">◉</button>
                      <button onClick={() => renameCalendar(c)} title="Rename">✎</button>
                      {calendars.length > 1 && <button onClick={() => removeCalendar(c)} title="Delete">✕</button>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {habitTasks.length > 0 && (
              <div className="cal-side-section">
                <div className="cal-side-head">
                  <span>Habits</span>
                  <span className="cal-side-count">{habitTasks.length}</span>
                  <button className="cal-side-add" onClick={addHabit} title="Add habit">+</button>
                </div>
                <ul className="cal-qtasks">
                  {habitTasks.map(t => (
                    <li
                      key={t.id}
                      className={`cal-qt${qtDrag?.task?.id === t.id ? ' dragging' : ''}`}
                      style={{ '--block-color': resolveColor(t.color) }}
                      onMouseDown={startChipDrag(t, 'habit')}
                      onClick={onChipTap(t, 'habit')}
                      title={narrow
                        ? `${t.title} — tap, then tap a time`
                        : `${t.title} — drag onto a day to schedule it, click to edit`}
                    >
                      <span className="cal-qt-title">{t.title}</span>
                      <span className="cal-qt-dur">{t.defaultDuration || 60}m</span>
                      {narrow && (
                        <button
                          className="cal-qt-edit"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); openChipEdit(t, 'habit')(); }}
                          title="Edit"
                        >✎</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="cal-side-section">
              <div className="cal-side-head">
                <span>Quick tasks</span>
                <button className="cal-side-add" onClick={addQTask} title="Add quick task">+</button>
              </div>
              <ul className="cal-qtasks">
                {qTasks.length === 0 && <li className="cal-qt-empty">Drag one onto a day to schedule it.</li>}
                {qTasks.map(t => (
                  <li
                    key={t.id}
                    className={`cal-qt${qtDrag?.task?.id === t.id ? ' dragging' : ''}`}
                    style={{ '--block-color': colorHex(t.color) }}
                    onMouseDown={startChipDrag(t, 'task')}
                    onClick={onChipTap(t, 'task')}
                    title={narrow
                      ? `${t.title} — tap, then tap a time`
                      : `${t.title} · ${t.defaultDuration || 60} min — drag to schedule, click to edit`}
                  >
                    <span className="cal-qt-dot" />
                    <span className="cal-qt-title">{t.title}</span>
                    <span className="cal-qt-dur">{t.defaultDuration || 60}m</span>
                    {narrow && (
                      <button
                        className="cal-qt-edit"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); openChipEdit(t, 'task')(); }}
                        title="Edit"
                      >✎</button>
                    )}
                    <button className="cal-qt-del" onClick={(e) => { e.stopPropagation(); removeQTask(t.id); }}>✕</button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}

        <main className="cal-main" ref={mainRef}>
          {(view === 'day' || view === 'week') && (
            <TimeGrid
              days={days}
              occurrences={occurrences}
              today={today}
              nowMins={nowMins}
              selectedIds={selected}
              gridRef={gridRef}
              onSelect={onSelect}
              onOpen={onOpen}
              onAddAt={(ds, allDay, startM) => openNew(ds, allDay, startM)}
              onMoveStart={onMoveStart}
              onResizeStart={onResizeStart}
              onMarqueeStart={onMarqueeStart}
              marquee={marquee}
              ghosts={ghosts}
              armed={!!armed}
              onSlotTap={placeArmed}
            />
          )}

          {view === 'month' && (
            <MonthView
              year={d.getFullYear()}
              month={d.getMonth()}
              occurrences={occurrences}
              today={today}
              selectedIds={selected}
              weekStart={weekStart}
              dropDate={drag?.mode === 'month' ? dropDate : null}
              onSelect={onSelect}
              onOpen={onOpen}
              onAddAt={(ds, allDay) => openNew(ds, allDay)}
              onItemDragStart={onMonthDragStart}
              onPickDay={(ds) => { setCursor(ds); setView('day'); }}
            />
          )}

          {view === 'year' && (
            <YearView
              year={d.getFullYear()}
              occurrences={occurrences}
              today={today}
              weekStart={weekStart}
              onPickDay={(ds) => { setCursor(ds); setView('day'); }}
              onPickMonth={(m) => { setCursor(key(new Date(d.getFullYear(), m, 1))); setView('month'); }}
            />
          )}
        </main>

        {searchOpen && query.trim() && (
          <aside className="cal-results">
            <div className="cal-results-head">
              <span>{results.length} result{results.length === 1 ? '' : 's'}</span>
              <button className="cal-icon-btn" onClick={() => { setQuery(''); setSearchOpen(false); }}>✕</button>
            </div>
            <ul className="cal-results-list">
              {results.map(occ => (
                <li key={occ.instanceId}>
                  <button
                    className="cal-result"
                    onClick={() => { setCursor(occ.date); setView('day'); setSelected(new Set([occ.instanceId])); }}
                    onDoubleClick={() => onOpen(occ)}
                  >
                    <span className="cal-result-dot" style={{ background: colorHex(occ.color) }} />
                    <span className="cal-result-main">
                      <span className="cal-result-title">{occ.title || '(No title)'}</span>
                      <span className="cal-result-when">
                        {occ.date}{occ.allDay ? ' · all-day' : ` · ${fmtTime(occ.startTime)}`}
                        {occ.isRecurring ? ` · ${describeRule(occ.rrule)}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      {qtDrag?.moved && qtPointer && (
        <div
          className="cal-qt cal-drag-chip"
          style={{
            left: qtPointer.x - (qtDrag.dx || 0),
            top: qtPointer.y - (qtDrag.dy || 0),
            width: qtDrag.w || undefined,
            height: qtDrag.h || undefined,
            '--block-color': resolveColor(qtDrag.task.color),
          }}
        >
          <span className="cal-qt-title">{qtDrag.task.title}</span>
          <span className="cal-qt-dur">{qtDrag.task.defaultDuration || 60}m</span>
        </div>
      )}

      {editor && (
        <EventEditor
          draft={editor.draft}
          calendars={calendars}
          anchor={editor.anchor}
          isNew={editor.isNew}
          onSave={saveFromEditor}
          onDelete={deleteFromEditor}
          onClose={() => setEditor(null)}
        />
      )}

      {chipEdit && (
        <div className="cal-scope-backdrop" onClick={() => setChipEdit(null)}>
          <div className="cal-chipedit" onClick={(e) => e.stopPropagation()}>
            <div className="cal-scope-title">
              {chipEdit.kind === 'habit' ? 'Edit habit' : 'Edit quick task'}
            </div>
            <input
              className="cal-input"
              autoFocus
              value={chipEdit.title}
              onChange={(e) => setChipEdit(c => ({ ...c, title: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveChipEdit();
                if (e.key === 'Escape') setChipEdit(null);
              }}
            />
            {chipEdit.kind === 'task' && (
              <div className="cal-field-row">
                <label>Duration</label>
                <div className="cal-inline">
                  <input
                    className="cal-input cal-input-num"
                    type="number" min="15" step="15"
                    value={chipEdit.duration}
                    onChange={(e) => setChipEdit(c => ({ ...c, duration: Number(e.target.value) || 60 }))}
                  />
                  <span className="cal-unit">min</span>
                </div>
              </div>
            )}
            <div className="cal-field-row">
              <label>Color</label>
              <div className="cal-swatches">
                {(chipEdit.kind === 'habit' ? HABIT_COLORS.map(hex => ({ id: hex, hex })) : COLORS).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`cal-swatch${chipEdit.color === c.id ? ' active' : ''}`}
                    style={{ background: c.hex }}
                    onClick={() => setChipEdit(x => ({ ...x, color: c.id }))}
                    aria-label={c.id}
                  />
                ))}
              </div>
            </div>
            <div className="cal-inspector-foot">
              <button className="cal-danger-btn" onClick={deleteChip}>Delete</button>
              <div className="cal-foot-right">
                <button className="cal-ghost-btn" onClick={() => setChipEdit(null)}>Cancel</button>
                <button className="cal-primary-btn" onClick={saveChipEdit} disabled={!chipEdit.title.trim()}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {scopeAsk && (
        <ScopeDialog
          action={scopeAsk.action}
          title={scopeAsk.title}
          onPick={(scope) => scopeAsk.apply(scope)}
          onCancel={() => { setScopeAsk(null); setGhosts([]); }}
        />
      )}
    </div>
  );
}
