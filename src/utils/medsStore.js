import { pushKeyToSupabase } from '../supabase';
import { ruleCoversDate } from './recurrence';

// Medications: what you take, on which days, at which times, and whether you
// have taken today's doses yet.
//
// A medication is not a habit. A habit is one tick a day and the point is the
// streak; a course of antibiotics is three doses a day for seven days and the
// point is that you took the 14:00 one. So this keeps its own store, with a
// dose as the unit rather than a day — but it reuses the calendar's recurrence
// engine for "which days", because "every other day" and "Mon/Wed/Fri" are the
// same question the calendar already answers, and two implementations of that
// would eventually disagree.
//
//   { id, name, dose, color, times: ['09:00','21:00'],
//     startDate: '2026-10-12', rrule: {…} | null, endDate: null, notes }
//
// notes is free text — usually what the medication is for — shown under its
// name wherever a dose is listed. food is 'empty' (on an empty stomach),
// 'full' (with food) or 'any'/missing (either).
//
// rrule null means every day. endDate closes a course: after it the medication
// stops appearing without having to be deleted, so the record of having taken
// it stays.

export const MEDS_KEY = 'meds_v1';
export const MEDS_LOG_KEY = 'meds_log_v1';
// Doses deliberately not taken, same shape as the log. Its own key so a device
// still on an older version reads the log exactly as before.
export const MEDS_SKIP_KEY = 'meds_skip_v1';
// The order you dragged the doses into, per part of the day:
// { morning: ['medId@08:00', …], … }. Doses not in it follow, by time.
export const MEDS_ORDER_KEY = 'meds_order_v1';

export const FOOD = [
  { id: 'empty', label: 'Empty stomach' },
  { id: 'full', label: 'With food' },
  { id: 'any', label: 'Either' },
];
export const foodLabel = (food) => (food === 'empty' || food === 'full' ? FOOD.find(f => f.id === food).label : '');
export const MEDS_EVENT = 'meds-changed';

// Keeps "take it in the morning" readable without asking for a clock time.
export const TIME_PRESETS = [
  { time: '08:00', label: 'Morning' },
  { time: '13:00', label: 'Midday' },
  { time: '19:00', label: 'Evening' },
  { time: '22:00', label: 'Night' },
];

// The three parts of the day doses are grouped under. Late-night and
// small-hours doses belong with the evening — they are the "before bed" ones.
//   Morning 05:00–11:59 · Midday 12:00–16:59 · Evening 17:00–04:59
export const PERIODS = [
  { id: 'morning', label: 'Morning', time: '08:00' },
  { id: 'midday', label: 'Midday', time: '13:00' },
  { id: 'evening', label: 'Evening', time: '20:00' },
];

export function periodOf(time) {
  const h = Number(String(time || '').slice(0, 2));
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'midday';
  return 'evening';
}

// Doses in Morning / Midday / Evening order. Within a group, the order you
// dragged them into comes first; anything not placed yet follows in time
// order, the small hours after the evening's own. Empty groups are left out.
export function groupByPeriod(doses, order = {}) {
  const late = (t) => (Number(String(t).slice(0, 2)) < 5 ? `x${t}` : t);
  return PERIODS
    .map(p => {
      const placed = order?.[p.id] || [];
      const rank = (d) => { const i = placed.indexOf(d.key); return i < 0 ? Infinity : i; };
      return {
        ...p,
        doses: doses
          .filter(d => periodOf(d.time) === p.id)
          .sort((a, b) => {
            const ra = rank(a), rb = rank(b);
            if (ra !== rb) return ra - rb;
            return late(a.time) < late(b.time) ? -1 : late(a.time) > late(b.time) ? 1 : 0;
          }),
      };
    })
    .filter(g => g.doses.length);
}

const pad = (n) => String(n).padStart(2, '0');
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch { return fallback; }
}

function writeKey(key, value) {
  const val = JSON.stringify(value);
  localStorage.setItem(key, val);
  pushKeyToSupabase(key, val);
  window.dispatchEvent(new CustomEvent(MEDS_EVENT, { detail: { key } }));
}

export const loadMeds = () => {
  const list = readJSON(MEDS_KEY, []);
  return Array.isArray(list) ? list : [];
};
export const saveMeds = (meds) => writeKey(MEDS_KEY, meds);

