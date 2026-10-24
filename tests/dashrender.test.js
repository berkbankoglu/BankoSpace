import { store, ok, done } from './env.js';
import React from 'react';
import { renderToString } from 'react-dom/server';
const { default: DashColumns } = await import('../src/components/DashColumns.jsx');
const html = (props) => renderToString(React.createElement(DashColumns, {
  colWidths: [null, null, null, null], startColResize() {}, resetColWidths() {},
  renderPanel: (id) => React.createElement('div', { className: 'w-' + id }, 'WIDGET:' + id),
  available: ['daily', 'weekly', 'planner', 'payments', 'meds'],     // activity switched off in Labs
  editing: false, onStartEditing() {}, widgetTitle: (id) => 'T:' + id, ...props,
})).replace(/<!--[\s\S]*?-->/g, '');
const count = (h, s) => h.split(s).length - 1;
const reset = () => Object.keys(store).forEach(k => delete store[k]);

console.log('\n--- a new user ---');
reset();
let h = html();
ok('sees the "Build your dashboard" card', h.includes('Build your dashboard') && h.includes('Add widgets'));
ok('and no widgets', !h.includes('WIDGET:'));

console.log('\n--- an existing user ---');
reset();
store.todos = JSON.stringify([{ id: 1 }]);
h = html();
ok('no onboarding card', !h.includes('Build your dashboard'));
ok('every placed widget renders', ['daily','weekly','planner','payments','meds'].every(id => h.includes('WIDGET:' + id)));
ok('a widget switched off in Labs is hidden, not shown', !h.includes('WIDGET:activity'));
ok('four columns, three resize handles', count(h, 'class="todo-col-wrapper') === 4 && count(h, 'col-resize-handle') === 3);
ok('no editing controls', !h.includes('dash-edit-overlay') && !h.includes('dash-library'));

console.log('\n--- edit mode ---');
h = html({ editing: true });
ok('each widget gets a bar with its name and ×', count(h, 'dash-edit-overlay') === 5 && h.includes('T:planner') && count(h, 'dash-edit-remove') === 5);
ok('the library is shown', h.includes('dash-library') && h.includes('Widgets'));
ok('placed widgets are marked, nothing can be added twice', count(h, 'On dashboard') === 5 && !h.includes('>Add<'));
ok('no resize handles while editing', !h.includes('col-resize-handle') && !h.includes('dash-stack-resize'));
ok('all four columns are shown and no fifth (the maximum)', count(h, 'class="todo-col-wrapper') === 4 && !h.includes('new column'));

console.log('\n--- edit mode with room to spare ---');
store.dashLayout_v1 = JSON.stringify({ columns: [['daily'], ['planner']] });
h = html({ editing: true });
ok('an empty slot is offered for a new column', h.includes('Drop here for a new column') && count(h, 'class="todo-col-wrapper') === 3);
ok('widgets not on the dashboard can be added', count(h, '>Add<') === 3 && count(h, 'On dashboard') === 2);
h = html();
ok('outside edit mode only the two real columns show', count(h, 'class="todo-col-wrapper') === 2 && !h.includes('Drop here'));
done();
