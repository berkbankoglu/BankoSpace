import { useEffect, useRef, useState } from 'react';
import { COLORS, timeToMinutes, minutesToTime } from '../utils/plannerStore';
import { describeRule } from '../utils/recurrence';
import { addDaysStr } from '../utils/calendarModel';

// The event inspector, the repeat sheet, and the "which occurrences?" question.
//
// Apple opens this as a popover anchored to the event rather than a modal over
// the whole window, because the point of editing an event is to see it in
// context — which day it sits on, what it collides with. Same here: the panel is
// positioned next to what was clicked and closes on Escape or an outside click.

const ALERT_OPTIONS = [
  { minutes: null, label: 'None' },
  { minutes: 0, label: 'At time of event' },
  { minutes: 5, label: '5 minutes before' },
  { minutes: 10, label: '10 minutes before' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 1440, label: '1 day before' },
  { minutes: 2880, label: '2 days before' },
  { minutes: 10080, label: '1 week before' },
];

const DAY_CODES = [
  { code: 'SU', label: 'S' }, { code: 'MO', label: 'M' }, { code: 'TU', label: 'T' },
  { code: 'WE', label: 'W' }, { code: 'TH', label: 'T' }, { code: 'FR', label: 'F' },
  { code: 'SA', label: 'S' },
];

// The presets Apple's Repeat menu offers, plus Custom. Each is a complete rule,
// so picking one never leaves a half-built object behind.
function presetsFor(dateStr) {
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  const code = ['SU','MO','TU','WE','TH','FR','SA'][d.getDay()];
  return [
    { id: 'none',    label: 'Never',          rule: null },
    { id: 'daily',   label: 'Every Day',      rule: { freq: 'DAILY', interval: 1 } },
    { id: 'weekday', label: 'Every Weekday',  rule: { freq: 'WEEKLY', interval: 1, byDay: ['MO','TU','WE','TH','FR'] } },
    { id: 'weekly',  label: 'Every Week',     rule: { freq: 'WEEKLY', interval: 1, byDay: [code] } },
    { id: 'biweekly',label: 'Every 2 Weeks',  rule: { freq: 'WEEKLY', interval: 2, byDay: [code] } },
    { id: 'monthly', label: 'Every Month',    rule: { freq: 'MONTHLY', interval: 1, byMonthDay: [d.getDate()] } },
    { id: 'yearly',  label: 'Every Year',     rule: { freq: 'YEARLY', interval: 1 } },
  ];
}

// Which preset, if any, a rule is. Compared by value so a rule loaded from
// storage still shows its own name instead of falling through to "Custom".
function presetIdFor(rule, dateStr) {
  if (!rule) return 'none';
  const match = presetsFor(dateStr).find(p => p.rule && JSON.stringify(normalize(p.rule)) === JSON.stringify(normalize(rule)));
  return match ? match.id : 'custom';
}

function normalize(rule) {
  if (!rule) return null;
  return {
    freq: rule.freq, interval: rule.interval || 1,
    byDay: rule.byDay || null, byMonthDay: rule.byMonthDay || null,
    bySetPos: rule.bySetPos ?? null, byMonth: rule.byMonth || null,
    until: rule.until || null, count: rule.count || null,
  };
}

// ── Repeat sheet ─────────────────────────────────────────────────────────────