// { 'YYYY-MM-DD': { medId: ['09:00', …] } } — which doses of which day are done.
export const loadMedLog = () => {
  const log = readJSON(MEDS_LOG_KEY, {});
  return log && typeof log === 'object' && !Array.isArray(log) ? log : {};
};
export const saveMedLog = (log) => writeKey(MEDS_LOG_KEY, log);

// { 'YYYY-MM-DD': { medId: ['09:00', …] } } — doses skipped on purpose.
export const loadMedSkips = () => {
  const s = readJSON(MEDS_SKIP_KEY, {});
  return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
};
export const saveMedSkips = (skips) => writeKey(MEDS_SKIP_KEY, skips);

export const loadMedOrder = () => {
  const o = readJSON(MEDS_ORDER_KEY, {});
  return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
};
export const saveMedOrder = (order) => writeKey(MEDS_ORDER_KEY, order);

// Moves one dose within its part of the day. `keys` is the group as it is
// shown; the whole shown order is stored, so it holds as it was seen.
export function moveInPeriod(order, periodId, keys, from, to) {
  const list = [...keys];
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  return { ...(order || {}), [periodId]: list };
}

// A medication with no times still has one dose a day — "take it", whenever.
export const timesOf = (med) => (Array.isArray(med?.times) && med.times.length ? med.times : ['09:00']);

// Is this medication due on this date? Three things decide it: the course has
// started, it has not ended, and the repeat rule covers the day.
export function isDueOn(med, dateStr) {
  if (!med || med.active === false) return false;
  const start = String(med.startDate || '').slice(0, 10);
  if (start && dateStr < start) return false;
  if (med.endDate && dateStr > String(med.endDate).slice(0, 10)) return false;
  const rule = med.rrule || { freq: 'DAILY', interval: 1 };
  return ruleCoversDate(start || dateStr, rule, dateStr);
}

export function medsDueOn(meds, dateStr) {
  return (meds || []).filter(m => isDueOn(m, dateStr));
}

// Every dose of a day, in time order, each knowing whether it has been taken
// or skipped. This is what both the manager and the dashboard render — neither
// has to decide what "due" means. Taken wins over skipped: a dose skipped and
// then taken after all was taken.
export function dosesForDate(meds, log, dateStr, skips = {}) {
  const day = log?.[dateStr] || {};
  const skipDay = skips?.[dateStr] || {};
  const out = [];
  for (const med of medsDueOn(meds, dateStr)) {
    const taken = new Set(day[med.id] || []);
    const skipped = new Set(skipDay[med.id] || []);
    for (const time of timesOf(med)) {
      out.push({
        key: `${med.id}@${time}`,
        medId: med.id,
        name: med.name,
        dose: med.dose || '',
        notes: (med.notes || '').trim(),
        food: med.food || 'any',
        color: med.color || 'blue',
        time,
        taken: taken.has(time),
        skipped: !taken.has(time) && skipped.has(time),
      });
    }
  }
  return out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : (a.name || '').localeCompare(b.name || '')));
}

export function pendingDoses(meds, log, dateStr, skips) {
  return dosesForDate(meds, log, dateStr, skips).filter(d => !d.taken && !d.skipped);
}

// A skipped dose is no longer owed, so it leaves the count rather than
// standing in it as missed.
export function dayProgress(meds, log, dateStr, skips) {
  const all = dosesForDate(meds, log, dateStr, skips).filter(d => !d.skipped);
  return { taken: all.filter(d => d.taken).length, total: all.length };
}

// Marking a dose returns a NEW log; the caller saves it. Taking a dose twice is
// the same as taking it once — the button is a state, not a counter.
export function setDoseTaken(log, dateStr, medId, time, taken) {
  return setDoseIn(log, dateStr, medId, time, taken);
}

// Skipping is recorded the same way, in its own map.
export function setDoseSkipped(skips, dateStr, medId, time, skipped) {
  return setDoseIn(skips, dateStr, medId, time, skipped);
}

