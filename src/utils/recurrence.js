// Recurrence, the way a calendar actually needs it.
//
// The old planner answered "does this block repeat onto that date?" with a
// predicate over five fixed options. That can't express "every other Tuesday",
// can't stop ("until June"), and — the real problem — gives you nothing to edit:
// moving one occurrence of a weekly meeting has no object to move, because only
// the original exists. So repeats are expressed here as a rule plus a list of
// occurrences derived from it, and the store above this layer is free to detach
// a single occurrence by date.
//
// The rule is the RFC 5545 (iCalendar) subset that Apple's repeat sheet can
// produce, named the same way, so an .ics import maps across without a
// translation table:
//
//   { freq, interval, byDay, byMonthDay, bySetPos, byMonth, until, count }
//
//   freq        DAILY | WEEKLY | MONTHLY | YEARLY          (required)
//   interval    every N periods, default 1
//   byDay       ['MO','TU',…]  WEEKLY: which weekdays.
//                              MONTHLY/YEARLY with bySetPos: which weekday.
//   byMonthDay  [1,15,-1]      MONTHLY "each": day numbers, negative counts
//                              back from the end (-1 = last day).
//   bySetPos    1..4 | -1      MONTHLY/YEARLY "on the": first…fourth | last.
//   byMonth     [1..12]        YEARLY: which months.
//   until       'YYYY-MM-DD'   inclusive last date, or null
//   count       N              total occurrences including the first, or null
//
// Occurrences are walked forward from the start date rather than tested
// date-by-date, because `count` is only answerable in order — "the 10th
// occurrence" has no meaning you can check one day at a time. Every walk is
// bounded twice over: by the window it was asked for, and by a hard iteration
// cap, so a malformed rule costs a few thousand loop turns and not the UI
// thread.

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// A rule with no sensible period would otherwise spin: interval 0 steps
// nowhere, and a negative one walks backwards out of the window forever.
const MAX_STEPS = 10000;

const pad = (n) => String(n).padStart(2, '0');

export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00');
export const dayCode = (d) => DAY_CODES[d.getDay()];

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

// Sunday-based, matching the grid the app has always drawn.
function weekStart(d) { return addDays(d, -d.getDay()); }

// byMonthDay accepts negatives so "last day of the month" survives February.
// A day that doesn't exist in this month (the 31st of April) is simply not an
// occurrence — that is what RFC 5545 specifies, and what Apple does; the way
// to get "the end of every month" is -1, or bySetPos with a weekday.
function monthDayToDate(year, month, md) {
  const len = daysInMonth(year, month);
  const day = md < 0 ? len + md + 1 : md;
  return day >= 1 && day <= len ? new Date(year, month, day) : null;
}

// "the first Monday" / "the last Friday" of a given month.
function nthWeekdayOfMonth(year, month, code, pos) {
  const want = DAY_CODES.indexOf(code);
  if (want < 0) return null;
  const len = daysInMonth(year, month);
  const hits = [];
  for (let day = 1; day <= len; day++) {
    const d = new Date(year, month, day);
    if (d.getDay() === want) hits.push(d);
  }
  if (!hits.length) return null;
  // -1 is the last, -2 the second to last; 1 the first.
  const idx = pos < 0 ? hits.length + pos : pos - 1;
  return hits[idx] || null;
}

function normalizeRule(rule) {
  if (!rule || !rule.freq) return null;
  const freq = String(rule.freq).toUpperCase();
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;
  const interval = Number(rule.interval);
  return {
    freq,
    interval: Number.isFinite(interval) && interval >= 1 ? Math.floor(interval) : 1,
    byDay: Array.isArray(rule.byDay) && rule.byDay.length ? rule.byDay.map(c => String(c).toUpperCase()) : null,
    byMonthDay: Array.isArray(rule.byMonthDay) && rule.byMonthDay.length ? rule.byMonthDay.map(Number).filter(Number.isFinite) : null,
    bySetPos: Number.isFinite(Number(rule.bySetPos)) && rule.bySetPos !== null && rule.bySetPos !== '' ? Number(rule.bySetPos) : null,
    byMonth: Array.isArray(rule.byMonth) && rule.byMonth.length ? rule.byMonth.map(Number).filter(Number.isFinite) : null,
    until: rule.until ? String(rule.until).slice(0, 10) : null,
    count: Number.isFinite(Number(rule.count)) && Number(rule.count) > 0 ? Math.floor(Number(rule.count)) : null,
  };
}

