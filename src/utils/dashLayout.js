// What sits on the dashboard, and where.
//
// The dashboard is built from widgets the user places themselves. A layout is
// a list of columns, each an ordered list of widget ids, left to right and top
// to bottom; there are between zero and four columns, and an empty dashboard
// is simply no columns at all.
//
// It is synced like the account's data, so a dashboard built on one machine is
// the one waiting on the other.

export const DASH_LAYOUT_KEY = 'dashLayout_v1';
export const DASH_LAYOUT_EVENT = 'dash-layout-changed';
export const MAX_COLUMNS = 4;

// Everything that can be placed. `id` matches what the dashboard renders;
// daily and weekly are the two task lists, titled by the user's own names for
// them at render time.
export const WIDGETS = [
  { id: 'daily',    title: 'Daily tasks',   blurb: 'A checklist for today.' },
  { id: 'weekly',   title: 'Long-term tasks', blurb: 'Projects and lists that run for weeks.' },
  { id: 'planner',  title: 'Today',         blurb: 'Your schedule, habits and quick tasks for the day.' },
  { id: 'payments', title: 'Payments',      blurb: 'Subscriptions and bills, and when they are due.' },
  { id: 'meds',     title: 'Medications',   blurb: "Today's doses, ticked off as you take them." },
  { id: 'activity', title: 'Activity',      blurb: 'How much you have got done, day by day.' },
  { id: 'notes',    title: 'Notes',         blurb: 'Pinned and recent notes, one click from opening.' },
  { id: 'habits',   title: 'Habits',        blurb: "Today's habits, ticked off here, with your streaks." },
  { id: 'checklist', title: 'Daily checklist', blurb: 'The checklist that resets every morning.' },
  { id: 'study',    title: 'Study',         blurb: 'Flash cards and kana: what is waiting, and a way into practice.' },
  { id: 'fitness',  title: 'Fitness',       blurb: "Today's calories against your target, with the macros." },
];
const KNOWN = new Set(WIDGETS.map(w => w.id));

function clean(columns) {
  const seen = new Set();
  return columns
    .slice(0, MAX_COLUMNS)
    .map(col => (Array.isArray(col) ? col : []).filter(id => KNOWN.has(id) && !seen.has(id) && seen.add(id)));
}

// Someone who has used the app before this existed keeps exactly the dashboard
// they had: the two task lists in the first two columns and the side panels
// where they had dragged them. Only a genuinely new user starts empty.
export function hasHistory() {
  if (['dashPanelCol', 'dashPanelWeights', 'dashPanelCollapsed', 'dashColWidths'].some(k => localStorage.getItem(k) !== null)) return true;
  return ['todos', 'payments_v2', 'planner_blocks', 'meds_v1', 'notes'].some(k => {
    try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v.length > 0 : !!v; }
    catch { return false; }
  });
}

function legacyLayout() {
  const defaults = { planner: 2, payments: 2, activity: 2, meds: 3 };
  let placed = defaults;
  try {
    const v = JSON.parse(localStorage.getItem('dashPanelCol'));
    if (v && typeof v === 'object') placed = { ...defaults, ...v };
  } catch { /* defaults */ }
  const columns = [['daily'], ['weekly'], [], []];
  // The old dashboard listed panels in this order within a column.
  ['planner', 'payments', 'activity', 'meds'].forEach(id => {
    const col = Math.min(Math.max(0, placed[id] | 0), MAX_COLUMNS - 1);
    columns[col].push(id);
  });
  return columns.filter(c => c.length);
}

export function loadLayout() {
  try {
    const v = JSON.parse(localStorage.getItem(DASH_LAYOUT_KEY));
    if (v && Array.isArray(v.columns)) return { columns: clean(v.columns) };
  } catch { /* fall through */ }
  const layout = { columns: hasHistory() ? legacyLayout() : [] };
  saveLayout(layout);
  return layout;
}

export function saveLayout(layout) {
  localStorage.setItem(DASH_LAYOUT_KEY, JSON.stringify({ columns: layout.columns }));
}

export const placedIds = (layout) => new Set(layout.columns.flat());

// Put `id` in column `col` at `index` (end if omitted), taking it out of
// wherever it was. `col` may be one past the last column, which opens a new
// one.
export function place(layout, id, col, index) {
  const columns = layout.columns.map(c => c.filter(x => x !== id));
  while (columns.length <= col && columns.length < MAX_COLUMNS) columns.push([]);
  const target = Math.min(col, columns.length - 1);
  const list = columns[target];
  const at = index == null ? list.length : Math.max(0, Math.min(index, list.length));
  list.splice(at, 0, id);
  return { columns };
}

export function remove(layout, id) {
  return { columns: layout.columns.map(c => c.filter(x => x !== id)) };
}

// Columns emptied while editing are dropped when editing ends, so the
// dashboard is never left with a blank stripe.
export function prune(layout) {
  return { columns: layout.columns.filter(c => c.length) };
}

// Where "Add" puts a widget: a new column while there is room for one,
// otherwise the column holding the fewest.
export function defaultSlot(layout) {
  if (layout.columns.length < MAX_COLUMNS) return layout.columns.length;
  let best = 0;
  layout.columns.forEach((c, i) => { if (c.length < layout.columns[best].length) best = i; });
  return best;
}
