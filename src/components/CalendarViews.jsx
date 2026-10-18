import { useMemo } from 'react';
import { colorHex, timeToMinutes, minutesToTime } from '../utils/plannerStore';
import { daySlice, timedForDay, allDayForDay, addDaysStr, daysBetween } from '../utils/calendarModel';

// The four grids: Day, Week, Month, Year.
//
// Every one of them is handed occurrences, never stored events — so a repeating
// event, a moved occurrence and a one-off are all the same thing to a view, and
// no grid has to know what an rrule is.
//
// Geometry follows Apple Calendar: an all-day strip pinned above the hour grid,
// a red "now" line with a dot on the leading edge, today's date in a filled
// circle, overlapping events sharing the column's width, and a "+N more" row
// when a month cell runs out of room. Colors come from the app's tokens rather
// than Apple's palette, so the calendar sits in the same visual world as the
// rest of the app.

export const HOUR_HEIGHT = 48;
export const TIME_COL_W = 56;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DOW_NARROW = ['S','M','T','W','T','F','S'];

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00');

// Every grid starts its rows on the same weekday, and the header letters have
// to be rotated to match — a Monday-start month with a Sunday-first header is
// the kind of bug nobody notices until they miss an appointment.
const rotate = (arr, n) => arr.slice(n).concat(arr.slice(0, n));
// The first cell of the grid containing `d`: back up to the week's first day.
const gridStart = (d, weekStart) => {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() - weekStart + 7) % 7));
  return x;
};

export const fmtTime = (hhmm) => {
  const m = timeToMinutes(hhmm);
  const h = Math.floor(m / 60), mm = m % 60;
  // Short form, the way Apple labels a block: "9 AM", "9:30 AM".
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm === 0 ? `${h12} ${ampm}` : `${h12}:${pad(mm)} ${ampm}`;
};

