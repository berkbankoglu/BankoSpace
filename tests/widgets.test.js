import { store, ok, done } from './env.js';
import React from 'react';
import { renderToString } from 'react-dom/server';
const html = (el) => renderToString(el).replace(/<!--[\s\S]*?-->/g, '');
const reset = () => Object.keys(store).forEach(k => delete store[k]);
const noop = () => {};

const { notesToShow, default: NotesWidget } = await import('../src/components/widgets/NotesWidget.jsx');
const { streakOf, default: HabitsWidget } = await import('../src/components/widgets/HabitsWidget.jsx');
const { visibleItems, default: ChecklistWidget } = await import('../src/components/widgets/ChecklistWidget.jsx');
const { fitnessToday, default: FitnessWidget } = await import('../src/components/widgets/FitnessWidget.jsx');
const { studySummary, default: StudyWidget } = await import('../src/components/widgets/StudyWidget.jsx');

console.log('\n--- Notes ---');
const notes = [
  { id: 1, title: 'Old', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 2, title: 'Pinned old', pinned: true, updatedAt: '2025-01-01T00:00:00Z' },
  { id: 3, title: 'Newest', updatedAt: '2026-10-20T00:00:00Z', content: '<p>Buy <b>milk</b></p><p>and bread</p>' },
];
ok('pinned first, then most recent', JSON.stringify(notesToShow(notes).map(n => n.id)) === '[2,3,1]');
ok('at most six', notesToShow(Array.from({ length: 10 }, (_, i) => ({ id: i }))).length === 6);
reset(); store.notes = JSON.stringify(notes);
let h = html(React.createElement(NotesWidget, { onToggle: noop, onOpenNotes: noop }));
ok('renders titles and a plain-text snippet', h.includes('Newest') && h.includes('Buy milk and bread') && !h.includes('&lt;b&gt;'));
ok('pinned notes are labelled', h.includes('Pinned'));
reset();
ok('empty state offers to write one', html(React.createElement(NotesWidget, { onToggle: noop, onOpenNotes: noop })).includes('Write a note'));

console.log('\n--- Habits ---');
const today = new Date(2026, 9, 24);
const log = { '2026-10-24': { 1: true }, '2026-10-23': { 1: true, 2: true }, '2026-10-22': { 1: true, 2: true }, '2026-10-20': { 2: true } };
ok('a streak counts back from today', streakOf(log, 1, today) === 3);
ok('not done yet today: counts back from yesterday', streakOf(log, 2, today) === 2);
ok('no entries: zero', streakOf(log, 9, today) === 0);
reset();
store.habitTracker_habits = JSON.stringify([{ id: 1, name: 'Gym', icon: '◆', color: '#f00' }, { id: 2, name: 'Guitar' }]);
const k = new Date(); const tk = k.getFullYear() + '-' + String(k.getMonth() + 1).padStart(2, '0') + '-' + String(k.getDate()).padStart(2, '0');
store.habitTracker_log = JSON.stringify({ [tk]: { 1: true } });
h = html(React.createElement(HabitsWidget, { onToggle: noop, onOpenHabits: noop }));
ok('lists today\'s habits with a done count', h.includes('Gym') && h.includes('Guitar') && h.includes('1/2'));
ok('done ones are struck', (h.match(/wg-row done/g) || []).length === 1);

console.log('\n--- Daily checklist ---');
const items = [{ id: 1, text: 'Water plants', completed: true }, { id: 2, text: 'Read', completed: false }];
ok('ticks from today stay', visibleItems(items, 'Sat Oct 24 2026', 'Sat Oct 24 2026')[0].completed === true);
ok('ticks from an earlier day show as unticked', visibleItems(items, 'Fri Oct 23 2026', 'Sat Oct 24 2026').every(i => !i.completed));
reset(); store.dailyChecklistItems = JSON.stringify(items); store.dailyChecklistLastReset = 'Fri Oct 23 2020';
h = html(React.createElement(ChecklistWidget, { title: 'Morning', onToggle: noop, onOpenChecklists: noop }));
ok('uses the checklist\'s own name and shows a fresh day', h.includes('Morning') && h.includes('0/2'));

console.log('\n--- Fitness ---');
reset();
const utc = new Date().toISOString().slice(0, 10);
store.ft_meals = JSON.stringify({ [utc]: [{ kcal: 600.4, p: 40, c: 50, f: 20 }, { kcal: 450, p: 30, c: 40, f: 15 }], '2000-01-01': [{ kcal: 9999 }] });
store.ft_goal_kcal = '2000';
const f = fitnessToday();
ok('today\'s meals only, summed', f.kcal === 1050 && f.p === 70 && f.c === 90 && f.f === 35 && f.meals === 2);
ok('target read from the Fitness page\'s own figure', f.goal === 2000);
h = html(React.createElement(FitnessWidget, { onToggle: noop, onOpenFitness: noop }));
ok('shows eaten and left', h.includes('1050 kcal eaten') && h.includes('950 left'));
store.ft_goal_kcal = '1000';
ok('and says when over', html(React.createElement(FitnessWidget, { onToggle: noop, onOpenFitness: noop })).includes('50 over'));

console.log('\n--- Study ---');
reset();
store.flashCards = JSON.stringify([{ known: true }, { known: false }, { known: null }, {}]);
store.kana_best_score = JSON.stringify({ score: 42 });
store.kana_stats = JSON.stringify({ a: {}, i: {} });
const st = studySummary();
ok('cards not marked known are to review', st.toReview === 3 && st.known === 1);
ok('kana best streak', st.bestStreak === 42 && st.practised === 2);
h = html(React.createElement(StudyWidget, { onToggle: noop, onOpenStudy: noop }));
ok('both ways into practice are offered', h.includes('Practise cards') && h.includes('Practise kana'));
reset();
ok('nothing studied: one way in', html(React.createElement(StudyWidget, { onToggle: noop, onOpenStudy: noop })).includes('Start with kana'));

console.log('\n--- the library knows them ---');
const { WIDGETS } = await import('../src/utils/dashLayout.js');
ok('eleven widgets in all', WIDGETS.length === 11 && ['notes','habits','checklist','study','fitness'].every(id => WIDGETS.some(w => w.id === id)));
done();
