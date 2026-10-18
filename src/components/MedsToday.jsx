import { useCallback, useEffect, useMemo, useState } from 'react';
import { colorHex } from '../utils/plannerStore';
import {
  loadMeds, loadMedLog, saveMedLog, MEDS_EVENT,
  dosesForDate, dayProgress, toggleDose, todayStr, addDays, lastNDays, historyFor,
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
  const [today, setToday] = useState(todayStr);
  // Which day the panel is showing. Today unless you step back through the
  // strip — the dashboard answers "what is left" first, but "did I take
  // yesterday's?" without leaving the page.
  const [viewDate, setViewDate] = useState(todayStr);

  useEffect(() => {
    const reload = () => { setMeds(loadMeds()); setLog(loadMedLog()); };
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

  const doses = useMemo(() => dosesForDate(meds, log, viewDate), [meds, log, viewDate]);
  const progress = useMemo(() => dayProgress(meds, log, viewDate), [meds, log, viewDate]);
  const history = useMemo(() => historyFor(meds, log, lastNDays(7, today)), [meds, log, today]);
  const isPast = viewDate < today;

  const toggle = (d) => commitLog(toggleDose(log, viewDate, d.medId, d.time));

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
            <ul className="meds-list">
              {doses.map(d => (
                <li key={d.key}>
                  <button
                    className={`meds-dose${d.taken ? ' taken' : ''}${!d.taken && isPast ? ' missed' : ''}`}
                    style={{ '--med-color': colorHex(d.color) }}
                    onClick={() => toggle(d)}
                    title={d.taken ? 'Taken — click to undo' : 'Mark as taken'}
                  >
                    <span className="meds-check">{d.taken ? '✓' : (isPast ? '!' : '')}</span>
                    <span className="meds-time">{d.time}</span>
                    <span className="meds-name">{d.name}</span>
                    {d.dose && <span className="meds-amount">{d.dose}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