// Overlapping events split the width between them, like every real calendar.
// Events are swept in start order and dropped into the first lane whose last
// event has already ended, which is the standard interval-partitioning answer
// and keeps a long event from pushing everything after it into a sliver.
function laneLayout(occs, dateStr) {
  const sorted = [...occs].sort((a, b) => {
    const d = daySlice(a, dateStr).startM - daySlice(b, dateStr).startM;
    return d || daySlice(b, dateStr).endM - daySlice(a, dateStr).endM;
  });
  const lanes = [];           // lane index -> end minute of its last event
  const placed = new Map();   // instanceId -> lane index
  // Events that overlap each other form a cluster; width is divided within the
  // cluster, not across the whole day, so a busy morning doesn't shrink the
  // afternoon.
  const clusters = [];
  let current = null;
  for (const occ of sorted) {
    const { startM, endM } = daySlice(occ, dateStr);
    if (!current || startM >= current.end) {
      current = { items: [], end: endM };
      clusters.push(current);
    }
    current.items.push(occ);
    current.end = Math.max(current.end, endM);
  }
  for (const cluster of clusters) {
    lanes.length = 0;
    for (const occ of cluster.items) {
      const { startM, endM } = daySlice(occ, dateStr);
      let lane = lanes.findIndex(end => end <= startM);
      if (lane === -1) { lanes.push(endM); lane = lanes.length - 1; }
      else lanes[lane] = endM;
      placed.set(occ.instanceId, lane);
    }
    const total = lanes.length || 1;
    for (const occ of cluster.items) {
      const lane = placed.get(occ.instanceId) || 0;
      placed.set(occ.instanceId, { left: lane / total, width: 1 / total });
    }
  }
  return placed;
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function NowLine({ nowMins }) {
  return (
    <div className="cal-now" style={{ top: (nowMins / 60) * HOUR_HEIGHT }}>
      <span className="cal-now-dot" />
    </div>
  );
}

function EventBlock({ occ, dateStr, lane, selected, dragging, onSelect, onOpen, onResizeStart, onMoveStart }) {
  const { startM, endM, continuesBefore, continuesAfter } = daySlice(occ, dateStr);
  const hex = colorHex(occ.color);
  const height = Math.max(16, ((endM - startM) / 60) * HOUR_HEIGHT);
  // Below this a block cannot hold a title and a time on separate lines, so it
  // switches to a single row. Raised with the type size — at the old threshold
  // the two lines were being squeezed into a box too short for them.
  const short = height < 40;
  return (
    <div
      className={`cal-block${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}${short ? ' short' : ''}`}
      style={{
        top: (startM / 60) * HOUR_HEIGHT,
        height,
        left: `calc(${(lane?.left || 0) * 100}% + 2px)`,
        width: `calc(${(lane?.width || 1) * 100}% - 4px)`,
        '--block-color': hex,
      }}
      onMouseDown={(e) => onMoveStart?.(e, occ)}
      onClick={(e) => { e.stopPropagation(); onSelect?.(e, occ); }}
      onDoubleClick={(e) => { e.stopPropagation(); onOpen?.(occ); }}
      title={`${occ.title} · ${fmtTime(occ.startTime)}`}
      data-occ={occ.instanceId}
    >
      {continuesBefore && <span className="cal-block-cont top">▲</span>}
      <div className="cal-block-body">
        <span className="cal-block-title">{occ.title || '(No title)'}</span>
        {!short && <span className="cal-block-time">{fmtTime(occ.startTime)}</span>}
        {!short && occ.location && <span className="cal-block-loc">{occ.location}</span>}
      </div>
      <span className="cal-block-marks">
        {occ.isRecurring && <span className="cal-mark" title="Repeats">↻</span>}
        {occ.alerts?.length > 0 && <span className="cal-mark" title="Has an alert">◔</span>}
      </span>
      {continuesAfter && <span className="cal-block-cont bottom">▼</span>}
      <div className="cal-resize top" onMouseDown={(e) => { e.stopPropagation(); onResizeStart?.(e, occ, 'top'); }} />
      <div className="cal-resize bottom" onMouseDown={(e) => { e.stopPropagation(); onResizeStart?.(e, occ, 'bottom'); }} />
    </div>
  );
}

// The strip above the hour grid. A multi-day event is one bar spanning the days
// it covers, which is the whole reason this is a grid and not a list per column.
function AllDayStrip({ days, occurrences, selectedIds, onSelect, onOpen, onAdd }) {
  const bars = useMemo(() => {
    const first = days[0], last = days[days.length - 1];
    const seen = new Set();
    const rows = [];           // each row is an array of placed bars
    const all = [];
    for (const d of days) {
      for (const occ of allDayForDay(occurrences, d)) {
        if (seen.has(occ.instanceId)) continue;
        seen.add(occ.instanceId);
        const startCol = Math.max(0, daysBetween(first, occ.date));
        const endCol = Math.min(days.length - 1, daysBetween(first, occ.endDate));
        all.push({ occ, startCol, endCol, clipLeft: occ.date < first, clipRight: occ.endDate > last });
      }
    }
    all.sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol));
    // First row that has room: bars never overlap, they stack.
    for (const bar of all) {
      let row = rows.find(r => r.every(b => bar.startCol > b.endCol || bar.endCol < b.startCol));
      if (!row) { row = []; rows.push(row); }
      row.push(bar);
    }
    return rows;
  }, [days, occurrences]);

  return (
    <div className="cal-allday">
      <div className="cal-allday-gutter">all-day</div>
      <div className="cal-allday-rows" style={{ '--cols': days.length }}>
        {bars.length === 0 && <div className="cal-allday-empty" onDoubleClick={() => onAdd?.(days[0], true)} />}
        {bars.map((row, ri) => (
          <div className="cal-allday-row" key={ri}>
            {row.map(({ occ, startCol, endCol, clipLeft, clipRight }) => (
              <div
                key={occ.instanceId}
                className={`cal-allday-bar${selectedIds.has(occ.instanceId) ? ' selected' : ''}${clipLeft ? ' clip-left' : ''}${clipRight ? ' clip-right' : ''}`}
                style={{ gridColumn: `${startCol + 1} / ${endCol + 2}`, '--block-color': colorHex(occ.color) }}
                onClick={(e) => { e.stopPropagation(); onSelect?.(e, occ); }}
                onDoubleClick={(e) => { e.stopPropagation(); onOpen?.(occ); }}
                title={occ.title}
                data-occ={occ.instanceId}
              >
                {clipLeft && <span className="cal-block-cont">◀</span>}
                <span className="cal-allday-title">{occ.title || '(No title)'}</span>
                {occ.isRecurring && <span className="cal-mark">↻</span>}
                {clipRight && <span className="cal-block-cont">▶</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Day / Week ───────────────────────────────────────────────────────────────

export function TimeGrid({
  days, occurrences, today, nowMins, selectedIds, gridRef,
  onSelect, onOpen, onAddAt, onMoveStart, onResizeStart, onMarqueeStart, marquee, ghosts = [],
  armed = false, onSlotTap,
}) {
  const lanes = useMemo(() => {
    const map = new Map();
    for (const d of days) {
      const forDay = timedForDay(occurrences, d);
      for (const [id, lane] of laneLayout(forDay, d)) map.set(id, lane);
    }
    return map;
  }, [days, occurrences]);

  return (
    <div className={`cal-grid-wrap${days.length > 1 ? ' multi' : ''}`}>
      <div className="cal-day-heads" style={{ '--cols': days.length }}>
        <div className="cal-head-gutter" />
        {days.map(d => {
          const dt = parse(d);
          const isToday = d === today;
          return (
            <div className={`cal-day-head${isToday ? ' today' : ''}`} key={d}>
              <span className="cal-dow">{DOW[dt.getDay()]}</span>
              <span className="cal-daynum">{dt.getDate()}</span>
            </div>
          );
        })}
      </div>

      <AllDayStrip
        days={days}
        occurrences={occurrences}
        selectedIds={selectedIds}
        onSelect={onSelect}
        onOpen={onOpen}
        onAdd={onAddAt}
      />

      <div className="cal-grid-scroll" ref={gridRef}>
        <div className="cal-grid" style={{ '--cols': days.length, height: 24 * HOUR_HEIGHT }}>
          <div className="cal-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <div className="cal-hour-label" key={h} style={{ top: h * HOUR_HEIGHT }}>
                {h === 0 ? '' : fmtTime(`${pad(h)}:00`)}
              </div>
            ))}
          </div>
          {days.map((d, ci) => (
            <div
              className={`cal-col${d === today ? ' today' : ''}${armed ? ' arming' : ''}`}
              key={d}
              data-date={d}
              onMouseDown={(e) => { if (!armed && e.target.classList.contains('cal-col')) onMarqueeStart?.(e, d); }}
              onClick={(e) => {
                // With something armed, one tap on an empty slot places it —
                // the narrow layout's replacement for dragging, where the task
                // list is a drawer sitting on top of this grid.
                if (!armed || !e.target.classList.contains('cal-col')) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const mins = Math.max(0, Math.round(((e.clientY - rect.top) / HOUR_HEIGHT) * 60 / 15) * 15);
                onSlotTap?.(d, mins);
              }}
              onDoubleClick={(e) => {
                if (!e.target.classList.contains('cal-col')) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const mins = Math.max(0, Math.round(((e.clientY - rect.top) / HOUR_HEIGHT) * 60 / 15) * 15);
                onAddAt?.(d, false, mins);
              }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <div className="cal-hour-line" key={h} style={{ top: h * HOUR_HEIGHT }} />
              ))}
              {timedForDay(occurrences, d).map(occ => (
                <EventBlock
                  key={occ.instanceId}
                  occ={occ}
                  dateStr={d}
                  lane={lanes.get(occ.instanceId)}
                  selected={selectedIds.has(occ.instanceId)}
                  dragging={ghosts.some(g => g.instanceId === occ.instanceId)}
                  onSelect={onSelect}
                  onOpen={onOpen}
                  onMoveStart={onMoveStart}
                  onResizeStart={onResizeStart}
                />
              ))}
              {ghosts.filter(g => g.dateStr === d).map(g => (
                <div
                  key={g.instanceId || 'new'}
                  className="cal-ghost"
                  style={{
                    top: (g.startM / 60) * HOUR_HEIGHT,
                    height: Math.max(16, ((g.endM - g.startM) / 60) * HOUR_HEIGHT),
                    '--block-color': colorHex(g.color),
                  }}
                >
                  <span className="cal-block-title">{g.title || 'New event'}</span>
                  <span className="cal-block-time">{minutesToTime(g.startM)}</span>
                </div>
              ))}
              {marquee && marquee.dateStr === d && (
                <div className="cal-marquee" style={{ top: Math.min(marquee.fromM, marquee.toM) / 60 * HOUR_HEIGHT, height: Math.abs(marquee.toM - marquee.fromM) / 60 * HOUR_HEIGHT }} />
              )}
              {d === today && <NowLine nowMins={nowMins} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Month ────────────────────────────────────────────────────────────────────

// Six rows always, so the grid doesn't change height from month to month — the
// jump is the single most noticeable difference between a hand-rolled month
// view and a real one.
export function MonthView({ year, month, occurrences, today, selectedIds, weekStart = 1, dropDate, onSelect, onOpen, onAddAt, onPickDay, onItemDragStart, maxPerCell = 3 }) {
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const start = gridStart(first, weekStart);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return { dateStr: key(d), inMonth: d.getMonth() === month, dow: d.getDay(), dayNum: d.getDate() };
    });
  }, [year, month, weekStart]);

  return (
    <div className="cal-month">
      <div className="cal-month-dows">
        {rotate(DOW, weekStart).map((d, i) => (
          <div className={`cal-month-dow${(i + weekStart) % 7 === 0 || (i + weekStart) % 7 === 6 ? ' weekend' : ''}`} key={d + i}>{d}</div>
        ))}
      </div>
      <div className="cal-month-grid">
        {cells.map(cell => {
          const allDay = allDayForDay(occurrences, cell.dateStr);
          const timed = timedForDay(occurrences, cell.dateStr);
          const items = [...allDay, ...timed];
          const shown = items.slice(0, maxPerCell);
          const hidden = items.length - shown.length;
          return (
            <div
              className={`cal-month-cell${cell.inMonth ? '' : ' outside'}${cell.dateStr === today ? ' today' : ''}${cell.dow === 0 || cell.dow === 6 ? ' weekend' : ''}${cell.dateStr === dropDate ? ' drop' : ''}`}
              key={cell.dateStr}
              data-date={cell.dateStr}
              onDoubleClick={(e) => { if (e.target.closest('.cal-month-item')) return; onAddAt?.(cell.dateStr, true); }}
            >
              <div className="cal-month-daynum-row">
                <button className="cal-month-daynum" onClick={() => onPickDay?.(cell.dateStr)}>{cell.dayNum}</button>
              </div>
              <div className="cal-month-items">
                {shown.map(occ => {
                  const isBar = occ.allDay || occ.span > 0;
                  return (
                    <div
                      key={occ.instanceId}
                      className={`cal-month-item${isBar ? ' bar' : ''}${selectedIds.has(occ.instanceId) ? ' selected' : ''}`}
                      style={{ '--block-color': colorHex(occ.color) }}
                      onMouseDown={(e) => onItemDragStart?.(e, occ)}
                      onClick={(e) => { e.stopPropagation(); onSelect?.(e, occ); }}
                      onDoubleClick={(e) => { e.stopPropagation(); onOpen?.(occ); }}
                      title={`${occ.title}${isBar ? '' : ' · ' + fmtTime(occ.startTime)}`}
                      data-occ={occ.instanceId}
                    >
                      {!isBar && <span className="cal-month-dot" />}
                      <span className="cal-month-item-title">{occ.title || '(No title)'}</span>
                      {!isBar && <span className="cal-month-item-time">{fmtTime(occ.startTime)}</span>}
                    </div>
                  );
                })}
                {hidden > 0 && (
                  <button className="cal-month-more" onClick={() => onPickDay?.(cell.dateStr)}>
                    {hidden} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Year ─────────────────────────────────────────────────────────────────────

// Twelve mini months. Apple tints each day by how busy it is; the same idea
// here, with the tint coming from the accent token so it reads in either theme.
export function YearView({ year, occurrences, today, weekStart = 1, onPickDay, onPickMonth }) {
  // Per day: how many events, and which colour to show. The colour is the
  // day's earliest event — occurrences arrive sorted, so the first one wins and
  // a day reads as whatever it starts with, rather than as a generic "busy".
  const byDay = useMemo(() => {
    const map = new Map();
    for (const occ of occurrences) {
      // Anything that occupies whole days — an all-day event or a multi-day one
      // — is marked differently from something that merely sits at a time, the
      // same distinction the week and month views draw as a bar instead of a
      // block.
      const isSpan = occ.allDay || (occ.span || 0) > 0;
      // A multi-day event counts on every day it covers, which is what makes a
      // holiday week look busy rather than just its first day.
      let d = occ.date;
      for (let i = 0; i <= (occ.span || 0); i++) {
        const cur = map.get(d);
        if (cur) {
          cur.count++;
          if (isSpan) cur.span = true; else cur.timed = true;
        } else {
          map.set(d, { count: 1, color: occ.color, span: isSpan, timed: !isSpan });
        }
        d = addDaysStr(d, 1);
      }
    }
    return map;
  }, [occurrences]);

  const max = useMemo(() => Math.max(1, ...[...byDay.values()].map(v => v.count)), [byDay]);

  return (
    <div className="cal-year">
      {MONTHS.map((name, m) => {
        const first = new Date(year, m, 1);
        const start = gridStart(first, weekStart);
        const lead = (first.getDay() - weekStart + 7) % 7;
        const weeks = Math.ceil((lead + new Date(year, m + 1, 0).getDate()) / 7);
        return (
          <div className="cal-year-month" key={name}>
            <button className="cal-year-name" onClick={() => onPickMonth?.(m)}>{name}</button>
            <div className="cal-year-dows">
              {rotate(DOW_NARROW, weekStart).map((d, i) => <span key={i}>{d}</span>)}
            </div>
            <div className="cal-year-days">
              {Array.from({ length: weeks * 7 }, (_, i) => {
                const d = new Date(start);
                d.setDate(d.getDate() + i);
                const ds = key(d);
                const inMonth = d.getMonth() === m;
                const info = inMonth ? byDay.get(ds) : null;
                return (
                  <button
                    key={ds}
                    className={`cal-year-day${inMonth ? '' : ' outside'}${ds === today ? ' today' : ''}`}
                    onClick={() => onPickDay?.(ds)}
                    title={info ? `${info.count} event${info.count > 1 ? 's' : ''}` : ''}
                  >
                    <span
                      className={`cal-year-pill${info ? ' busy' : ''}${info?.span ? (info.timed ? ' both' : ' allday') : ''}`}
                      style={info ? {
                        '--day-color': colorHex(info.color),
                        '--heat': Math.min(1, 0.45 + (info.count / max) * 0.55),
                      } : undefined}
                    >
                      {d.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Mini month (sidebar) ─────────────────────────────────────────────────────

export function MiniMonth({ year, month, selected, today, weekStart = 1, marks, onPick, onPrev, onNext }) {
  const first = new Date(year, month, 1);
  const start = gridStart(first, weekStart);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const weeks = Math.ceil((lead + new Date(year, month + 1, 0).getDate()) / 7);
  return (
    <div className="cal-mini">
      <div className="cal-mini-head">
        <button className="cal-mini-nav" onClick={onPrev} aria-label="Previous month">‹</button>
        <span className="cal-mini-title">{MONTHS[month]} {year}</span>
        <button className="cal-mini-nav" onClick={onNext} aria-label="Next month">›</button>
      </div>
      <div className="cal-mini-dows">{rotate(DOW_NARROW, weekStart).map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="cal-mini-days">
        {Array.from({ length: weeks * 7 }, (_, i) => {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const ds = key(d);
          return (
            <button
              key={ds}
              className={`cal-mini-day${d.getMonth() === month ? '' : ' outside'}${ds === today ? ' today' : ''}${ds === selected ? ' selected' : ''}`}
              onClick={() => onPick?.(ds)}
            >
              {d.getDate()}
              {marks?.has(ds) && <span className="cal-mini-dot" style={{ '--dot': colorHex(marks.get(ds)) }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { MONTHS, DOW };