// The dates a rule produces, in order, from `startStr` onward.
//
// `windowEnd` only bounds the walk; `count` and `until` bound the series
// itself. A rule whose series ends before the window simply yields fewer
// dates. The first occurrence is always the start date — RFC 5545 technically
// lets DTSTART fall outside its own rule, but no calendar UI offers that and
// treating the start as occurrence #1 is what makes `count` match what the
// repeat sheet said ("after 10 times" includes today).
export function occurrenceDates(startStr, rule, windowStartStr, windowEndStr) {
  const start = parseDate(startStr);
  const out = [];
  const windowStart = windowStartStr ? parseDate(windowStartStr) : null;
  const windowEnd = windowEndStr ? parseDate(windowEndStr) : null;

  const r = normalizeRule(rule);
  if (!r) {
    // No repeat: the event happens once, on its own date.
    if ((!windowStart || start >= windowStart) && (!windowEnd || start <= windowEnd)) out.push(dateKey(start));
    return out;
  }

  const until = r.until ? parseDate(r.until) : null;
  let emitted = 0;
  let steps = 0;

  // Collects one candidate, and reports whether the series is finished.
  const take = (d) => {
    if (d < start) return false;
    if (until && d > until) return 'done';
    emitted++;
    if (!windowStart || d >= windowStart) {
      if (windowEnd && d > windowEnd) return 'done';
      out.push(dateKey(d));
    }
    if (r.count && emitted >= r.count) return 'done';
    return false;
  };

  if (r.freq === 'DAILY') {
    for (let d = new Date(start); steps++ < MAX_STEPS; d = addDays(d, r.interval)) {
      if (windowEnd && d > windowEnd) break;
      if (take(d) === 'done') break;
    }
    return out;
  }

  if (r.freq === 'WEEKLY') {
    // Without byDay, a weekly rule repeats on the start date's own weekday.
    const codes = r.byDay || [dayCode(start)];
    for (let w = weekStart(start); steps++ < MAX_STEPS; w = addDays(w, 7 * r.interval)) {
      if (windowEnd && w > addDays(windowEnd, 6)) break;
      let done = false;
      // In-week order, so `count` consumes days the way the user reads them.
      for (let i = 0; i < 7; i++) {
        const d = addDays(w, i);
        if (!codes.includes(dayCode(d))) continue;
        if (take(d) === 'done') { done = true; break; }
      }
      if (done) break;
    }
    return out;
  }

  if (r.freq === 'MONTHLY') {
    let y = start.getFullYear();
    let m = start.getMonth();
    for (; steps++ < MAX_STEPS;) {
      const first = new Date(y, m, 1);
      if (windowEnd && first > windowEnd) break;
      let days = [];
      if (r.bySetPos !== null && r.byDay) {
        for (const code of r.byDay) {
          const d = nthWeekdayOfMonth(y, m, code, r.bySetPos);
          if (d) days.push(d);
        }
      } else if (r.byMonthDay) {
        for (const md of r.byMonthDay) {
          const d = monthDayToDate(y, m, md);
          if (d) days.push(d);
        }
      } else {
        // Plain "every month": the start date's own day number.
        const d = monthDayToDate(y, m, start.getDate());
        if (d) days.push(d);
      }
      days.sort((a, b) => a - b);
      let done = false;
      for (const d of days) if (take(d) === 'done') { done = true; break; }
      if (done) break;
      m += r.interval;
      y += Math.floor(m / 12);
      m = ((m % 12) + 12) % 12;
    }
    return out;
  }

  // YEARLY
  const months = r.byMonth ? r.byMonth.map(n => n - 1) : [start.getMonth()];
  for (let y = start.getFullYear(); steps++ < MAX_STEPS; y += r.interval) {
    if (windowEnd && new Date(y, 0, 1) > windowEnd) break;
    let days = [];
    for (const m of months) {
      if (m < 0 || m > 11) continue;
      if (r.bySetPos !== null && r.byDay) {
        for (const code of r.byDay) {
          const d = nthWeekdayOfMonth(y, m, code, r.bySetPos);
          if (d) days.push(d);
        }
      } else if (r.byMonthDay) {
        for (const md of r.byMonthDay) {
          const d = monthDayToDate(y, m, md);
          if (d) days.push(d);
        }
      } else {
        const d = monthDayToDate(y, m, start.getDate());
        if (d) days.push(d);
      }
    }
    days.sort((a, b) => a - b);
    let done = false;
    for (const d of days) if (take(d) === 'done') { done = true; break; }
    if (done) break;
  }
  return out;
}

