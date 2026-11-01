import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { startDragGhost } from './CategoryColumn';
import { colorHex } from '../utils/plannerStore';
import {
  loadMeds, saveMeds, loadMedLog, saveMedLog, loadMedSkips, saveMedSkips, MEDS_EVENT,
  dosesForDate, dayProgress, setDoseTaken, setDoseSkipped, todayStr, addDays, lastNDays, historyFor,
  groupByPeriod, loadMedOrder, saveMedOrder, moveInPeriod, foodLabel,
} from '../utils/medsStore';
import './MedsToday.css';

// The dashboard's medication panel: today's doses, the ones still owed at the
// top and the ones already taken below them.
//
// Taken doses used to disappear entirely. That made "nothing left" obvious but
// threw away the other half of the question — what HAVE I taken today — which
// is exactly what you want to check before taking something again. They stay,
// struck through, and clicking one puts it back; that also makes a mis-tap its
// own undo, so there is no separate undo banner to catch.
// Red means "that day was missed", so today cannot wear it: a dose at 23:00 is
// not missed at ten in the morning. Until the day is over an untouched today is
// simply pending.
const histTone = (h) => (h.isToday && h.status === 'none' ? 'pending' : h.status);

export default function MedsToday({ collapsed, onToggle, onOpenMeds }) {
  const [meds, setMeds] = useState(loadMeds);
  const [log, setLog] = useState(loadMedLog);
  const [skips, setSkips] = useState(loadMedSkips);
  const [order, setOrder] = useState(loadMedOrder);
  const [today, setToday] = useState(todayStr);
  // Which day the panel is showing. Today unless you step back through the
  // strip — the dashboard answers "what is left" first, but "did I take
  // yesterday's?" without leaving the page.
  const [viewDate, setViewDate] = useState(todayStr);

  useEffect(() => {
    const reload = () => { setMeds(loadMeds()); setLog(loadMedLog()); setSkips(loadMedSkips()); setOrder(loadMedOrder()); };
    window.addEventListener(MEDS_EVENT, reload);
    return () => window.removeEventListener(MEDS_EVENT, reload);
  }, []);

  // The dashboard is left open overnight; without this the panel would still be
  // showing yesterday's doses in the morning.
  useEffect(() => {
    const iv = setInterval(() => setToday(t => {
      const now = todayStr();
      if (t === now) return t;
      // Rolled over to a new day: follow it, unless you are deliberately
      // looking at an earlier one.
      setViewDate(v => (v === t ? now : v));
      return now;
    }), 60000);
    return () => clearInterval(iv);
  }, []);

  const commitLog = useCallback((next) => { setLog(next); saveMedLog(next); }, []);
  const commitSkips = useCallback((next) => { setSkips(next); saveMedSkips(next); }, []);

  const doses = useMemo(() => dosesForDate(meds, log, viewDate, skips), [meds, log, viewDate, skips]);
  const progress = useMemo(() => dayProgress(meds, log, viewDate, skips), [meds, log, viewDate, skips]);
  const history = useMemo(() => historyFor(meds, log, lastNDays(7, today), skips), [meds, log, today, skips]);
  const isPast = viewDate < today;
  const groups = useMemo(() => groupByPeriod(doses, order), [doses, order]);

  // Hold a row and drag it to reorder it within its part of the day. Nothing
  // moves until the mouse has travelled a few pixels, so a click is still a
  // click; the click that ends a drag is swallowed.
  const [drag, setDrag] = useState(null); // { group, from, over }
  const justDraggedRef = useRef(false);
  const onRowMouseDown = (e, g, index) => {
    if (e.button !== 0 || e.target.closest('.meds-actions, .meds-note-input')) return;
    const startX = e.clientX, startY = e.clientY;
    const li = e.currentTarget.closest('li');
    const list = li.parentElement;
    let started = false;
    let over = index;
    let ghost = null;
    const onMove = (me) => {
      if (!started) {
        if (Math.abs(me.clientX - startX) + Math.abs(me.clientY - startY) < 5) return;
        started = true;
        ghost = startDragGhost(li.querySelector('.meds-dose'), e);
        setDrag({ group: g.id, from: index, over: index });
      }
      ghost.move(me);
      // Where it would be inserted among the rows as they stand: before the
      // first row whose middle is below the pointer, or after the last.
      const rows = [...list.children];
      over = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (me.clientY < r.top + r.height / 2) { over = i; break; }
      }
      setDrag(d => (d && d.over !== over ? { ...d, over } : d));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!started) return;
      ghost.remove();
      setDrag(null);
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 0);
      // Inserting below itself shifts everything after it up by one.
      const to = over > index ? over - 1 : over;
      if (to !== index) {
        const next = moveInPeriod(order, g.id, g.doses.map(d => d.key), index, to);
        setOrder(next);
        saveMedOrder(next);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // The row: take it, or undo. A skipped dose comes back as owed first, so a
  // skip is never turned into "taken" by one stray click.
  const toggle = (d) => {
    if (justDraggedRef.current) return;
    if (d.skipped) { commitSkips(setDoseSkipped(skips, viewDate, d.medId, d.time, false)); return; }
    commitLog(setDoseTaken(log, viewDate, d.medId, d.time, !d.taken));
  };
  const skip = (d) => commitSkips(setDoseSkipped(skips, viewDate, d.medId, d.time, true));

  // What a medication is for, written right here. It belongs to the
  // medication, so every dose of it shows the same text.
  const [noteFor, setNoteFor] = useState(null); // { key, medId, text }
  const saveNote = () => {
    if (!noteFor) return;
    const text = noteFor.text.trim();
    const cur = meds.find(m => m.id === noteFor.medId);
    if (cur && (cur.notes || '').trim() !== text) {
      const next = meds.map(m => (m.id === noteFor.medId ? { ...m, notes: text } : m));
      setMeds(next);
      saveMeds(next);
    }
    setNoteFor(null);
  };

  // Always labelled, even on today. A chip that comes and goes would shift the
  // count beside it every time you step a day, which is exactly the twitch that
  // makes a strip of days unpleasant to scrub through.
  const dayLabel = viewDate === today ? 'Today'
    : viewDate === addDays(today, -1) ? 'Yesterday'
    : new Date(viewDate + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <div className={`meds-panel${collapsed ? ' collapsed' : ''}`}>
      <div className="meds-header">
        <button className="meds-collapse" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? '▸' : '▾'}
        </button>
        <span className="meds-title">MEDS</span>
        <button
          className="meds-day"
          onClick={() => setViewDate(today)}
          disabled={viewDate === today}
          title={viewDate === today ? 'Showing today' : 'Back to today'}
        >{dayLabel}</button>
        {progress.total > 0 && (
          <span className="meds-count">{progress.taken}/{progress.total}</span>
        )}
        <button className="meds-open" onClick={onOpenMeds} title="Manage medications">↗</button>
      </div>

      {!collapsed && (
        <div className="meds-body">
          {/* A week behind you, one square a day. Click one to see it. */}
          <div className="meds-history">
            {history.map(h => (
              <button
                key={h.date}
                className={`meds-hist meds-hist-${histTone(h)}${h.date === viewDate ? ' current' : ''}`}
                onClick={() => setViewDate(h.date)}
                title={h.total === 0 ? `${h.date} — nothing due` : `${h.date} — ${h.taken}/${h.total} taken`}
              />
            ))}
          </div>

          {progress.total === 0 ? (
            <div className="meds-empty">Nothing due {viewDate === today ? 'today' : 'that day'}.</div>
          ) : (
            /* Strictly in time order, and it stays that way when you tick one.
               Floating taken doses to the bottom meant the row you just
               clicked jumped out from under the cursor, which both startles
               and makes a mis-tap hard to undo. */
            groups.map(g => (
            <div key={g.id} className="meds-group">
            <div className="meds-group-head" lang="en">
              <span>{g.label}</span>
              <span className="meds-group-count">
                {g.doses.filter(d => d.taken).length}/{g.doses.filter(d => !d.skipped).length}
              </span>
            </div>
            <ul className="meds-list">
              {g.doses.map((d, i) => (
                <li
                  key={d.key}
                  className={`meds-item${drag?.group === g.id && drag.from === i ? ' dragging' : ''}${
                    drag?.group === g.id && drag.over !== drag.from && drag.over !== drag.from + 1
                      ? (drag.over === i ? ' drop-before' : drag.over === g.doses.length && i === g.doses.length - 1 ? ' drop-after' : '')
                      : ''}`}
                >
                  <button
                    onMouseDown={(e) => onRowMouseDown(e, g, i)}
                    className={`meds-dose${d.taken ? ' taken' : ''}${d.skipped ? ' skipped' : ''}${!d.taken && !d.skipped && isPast ? ' missed' : ''}`}
                    style={{ '--med-color': colorHex(d.color) }}
                    onClick={() => toggle(d)}
                    title={d.taken ? 'Taken — click to undo'
                      : d.skipped ? 'Skipped — click to undo'
                      : 'Mark as taken'}
                  >
                    <span className="meds-check">{d.taken ? '✓' : d.skipped ? '–' : (isPast ? '!' : '')}</span>
                    <span className="meds-time">{d.time}</span>
                    <span className="meds-main">
                      <span className="meds-name">{d.name}</span>
                      {d.notes && <span className="meds-notes" title={d.notes}>{d.notes}</span>}
                    </span>
                    {foodLabel(d.food) && <span className={`meds-food meds-food-${d.food}`}>{foodLabel(d.food)}</span>}
                    {d.dose && <span className="meds-amount">{d.dose}</span>}
                    {d.skipped && <span className="meds-skip-tag">Skipped</span>}
                  </button>
                  {noteFor?.key !== d.key && (
                    <span className="meds-actions">
                      <button
                        className="meds-act"
                        onClick={() => setNoteFor({ key: d.key, medId: d.medId, text: d.notes })}
                        title={d.notes ? 'Edit what this is for' : 'Write what this is for'}
                      >{d.notes ? 'Edit note' : 'Add note'}</button>
                      {!d.taken && !d.skipped && (
                        <button className="meds-act" onClick={() => skip(d)} title="Skip this dose — it no longer counts as owed">
                          Skip
                        </button>
                      )}
                    </span>
                  )}
                  {noteFor?.key === d.key && (
                    <input
                      className="meds-note-input"
                      autoFocus
                      placeholder="What it's for, e.g. blood pressure"
                      value={noteFor.text}
                      onChange={(e) => setNoteFor(n => ({ ...n, text: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveNote();
                        if (e.key === 'Escape') setNoteFor(null);
                      }}
                      onBlur={saveNote}
                    />
                  )}
                </li>
              ))}
            </ul>
            </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
