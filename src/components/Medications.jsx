import { useCallback, useEffect, useMemo, useState } from 'react';
import { COLORS, colorHex } from '../utils/plannerStore';
import {
  loadMeds, saveMeds, loadMedLog, saveMedLog, MEDS_EVENT, TIME_PRESETS,
  dosesForDate, dayProgress, toggleDose, describeSchedule, courseRemaining,
  timesOf, todayStr, addDays, lastNDays, historyFor, adherence,
} from '../utils/medsStore';
import './Medications.css';

// The medication manager, inside Habits.
//
// It is deliberately not built on the habit grid. A habit is one tick a day and
// the question is the streak; a medication is "the 21:00 one, on Monday,
// Wednesday and Friday, for another nine days" — the unit is a dose, not a day,
// and missing one matters in a way that breaking a streak does not.
//
// Today's doses sit at the top because that is the question you open this page
// with. The list of medications underneath is the thing you set up once.

const DAY_CODES = [
  { code: 'MO', label: 'M' }, { code: 'TU', label: 'T' }, { code: 'WE', label: 'W' },
  { code: 'TH', label: 'T' }, { code: 'FR', label: 'F' }, { code: 'SA', label: 'S' },
  { code: 'SU', label: 'S' },
];

// Red means "that day was missed", so today cannot wear it: a dose due at 23:00
// is not missed at ten in the morning. Until the day is out, an untouched today
// is simply pending.
const histTone = (h) => (h.isToday && h.status === 'none' ? 'pending' : h.status);

const blankMed = (colorIdx = 0) => ({
  id: Date.now() + Math.floor(Math.random() * 1000),
  name: '',
  dose: '',
  color: COLORS[colorIdx % COLORS.length].id,
  times: ['08:00'],
  startDate: todayStr(),
  endDate: '',
  rrule: null,
  notes: '',
});