function setDoseIn(log, dateStr, medId, time, on) {
  const next = { ...(log || {}) };
  const day = { ...(next[dateStr] || {}) };
  const list = new Set(day[medId] || []);
  if (on) list.add(time); else list.delete(time);
  if (list.size) day[medId] = [...list].sort();
  else delete day[medId];
  if (Object.keys(day).length) next[dateStr] = day;
  else delete next[dateStr];
  return next;
}

export function toggleDose(log, dateStr, medId, time) {
  const taken = new Set(log?.[dateStr]?.[medId] || []).has(time);
  return setDoseTaken(log, dateStr, medId, time, !taken);
}

// ── Looking back ─────────────────────────────────────────────────────────────
//
// "Did I take yesterday's?" is a different question from "what is left today",
// and the answer has to distinguish three states a past day can be in: nothing
// was due, everything due was taken, or some of it was missed. A day with no
// doses due is not a perfect day — it is a blank one, and colouring it like a
// success would quietly inflate how well a course is going.

export const addDays = (dateStr, n) => {
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// The n days ending at `endDate`, oldest first.
export function lastNDays(n, endDate = todayStr()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(endDate, -i));
  return out;
}

// One entry per date: how much was due, how much was taken, and which of the
// four states that puts the day in.
export function historyFor(meds, log, dateStrs, skips) {
  const today = todayStr();
  return dateStrs.map(date => {
    const { taken, total } = dayProgress(meds, log, date, skips);
    const status = total === 0 ? 'empty'
      : taken === total ? 'all'
      : taken === 0 ? 'none'
      : 'partial';
    return { date, taken, total, status, isToday: date === today, isFuture: date > today };
  });
}

// Doses of a past day that were never marked. On today these are simply still
// to come, which is why the date matters.
export function missedDoses(meds, log, dateStr, skips) {
  if (dateStr >= todayStr()) return [];
  return dosesForDate(meds, log, dateStr, skips).filter(d => !d.taken && !d.skipped);
}

// How many of the last `days` days were fully taken, ignoring days with
// nothing due — the number you would actually quote to a doctor.
export function adherence(meds, log, days = 14, endDate = todayStr(), skips) {
  const hist = historyFor(meds, log, lastNDays(days, endDate), skips).filter(h => h.total > 0 && !h.isFuture);
  const due = hist.reduce((n, h) => n + h.total, 0);
  const taken = hist.reduce((n, h) => n + h.taken, 0);
  return { taken, due, days: hist.length, pct: due ? Math.round((taken / due) * 100) : null };
}

// How a schedule reads in the manager's list. Kept beside the rule so a
// schedule that gains an option gains a description in the same edit.
const DAY_NAMES = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' };
export function describeSchedule(med) {
  const r = med?.rrule;
  let base;
  if (!r || (r.freq === 'DAILY' && (r.interval || 1) === 1)) base = 'Every day';
  // "One day on, one day off" is how people describe this, and it is common
  // enough in a prescription to deserve its own words rather than "every 2".
  else if (r.freq === 'DAILY' && (r.interval || 1) === 2) base = 'Every other day';
  else if (r.freq === 'DAILY') base = `Every ${r.interval} days`;
  else if (r.freq === 'WEEKLY') {
    const days = (r.byDay || []).map(c => DAY_NAMES[c] || c).join(', ');
    base = (r.interval > 1 ? `Every ${r.interval} weeks` : 'Weekly') + (days ? ` on ${days}` : '');
  } else base = 'Every day';

  const n = timesOf(med).length;
  const perDay = n === 1 ? 'once a day' : `${n}× a day`;
  const until = med?.endDate ? `, until ${med.endDate}` : '';
  return `${base}, ${perDay}${until}`;
}

// Doses left in a course, so a seven-day antibiotic can show how much is left.
export function courseRemaining(med, fromDate = todayStr()) {
  if (!med?.endDate) return null;
  let days = 0;
  let d = fromDate;
  const end = String(med.endDate).slice(0, 10);
  // A course is short by nature; the cap stops a mistyped end date from
  // spinning here.
  for (let i = 0; i < 400 && d <= end; i++) {
    if (isDueOn(med, d)) days++;
    const next = new Date(d + 'T00:00:00');
    next.setDate(next.getDate() + 1);
    d = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
  }
  return days * timesOf(med).length;
}