function RepeatSheet({ rule, dateStr, onChange }) {
  const r = rule || { freq: 'WEEKLY', interval: 1 };
  const set = (patch) => onChange({ ...r, ...patch });
  const monthlyMode = r.bySetPos != null ? 'setpos' : 'monthday';
  const endMode = r.count ? 'count' : r.until ? 'until' : 'never';

  return (
    <div className="cal-repeat-sheet">
      <div className="cal-field-row">
        <label>Frequency</label>
        <select
          className="cal-select"
          value={r.freq}
          onChange={(e) => {
            const freq = e.target.value;
            // Switching frequency drops the fields that don't apply, or the rule
            // would carry a byMonthDay into a weekly repeat and never match.
            const base = { freq, interval: r.interval || 1, until: r.until || null, count: r.count || null };
            if (freq === 'WEEKLY') base.byDay = r.byDay || [['SU','MO','TU','WE','TH','FR','SA'][new Date(dateStr + 'T00:00:00').getDay()]];
            if (freq === 'MONTHLY') base.byMonthDay = [new Date(dateStr + 'T00:00:00').getDate()];
            onChange(base);
          }}
        >
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY">Monthly</option>
          <option value="YEARLY">Yearly</option>
        </select>
      </div>

      <div className="cal-field-row">
        <label>Every</label>
        <div className="cal-inline">
          <input
            className="cal-input cal-input-num"
            type="number" min="1" max="999"
            value={r.interval || 1}
            onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
          />
          <span className="cal-unit">
            {r.freq === 'DAILY' ? 'days' : r.freq === 'WEEKLY' ? 'weeks' : r.freq === 'MONTHLY' ? 'months' : 'years'}
          </span>
        </div>
      </div>

      {r.freq === 'WEEKLY' && (
        <div className="cal-field-row">
          <label>On</label>
          <div className="cal-daypick">
            {DAY_CODES.map(({ code, label }, i) => (
              <button
                key={code}
                type="button"
                className={`cal-daypick-btn${(r.byDay || []).includes(code) ? ' active' : ''}`}
                onClick={() => {
                  const cur = new Set(r.byDay || []);
                  if (cur.has(code)) cur.delete(code); else cur.add(code);
                  // An empty weekday set would repeat on nothing; keep at least one.
                  set({ byDay: cur.size ? DAY_CODES.filter(d => cur.has(d.code)).map(d => d.code) : r.byDay });
                }}
              >{label}</button>
            ))}
          </div>
        </div>
      )}

      {(r.freq === 'MONTHLY' || r.freq === 'YEARLY') && (
        <div className="cal-field-row">
          <label>On</label>
          <div className="cal-stack">
            <select
              className="cal-select"
              value={monthlyMode}
              onChange={(e) => {
                if (e.target.value === 'setpos') {
                  const d = new Date(dateStr + 'T00:00:00');
                  set({ bySetPos: Math.ceil(d.getDate() / 7), byDay: [['SU','MO','TU','WE','TH','FR','SA'][d.getDay()]], byMonthDay: null });
                } else {
                  set({ bySetPos: null, byDay: null, byMonthDay: [new Date(dateStr + 'T00:00:00').getDate()] });
                }
              }}
            >
              <option value="monthday">a day of the month</option>
              <option value="setpos">a weekday of the month</option>
            </select>
            {monthlyMode === 'monthday' ? (
              <select
                className="cal-select"
                value={(r.byMonthDay || [1])[0]}
                onChange={(e) => set({ byMonthDay: [Number(e.target.value)] })}
              >
                {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                <option value={-1}>last day</option>
              </select>
            ) : (
              <div className="cal-inline">
                <select className="cal-select" value={r.bySetPos ?? 1} onChange={(e) => set({ bySetPos: Number(e.target.value) })}>
                  <option value={1}>first</option>
                  <option value={2}>second</option>
                  <option value={3}>third</option>
                  <option value={4}>fourth</option>
                  <option value={-1}>last</option>
                </select>
                <select className="cal-select" value={(r.byDay || ['MO'])[0]} onChange={(e) => set({ byDay: [e.target.value] })}>
                  {['SU','MO','TU','WE','TH','FR','SA'].map(c => (
                    <option key={c} value={c}>{{ SU:'Sunday',MO:'Monday',TU:'Tuesday',WE:'Wednesday',TH:'Thursday',FR:'Friday',SA:'Saturday' }[c]}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="cal-field-row">
        <label>End</label>
        <div className="cal-stack">
          <select
            className="cal-select"
            value={endMode}
            onChange={(e) => {
              if (e.target.value === 'never') set({ until: null, count: null });
              else if (e.target.value === 'count') set({ count: 10, until: null });
              else set({ until: addDaysStr(dateStr, 365), count: null });
            }}
          >
            <option value="never">Never</option>
            <option value="count">After a number of times</option>
            <option value="until">On a date</option>
          </select>
          {endMode === 'count' && (
            <div className="cal-inline">
              <input className="cal-input cal-input-num" type="number" min="1" value={r.count || 1}
                onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })} />
              <span className="cal-unit">times</span>
            </div>
          )}
          {endMode === 'until' && (
            <input className="cal-input" type="date" value={r.until || ''} onChange={(e) => set({ until: e.target.value || null })} />
          )}
        </div>
      </div>

      <div className="cal-repeat-summary">{describeRule(r)}</div>
    </div>
  );
}

// ── Scope question ───────────────────────────────────────────────────────────

// Editing one of hundreds of generated occurrences is ambiguous, so the
// ambiguity is put to the user instead of guessed — the same three answers
// Apple gives, with the destructive one styled as such.
export function ScopeDialog({ action, title, onPick, onCancel }) {
  return (
    <div className="cal-scope-backdrop" onClick={onCancel}>
      <div className="cal-scope" onClick={(e) => e.stopPropagation()}>
        <div className="cal-scope-title">
          {action === 'delete' ? 'Delete repeating event' : 'Change repeating event'}
        </div>
        <div className="cal-scope-sub">
          “{title || '(No title)'}” repeats. {action === 'delete' ? 'Which occurrences should be deleted?' : 'Which occurrences should change?'}
        </div>
        <div className="cal-scope-actions">
          <button className="cal-scope-btn" onClick={() => onPick('this')}>Only this event</button>
          <button className="cal-scope-btn" onClick={() => onPick('future')}>This and all future events</button>
          <button className={`cal-scope-btn${action === 'delete' ? ' danger' : ''}`} onClick={() => onPick('all')}>All events in the series</button>
          <button className="cal-scope-cancel" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Inspector ────────────────────────────────────────────────────────────────

export default function EventEditor({ draft, calendars, anchor, isNew, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(draft);
  const [showRepeat, setShowRepeat] = useState(false);
  const panelRef = useRef(null);
  const titleRef = useRef(null);

  useEffect(() => { setForm(draft); setShowRepeat(false); }, [draft]);
  useEffect(() => { titleRef.current?.focus(); }, []);

  // Escape closes; a click outside saves nothing and closes, which is what a
  // popover does — the explicit Done button is the commit.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(form); }
    };
    const onDown = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) onClose(); };
    window.addEventListener('keydown', onKey, true);
    // Deferred, or the click that opened the popover closes it again.
    const t = setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    return () => { window.removeEventListener('keydown', onKey, true); clearTimeout(t); window.removeEventListener('mousedown', onDown); };
  }, [form, onClose, onSave]);

  const set = (patch) => setForm(f => ({ ...f, ...patch }));
  const presetId = presetIdFor(form.rrule, form.date);
  const cal = calendars.find(c => c.id === form.calendarId) || calendars[0];

  // Keeping the end after the start is the editor's job: the model clamps on
  // read, but a field the user is typing into should correct itself as they go.
  const setStart = (startTime) => {
    const dur = Math.max(15, timeToMinutes(form.endTime) - timeToMinutes(form.startTime));
    const s = timeToMinutes(startTime);
    set({ startTime, endTime: form.endDate > form.date ? form.endTime : minutesToTime(Math.min(24 * 60 - 1, s + dur)) });
  };

  const style = anchor
    ? { top: Math.min(anchor.top, window.innerHeight - 560), left: Math.min(anchor.left, window.innerWidth - 400) }
    : undefined;

  return (
    <div className={`cal-inspector${anchor ? ' anchored' : ''}`} style={style} ref={panelRef}>
      <div className="cal-inspector-head">
        <input
          ref={titleRef}
          className="cal-input cal-title-input"
          placeholder="New Event"
          value={form.title || ''}
          onChange={(e) => set({ title: e.target.value })}
        />
        <button className="cal-icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <input
        className="cal-input cal-loc-input"
        placeholder="Add Location"
        value={form.location || ''}
        onChange={(e) => set({ location: e.target.value })}
      />

      <div className="cal-field-row">
        <label>All-day</label>
        <input
          className="cal-check"
          type="checkbox"
          checked={!!form.allDay}
          onChange={(e) => set({ allDay: e.target.checked })}
        />
      </div>

      <div className="cal-field-row">
        <label>Starts</label>
        <div className="cal-inline">
          <input className="cal-input" type="date" value={form.date || ''}
            onChange={(e) => {
              const date = e.target.value;
              // Dragging the start past the end would invert the event; carry the
              // end along by the same number of days instead.
              const span = Math.max(0, Math.round((new Date(form.endDate + 'T00:00:00') - new Date(form.date + 'T00:00:00')) / 86400000));
              set({ date, endDate: addDaysStr(date, span) });
            }} />
          {/* An all-day event has no times, but hiding the fields made the whole
              sheet jump every time the switch was flipped — and left you
              guessing what the switch had actually done. They stay put and go
              grey instead. */}
          <input
            className="cal-input cal-input-time"
            type="time"
            value={form.startTime || '09:00'}
            disabled={!!form.allDay}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
      </div>

      <div className="cal-field-row">
        <label>Ends</label>
        <div className="cal-inline">
          <input className="cal-input" type="date" value={form.endDate || form.date || ''}
            min={form.date}
            onChange={(e) => set({ endDate: e.target.value < form.date ? form.date : e.target.value })} />
          <input
            className="cal-input cal-input-time"
            type="time"
            value={form.endTime || '10:00'}
            disabled={!!form.allDay}
            onChange={(e) => set({ endTime: e.target.value })}
          />
        </div>
      </div>

      <div className="cal-field-row">
        <label>Repeat</label>
        <select
          className="cal-select"
          value={presetId}
          onChange={(e) => {
            if (e.target.value === 'custom') {
              setShowRepeat(true);
              if (!form.rrule) set({ rrule: { freq: 'WEEKLY', interval: 1, byDay: [['SU','MO','TU','WE','TH','FR','SA'][new Date(form.date + 'T00:00:00').getDay()]] } });
              return;
            }
            setShowRepeat(false);
            set({ rrule: presetsFor(form.date).find(p => p.id === e.target.value)?.rule || null });
          }}
        >
          {presetsFor(form.date).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          <option value="custom">Custom…</option>
        </select>
      </div>

      {(showRepeat || presetId === 'custom') && form.rrule && (
        <RepeatSheet rule={form.rrule} dateStr={form.date} onChange={(rrule) => set({ rrule })} />
      )}

      <div className="cal-field-row">
        <label>Alert</label>
        <select
          className="cal-select"
          value={form.alerts?.[0]?.minutesBefore ?? ''}
          onChange={(e) => set({ alerts: e.target.value === '' ? [] : [{ minutesBefore: Number(e.target.value) }] })}
        >
          {ALERT_OPTIONS.map(o => (
            <option key={String(o.minutes)} value={o.minutes === null ? '' : o.minutes}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* A second alert, the way Apple reveals one only once the first is set. */}
      {form.alerts?.length > 0 && (
        <div className="cal-field-row">
          <label>Second alert</label>
          <select
            className="cal-select"
            value={form.alerts?.[1]?.minutesBefore ?? ''}
            onChange={(e) => set({
              alerts: e.target.value === ''
                ? form.alerts.slice(0, 1)
                : [form.alerts[0], { minutesBefore: Number(e.target.value) }],
            })}
          >
            {ALERT_OPTIONS.map(o => (
              <option key={String(o.minutes)} value={o.minutes === null ? '' : o.minutes}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="cal-field-row">
        <label>Calendar</label>
        <select
          className="cal-select"
          value={form.calendarId || 'personal'}
          onChange={(e) => {
            const next = calendars.find(c => c.id === e.target.value);
            // Moving an event to another calendar adopts that calendar's colour
            // unless the event was given one of its own.
            set({ calendarId: e.target.value, color: form.colorPinned ? form.color : (next?.color || form.color) });
          }}
        >
          {calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="cal-field-row">
        <label>Color</label>
        <div className="cal-swatches">
          {COLORS.map(c => (
            <button
              key={c.id}
              type="button"
              className={`cal-swatch${form.color === c.id ? ' active' : ''}`}
              style={{ background: c.hex }}
              onClick={() => set({ color: c.id, colorPinned: true })}
              aria-label={c.id}
            />
          ))}
          {form.colorPinned && (
            <button className="cal-link-btn" onClick={() => set({ color: cal?.color || 'blue', colorPinned: false })}>
              use calendar colour
            </button>
          )}
        </div>
      </div>

      <textarea
        className="cal-input cal-notes"
        placeholder="Add Notes"
        rows={3}
        value={form.notes || ''}
        onChange={(e) => set({ notes: e.target.value })}
      />

      <div className="cal-inspector-foot">
        {!isNew && <button className="cal-danger-btn" onClick={() => onDelete(form)}>Delete</button>}
        <div className="cal-foot-right">
          <button className="cal-ghost-btn" onClick={onClose}>Cancel</button>
          <button className="cal-primary-btn" onClick={() => onSave(form)}>{isNew ? 'Add' : 'Done'}</button>
        </div>
      </div>
    </div>
  );
}

export { ALERT_OPTIONS };
