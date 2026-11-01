// Skipping a dose on purpose, and what a medication is for.
import { ok, done } from './env.js';
const m = await import('../src/utils/medsStore.js');

const day = '2026-10-31';
const meds = [
  { id: 1, name: 'Pinades', times: ['08:00', '23:00'], startDate: '2026-10-01', notes: '  blood pressure ' },
  { id: 2, name: 'Laroxyl', times: ['23:00'], startDate: '2026-10-01' },
];
let log = {};
let skips = {};

let doses = m.dosesForDate(meds, log, day, skips);
ok('each dose carries what the medication is for', doses.find(d => d.medId === 1).notes === 'blood pressure');
ok('a medication without notes has none', doses.find(d => d.medId === 2).notes === '');
ok('nothing is skipped to begin with', doses.every(d => !d.skipped));

skips = m.setDoseSkipped(skips, day, 1, '08:00', true);
doses = m.dosesForDate(meds, log, day, skips);
ok('a skipped dose is marked skipped', doses.find(d => d.key === '1@08:00').skipped);
ok('and the other doses are not', doses.filter(d => d.skipped).length === 1);
ok('it leaves the day\'s count instead of standing in it as owed', JSON.stringify(m.dayProgress(meds, log, day, skips)) === '{"taken":0,"total":2}');
ok('it is not in what is still to take', m.pendingDoses(meds, log, day, skips).length === 2);

log = m.setDoseTaken(log, day, 1, '23:00', true);
log = m.setDoseTaken(log, day, 2, '23:00', true);
const hist = m.historyFor(meds, log, [day], skips)[0];
ok('a day where everything not skipped was taken counts as complete', hist.status === 'all');

const past = '2026-10-30';
const pastSkips = m.setDoseSkipped({}, past, 2, '23:00', true);
ok('a skipped past dose is not "missed"', !m.missedDoses(meds, {}, past, pastSkips).some(d => d.medId === 2));
ok('an unmarked one still is', m.missedDoses(meds, {}, past, pastSkips).some(d => d.medId === 1));

const both = m.setDoseTaken({}, day, 1, '08:00', true);
ok('taken wins over skipped', !m.dosesForDate(meds, both, day, skips).find(d => d.key === '1@08:00').skipped);

skips = m.setDoseSkipped(skips, day, 1, '08:00', false);
ok('a skip can be undone, leaving no empty day behind', JSON.stringify(skips) === '{}');

ok('callers that do not pass skips work as before', m.dayProgress(meds, {}, day).total === 3);

// Morning / Midday / Evening.
ok('08:00 is morning, 13:00 midday, 23:00 evening',
   m.periodOf('08:00') === 'morning' && m.periodOf('13:00') === 'midday' && m.periodOf('23:00') === 'evening');
ok('the boundaries: 05:00 morning, 12:00 midday, 17:00 evening, 02:00 evening',
   m.periodOf('05:00') === 'morning' && m.periodOf('12:00') === 'midday' && m.periodOf('17:00') === 'evening' && m.periodOf('02:00') === 'evening');
const groups = m.groupByPeriod([{ time: '23:00' }, { time: '01:00' }, { time: '08:00' }, { time: '20:00' }]);
ok('groups come in day order and empty ones are left out', groups.map(g => g.id).join() === 'morning,evening');
ok('a small-hours dose comes after the evening ones', groups[1].doses.map(d => d.time).join() === '20:00,23:00,01:00');

// Dragging into an order.
const morning = [{ key: 'a@08:00', time: '08:00' }, { key: 'b@08:00', time: '08:00' }, { key: 'c@09:00', time: '09:00' }];
let order = m.moveInPeriod({}, 'morning', morning.map(d => d.key), 2, 0);
ok('a dragged dose takes its new place', m.groupByPeriod(morning, order)[0].doses.map(d => d.key).join() === 'c@09:00,a@08:00,b@08:00');
ok('other parts of the day keep their own order', !order.evening);
const withNew = [...morning, { key: 'd@07:00', time: '07:00' }];
ok('a dose added later follows the placed ones', m.groupByPeriod(withNew, order)[0].doses.map(d => d.key).join() === 'c@09:00,a@08:00,b@08:00,d@07:00');

// Empty stomach / with food.
ok('food shows only when it matters', m.foodLabel('empty') === 'Empty stomach' && m.foodLabel('full') === 'With food' && m.foodLabel('any') === '' && m.foodLabel(undefined) === '');
ok('doses carry it, "either" by default', m.dosesForDate([{ id: 9, name: 'x', times: ['08:00'], startDate: '2026-10-01', food: 'full' }], {}, day)[0].food === 'full'
   && m.dosesForDate(meds, {}, day)[0].food === 'any');
done();