export default function Medications() {
  const [meds, setMeds] = useState(loadMeds);
  const [log, setLog] = useState(loadMedLog);
  const [editing, setEditing] = useState(null);   // the med being added/edited
  const [isNew, setIsNew] = useState(false);
  const today = todayStr();
  // Which day is on screen. "Did I take yesterday's?" is as much a question as
  // "what is left today", and it is the one this page could not answer.
  const [viewDate, setViewDate] = useState(today);

  // Taking a dose from the dashboard has to show up here and the other way
  // round, so both read the same store and listen for its change event.
  useEffect(() => {
    const reload = () => { setMeds(loadMeds()); setLog(loadMedLog()); };
    window.addEventListener(MEDS_EVENT, reload);
    return () => window.removeEventListener(MEDS_EVENT, reload);
  }, []);

  const commitMeds = useCallback((next) => { setMeds(next); saveMeds(next); }, []);
  const commitLog = useCallback((next) => { setLog(next); saveMedLog(next); }, []);

  const doses = useMemo(() => dosesForDate(meds, log, viewDate), [meds, log, viewDate]);
  const progress = useMemo(() => dayProgress(meds, log, viewDate), [meds, log, viewDate]);
  const history = useMemo(() => historyFor(meds, log, lastNDays(14, today)), [meds, log, today]);
  const stats = useMemo(() => adherence(meds, log, 14, today), [meds, log, today]);
  const isPast = viewDate < today;

  // Marking works on past days too: forgetting to tick something is not the
  // same as not having taken it, and the record is only useful if it can be
  // corrected.
  const take = (d) => commitLog(toggleDose(log, viewDate, d.medId, d.time));

  const dayLabel = (() => {
    if (viewDate === today) return 'Today';
    if (viewDate === addDays(today, -1)) return 'Yesterday';
    const d = new Date(viewDate + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  })();

  const openAdd = () => { setEditing(blankMed(meds.length)); setIsNew(true); };
  const openEdit = (med) => { setEditing({ ...med, endDate: med.endDate || '' }); setIsNew(false); };

  const save = () => {
    const name = (editing.name || '').trim();
    if (!name) return;
    const clean = {
      ...editing,
      name,
      dose: (editing.dose || '').trim(),
      times: timesOf(editing),
      endDate: editing.endDate || null,
    };
    commitMeds(isNew ? [...meds, clean] : meds.map(m => (m.id === clean.id ? clean : m)));
    setEditing(null);
  };

  const remove = () => {
    if (!window.confirm(`Delete “${editing.name}”? Its record of what you took stays.`)) return;
    commitMeds(meds.filter(m => m.id !== editing.id));
    setEditing(null);
  };

  // ── the editor's schedule controls ─────────────────────────────────────────

  const rule = editing?.rrule;
  // "Every other day" is its own entry rather than hiding behind "every N
  // days": taking something one day and skipping the next is a normal thing a
  // prescription says, and nobody goes looking for it under an N.
  const ruleInterval = rule?.interval || 1;
  const mode = !rule ? 'daily'
    : rule.freq === 'WEEKLY' ? 'weekly'
    : ruleInterval === 2 ? 'alternate'
    : ruleInterval > 1 ? 'interval'
    : 'daily';
  const setRule = (r) => setEditing(e => ({ ...e, rrule: r }));

  const setTime = (i, value) => setEditing(e => {
    const times = [...timesOf(e)];
    times[i] = value;
    return { ...e, times };
  });
  const addTime = () => setEditing(e => {
    const times = timesOf(e);
    const next = TIME_PRESETS.find(p => !times.includes(p.time))?.time || '12:00';
    return { ...e, times: [...times, next] };
  });
  const removeTime = (i) => setEditing(e => {
    const times = timesOf(e).filter((_, idx) => idx !== i);
    return { ...e, times: times.length ? times : ['08:00'] };
  });

  return (
    <div className="med-root">
      <div className="med-header">
        <div className="med-title">Medications</div>
        <button className="med-add-btn" onClick={openAdd}>+ Add medication</button>
      </div>

      {/* The day in view, today by default — the question the page is opened
          with — but steppable backwards to check what was taken when. */}
      <section className="med-today">
        <div className="med-section-head">
          <div className="med-day-nav">
            <button className="med-day-arrow" onClick={() => setViewDate(d => addDays(d, -1))} title="Previous day">‹</button>
            <span className="med-day-label">{dayLabel}</span>
            <button
              className="med-day-arrow"
              onClick={() => setViewDate(d => (d < today ? addDays(d, 1) : d))}
              disabled={viewDate >= today}
              title="Next day"
            >›</button>
            {/* Keeps its slot on today so stepping a day does not re-flow the
                row around it. */}
            <button
              className={`med-day-today${viewDate === today ? ' idle' : ''}`}
              onClick={() => setViewDate(today)}
              tabIndex={viewDate === today ? -1 : 0}
              aria-hidden={viewDate === today}
            >Today</button>
          </div>
          {progress.total > 0 && (
            <span className="med-progress">{progress.taken}/{progress.total} taken</span>
          )}
        </div>

        {/* Fourteen days at a glance. A day with nothing due is left blank
            rather than green — counting it as a success would quietly inflate
            how well a course is going. */}
        <div className="med-history">
          {history.map(h => (
            <button
              key={h.date}
              className={`med-hist-day med-hist-${histTone(h)}${h.date === viewDate ? ' current' : ''}`}
              onClick={() => setViewDate(h.date)}
              title={h.total === 0
                ? `${h.date} — nothing due`
                : `${h.date} — ${h.taken}/${h.total} taken`}
            >
              <span className="med-hist-num">{Number(h.date.slice(8))}</span>
            </button>
          ))}
          {stats.pct !== null && (
            <span className="med-adherence">{stats.pct}% over {stats.days} days</span>
          )}
        </div>

        {doses.length === 0 ? (
          <div className="med-empty">Nothing due {viewDate === today ? 'today' : 'that day'}.</div>
        ) : (
          <ul className="med-dose-list">
            {doses.map(d => (
              <li key={d.key}>
                <button
                  className={`med-dose${d.taken ? ' taken' : ''}${!d.taken && isPast ? ' missed' : ''}`}
                  style={{ '--med-color': colorHex(d.color) }}
                  onClick={() => take(d)}
                  title={d.taken
                    ? 'Taken — click to undo'
                    : isPast ? 'Missed — click if you did take it' : 'Mark as taken'}
                >
                  <span className="med-dose-check">{d.taken ? '✓' : (isPast ? '!' : '')}</span>
                  <span className="med-dose-time">{d.time}</span>
                  <span className="med-dose-name">{d.name}</span>
                  {d.dose && <span className="med-dose-amount">{d.dose}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="med-list-section">
        <div className="med-section-head"><span>All medications</span></div>
        {meds.length === 0 ? (
          <div className="med-empty">
            No medications yet. Add one and it will show up here and on the dashboard on the days you take it.
          </div>
        ) : (
          <ul className="med-list">
            {meds.map(m => {
              const left = courseRemaining(m, today);
              return (
                <li key={m.id} className="med-row" style={{ '--med-color': colorHex(m.color) }}>
                  <button className="med-row-main" onClick={() => openEdit(m)}>
                    <span className="med-row-title">
                      {m.name}
                      {m.dose && <span className="med-row-dose">{m.dose}</span>}
                    </span>
                    <span className="med-row-sched">{describeSchedule(m)}</span>
                  </button>
                  <span className="med-row-times">
                    {timesOf(m).map(t => <span key={t} className="med-time-chip">{t}</span>)}
                  </span>
                  {left !== null && (
                    <span className={`med-row-left${left === 0 ? ' done' : ''}`}>
                      {left === 0 ? 'course finished' : `${left} doses left`}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editing && (
        <div className="med-modal-backdrop" onClick={() => setEditing(null)}>
          <div className="med-modal" onClick={e => e.stopPropagation()}>
            <div className="med-modal-title">{isNew ? 'New medication' : 'Edit medication'}</div>

            <div className="med-field">
              <label>Name</label>
              <input
                className="med-input" autoFocus
                placeholder="e.g. Augmentin"
                value={editing.name}
                onChange={e => setEditing(x => ({ ...x, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(null); }}
              />
            </div>

            <div className="med-field">
              <label>Dose</label>
              <input
                className="med-input"
                placeholder="e.g. 1000mg, 1 tablet"
                value={editing.dose}
                onChange={e => setEditing(x => ({ ...x, dose: e.target.value }))}
              />
            </div>

            <div className="med-field">
              <label>When</label>
              <div className="med-times">
                {timesOf(editing).map((t, i) => (
                  <span className="med-time-row" key={i}>
                    <input className="med-input med-time-input" type="time" value={t} onChange={e => setTime(i, e.target.value)} />
                    {timesOf(editing).length > 1 && (
                      <button className="med-time-del" onClick={() => removeTime(i)} title="Remove this dose">✕</button>
                    )}
                  </span>
                ))}
                <button className="med-time-add" onClick={addTime}>+ another dose</button>
              </div>
            </div>

            <div className="med-field">
              <label>Days</label>
              <div className="med-stack">
                <select
                  className="med-input"
                  value={mode}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === 'daily') setRule(null);
                    else if (v === 'alternate') setRule({ freq: 'DAILY', interval: 2 });
                    else if (v === 'interval') setRule({ freq: 'DAILY', interval: 3 });
                    else setRule({ freq: 'WEEKLY', interval: 1, byDay: ['MO', 'WE', 'FR'] });
                  }}
                >
                  <option value="daily">Every day</option>
                  <option value="alternate">Every other day (one on, one off)</option>
                  <option value="interval">Every N days</option>
                  <option value="weekly">Certain weekdays</option>
                </select>

                {mode === 'interval' && (
                  <div className="med-inline">
                    <span>Every</span>
                    <input
                      className="med-input med-num" type="number" min="3" max="60"
                      value={ruleInterval}
                      onChange={e => setRule({ freq: 'DAILY', interval: Math.max(2, Number(e.target.value) || 3) })}
                    />
                    <span>days</span>
                  </div>
                )}

                {mode === 'weekly' && (
                  <div className="med-daypick">
                    {DAY_CODES.map(({ code, label }) => {
                      const on = (rule?.byDay || []).includes(code);
                      return (
                        <button
                          key={code}
                          className={`med-day${on ? ' active' : ''}`}
                          onClick={() => {
                            const cur = new Set(rule?.byDay || []);
                            if (cur.has(code)) cur.delete(code); else cur.add(code);
                            // A weekly rule with no days would never come due.
                            if (!cur.size) return;
                            setRule({ freq: 'WEEKLY', interval: rule?.interval || 1, byDay: DAY_CODES.filter(d => cur.has(d.code)).map(d => d.code) });
                          }}
                        >{label}</button>
                      );
                    })}
                  </div>
                )}
                {/* Whatever combination is chosen, this says what it means in
                    the same words the list will use. */}
                <div className="med-sched-preview">{describeSchedule(editing)}</div>
              </div>
            </div>

            <div className="med-field">
              <label>Starts</label>
              <input
                className="med-input" type="date"
                value={editing.startDate || today}
                onChange={e => setEditing(x => ({ ...x, startDate: e.target.value }))}
              />
            </div>

            <div className="med-field">
              <label>Ends</label>
              <div className="med-inline">
                <input
                  className="med-input" type="date"
                  value={editing.endDate || ''}
                  min={editing.startDate || today}
                  onChange={e => setEditing(x => ({ ...x, endDate: e.target.value }))}
                />
                {editing.endDate && (
                  <button className="med-clear" onClick={() => setEditing(x => ({ ...x, endDate: '' }))}>clear</button>
                )}
              </div>
            </div>
            <div className="med-hint">Leave the end date empty for something you take indefinitely.</div>

            <div className="med-field">
              <label>Colour</label>
              <div className="med-swatches">
                {COLORS.map(c => (
                  <button
                    key={c.id}
                    className={`med-swatch${editing.color === c.id ? ' active' : ''}`}
                    style={{ background: c.hex }}
                    onClick={() => setEditing(x => ({ ...x, color: c.id }))}
                    aria-label={c.id}
                  />
                ))}
              </div>
            </div>

            <div className="med-modal-foot">
              {!isNew && <button className="med-danger" onClick={remove}>Delete</button>}
              <div className="med-foot-right">
                <button className="med-cancel" onClick={() => setEditing(null)}>Cancel</button>
                <button className="med-save" onClick={save} disabled={!editing.name.trim()}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
