import { store, ok, done } from './env.js';
const L = await import('../src/utils/dashLayout.js');
const reset = () => Object.keys(store).forEach(k => delete store[k]);
const cols = (l) => JSON.stringify(l.columns);

console.log('\n--- a brand-new user starts with an empty dashboard ---');
reset();
ok('no columns', L.loadLayout().columns.length === 0);
ok('and that is saved', JSON.parse(store.dashLayout_v1).columns.length === 0);

console.log('\n--- an existing user keeps exactly what they had ---');
reset();
store.todos = JSON.stringify([{ id: 1 }]);
let l = L.loadLayout();
ok('default old layout: daily | weekly | today+payments+activity | meds',
   cols(l) === JSON.stringify([['daily'], ['weekly'], ['planner', 'payments', 'activity'], ['meds']]));
reset();
store.dashPanelCol = JSON.stringify({ planner: 2, payments: 3, activity: 2, meds: 3 });  // Payments moved to its own column, as on this machine
l = L.loadLayout();
ok('a customised old layout is carried over', cols(l) === JSON.stringify([['daily'], ['weekly'], ['planner', 'activity'], ['payments', 'meds']]));
ok('even with no tasks, layout history alone marks an existing user', l.columns.length === 4);

console.log('\n--- a saved layout wins over migration ---');
store.dashLayout_v1 = JSON.stringify({ columns: [['meds'], ['daily', 'daily', 'nonsense']] });
l = L.loadLayout();
ok('loaded as saved, duplicates and unknown ids dropped', cols(l) === JSON.stringify([['meds'], ['daily']]));

console.log('\n--- placing, moving, removing ---');
let x = { columns: [] };
x = L.place(x, 'daily', L.defaultSlot(x));
ok('first widget opens column 1', cols(x) === JSON.stringify([['daily']]));
x = L.place(x, 'planner', L.defaultSlot(x));
ok('Add puts the next one in a new column while there is room', cols(x) === JSON.stringify([['daily'], ['planner']]));
x = L.place(x, 'meds', 1, 0);
ok('dropping at the top of a column', cols(x) === JSON.stringify([['daily'], ['meds', 'planner']]));
x = L.place(x, 'meds', 0);
ok('moving takes it out of where it was', cols(x) === JSON.stringify([['daily', 'meds'], ['planner']]));
x = L.place(x, 'payments', 2);
ok('dropping on the empty slot after the last column opens one', cols(x) === JSON.stringify([['daily', 'meds'], ['planner'], ['payments']]));
x = L.remove(x, 'planner');
ok('removing leaves the column empty while editing', cols(x) === JSON.stringify([['daily', 'meds'], [], ['payments']]));
ok('and Done drops it', cols(L.prune(x)) === JSON.stringify([['daily', 'meds'], ['payments']]));
let full = { columns: [['a'], ['b', 'c'], ['d'], ['e', 'f']].map(c => c.map((_, i) => ['daily','weekly','planner','payments','meds','activity'][i])) };
full = { columns: [['daily'], ['weekly', 'planner'], ['payments'], ['meds', 'activity']] };
ok('with four columns, Add picks the emptiest', L.defaultSlot(full) === 0);
ok('never more than four columns', L.place(full, 'daily', 9).columns.length === 4);
done();