// Does this rule ever land on this exact date? Answered by walking a one-day
// window, so there is exactly one definition of membership in the codebase and
// the dashboard can never disagree with the calendar about what today holds.
export function ruleCoversDate(startStr, rule, dateStr) {
  return occurrenceDates(startStr, rule, dateStr, dateStr).length > 0;
}

// Human sentence for the repeat row of the inspector ("Every 2 weeks on Mon,
// Wed"). Kept beside the engine so a rule that gains a field gains a
// description in the same edit.
const DAY_NAMES = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' };
const POS_NAMES = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', '-1': 'last' };
const ORDINAL = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function describeRule(rule) {
  const r = normalizeRule(rule);
  if (!r) return 'Never';
  const n = r.interval;
  let base;
  if (r.freq === 'DAILY') {
    base = n === 1 ? 'Every day' : `Every ${n} days`;
  } else if (r.freq === 'WEEKLY') {
    const days = r.byDay ? r.byDay.map(c => DAY_NAMES[c] || c).join(', ') : null;
    base = (n === 1 ? 'Every week' : `Every ${n} weeks`) + (days ? ` on ${days}` : '');
  } else if (r.freq === 'MONTHLY') {
    base = n === 1 ? 'Every month' : `Every ${n} months`;
    if (r.bySetPos !== null && r.byDay) {
      base += ` on the ${POS_NAMES[String(r.bySetPos)] || r.bySetPos} ${r.byDay.map(c => DAY_NAMES[c] || c).join(', ')}`;
    } else if (r.byMonthDay) {
      base += ` on the ${r.byMonthDay.map(md => (md === -1 ? 'last day' : ORDINAL(md))).join(', ')}`;
    }
  } else {
    base = n === 1 ? 'Every year' : `Every ${n} years`;
    if (r.byMonth) base += ` in ${r.byMonth.map(m => MONTH_NAMES[m - 1]).filter(Boolean).join(', ')}`;
    if (r.bySetPos !== null && r.byDay) {
      base += ` on the ${POS_NAMES[String(r.bySetPos)] || r.bySetPos} ${r.byDay.map(c => DAY_NAMES[c] || c).join(', ')}`;
    }
  }
  if (r.count) base += `, ${r.count} times`;
  else if (r.until) base += `, until ${r.until}`;
  return base;
}

// The five legacy `recur` values, as rules. The migration uses this, and so
// does anything still handed an old-shaped block.
export function ruleFromLegacyRecur(recur, startStr) {
  switch (recur) {
    case 'daily':   return { freq: 'DAILY', interval: 1 };
    case 'weekday': return { freq: 'WEEKLY', interval: 1, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] };
    case 'weekly':  return { freq: 'WEEKLY', interval: 1, byDay: [dayCode(parseDate(startStr))] };
    case 'monthly': return { freq: 'MONTHLY', interval: 1, byMonthDay: [parseDate(startStr).getDate()] };
    default:        return null;
  }
}
