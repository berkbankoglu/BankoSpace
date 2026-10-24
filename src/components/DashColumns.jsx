import { useState, useRef, useEffect, useCallback, Fragment } from 'react';
import {
  WIDGETS, MAX_COLUMNS, DASH_LAYOUT_EVENT,
  loadLayout, saveLayout, place, remove, prune, defaultSlot, placedIds,
} from '../utils/dashLayout';
import './DashColumns.css';

// The dashboard: columns of widgets the user has placed themselves.
//
// This owns the layout (src/utils/dashLayout.js), the drag, the collapse state
// and the per-widget heights. What each widget renders stays with the caller.
// In edit mode every widget wears a bar to drag it by and an × to take it off,
// its contents stop taking clicks, and a library alongside offers the widgets
// that are not on the dashboard yet.

const DEFAULT_WEIGHT = {
  daily: 3, weekly: 3, planner: 3, payments: 2, activity: 2, meds: 2,
  notes: 2, habits: 2, checklist: 2, study: 2, fitness: 2,
};
// Side panels could always be moved by their header outside edit mode; that
// stays. The task lists move only in edit mode.
const HEADER_SELECTOR = '.dp-header, .sub-header, .activity-box-header, .meds-header, .wg-header';
const HEADER_DRAGGABLE = new Set(['planner', 'payments', 'activity', 'meds', 'notes', 'habits', 'checklist', 'study', 'fitness']);

function readStored(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v && typeof v === 'object' ? { ...fallback, ...v } : fallback;
  } catch { return fallback; }
}

export default function DashColumns({
  colWidths, startColResize, resetColWidths, renderPanel,
  available, editing, onStartEditing, widgetTitle,
}) {
  const [layout, setLayoutState] = useState(loadLayout);
  const [weights, setWeights] = useState(() => readStored('dashPanelWeights', DEFAULT_WEIGHT));
  const [collapsed, setCollapsed] = useState(() => readStored('dashPanelCollapsed', {}));
  // While dragging: what is moving, and where it would land.
  const [drag, setDrag] = useState(null); // { id, x, y, target: { col, index } | null, fromLibrary }
  const colRefs = useRef([]);
  const columnCountRef = useRef(layout.columns.length);

  const isAvailable = (id) => available.includes(id);

  const commit = useCallback((next) => {
    setLayoutState(next);
    saveLayout(next);
  }, []);

  // A change made on another device arrives through the sync layer.
  useEffect(() => {
    const reload = () => setLayoutState(loadLayout());
    window.addEventListener(DASH_LAYOUT_EVENT, reload);
    return () => window.removeEventListener(DASH_LAYOUT_EVENT, reload);
  }, []);

  // Leaving edit mode drops emptied columns; widths were set for a different
  // number of columns, so they go back to even.
  const wasEditing = useRef(editing);
  useEffect(() => {
    if (wasEditing.current && !editing) {
      const pruned = prune(layout);
      if (pruned.columns.length !== layout.columns.length) commit(pruned);
      if (pruned.columns.length !== columnCountRef.current) resetColWidths();
      columnCountRef.current = pruned.columns.length;
    }
    wasEditing.current = editing;
  }, [editing, layout, commit, resetColWidths]);

  const storeObj = (key, value, setter) => { localStorage.setItem(key, JSON.stringify(value)); setter(value); };
  const toggleCollapsed = (id) => storeObj('dashPanelCollapsed', { ...collapsed, [id]: !collapsed[id] }, setCollapsed);
  const isCollapsed = (id) => !!collapsed[id];

  const membersOf = (col) => (layout.columns[col] || []).filter(isAvailable);

  // Columns on screen: the user's columns, and while editing one more empty
  // one at the end (if there is room) to drop into and start a new column.
  const shownColumns = editing
    ? [...layout.columns.map((_, i) => i), ...(layout.columns.length < MAX_COLUMNS ? [layout.columns.length] : [])]
    : layout.columns.map((_, i) => i).filter(i => membersOf(i).length);

  // ── Drag ───────────────────────────────────────────────────────────────

  // Which column and position the pointer is over. The index counts the
  // column's widgets other than the one moving, since it is taken out first.
  const targetAt = (x, y, movingId) => {
    for (const col of shownColumns) {
      const el = colRefs.current[col];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const panes = [...el.querySelectorAll('[data-widget]')].filter(p => p.dataset.widget !== movingId);
      let index = panes.length;
      for (let i = 0; i < panes.length; i++) {
        const pr = panes[i].getBoundingClientRect();
        if (y < pr.top + pr.height / 2) { index = i; break; }
      }
      return { col, index };
    }
    return null;
  };

  const beginDrag = (id, e, fromLibrary) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const onMove = (ev) => {
      if (!moved && Math.abs(ev.clientX - startX) < 5 && Math.abs(ev.clientY - startY) < 5) return;
      moved = true;
      setDrag({ id, x: ev.clientX, y: ev.clientY, target: targetAt(ev.clientX, ev.clientY, id), fromLibrary });
    };
    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDrag(null);
      if (!moved) return;
      // The press would otherwise also land as a click on what is under it.
      document.addEventListener('click', (ce) => { ce.stopPropagation(); ce.preventDefault(); }, { capture: true, once: true });
      const t = targetAt(ev.clientX, ev.clientY, id);
      if (t) commit(place(layout, id, t.col, t.index));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Outside edit mode a side panel can still be moved by its header, as
  // before; a press that does not travel stays a click on the header.
  const headerDrag = (id) => (e) => {
    if (editing || !HEADER_DRAGGABLE.has(id)) return;
    if (!e.target.closest(HEADER_SELECTOR) || e.target.closest('button')) return;
    beginDrag(id, e, false);
  };

  const addFromLibrary = (id) => commit(place(layout, id, defaultSlot(layout)));

  // ── Heights within a column ────────────────────────────────────────────

  const startStackResize = (col, aId, bId) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const height = colRefs.current[col]?.clientHeight || 1;
    const startY = e.clientY;
    const wA = weights[aId] ?? 2;
    const wB = weights[bId] ?? 2;
    const total = wA + wB;
    const onMove = (ev) => {
      const delta = ((ev.clientY - startY) / height) * total;
      const a = Math.max(0.4, Math.min(total - 0.4, wA + delta));
      setWeights(w => ({ ...w, [aId]: a, [bId]: total - a }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setWeights(w => { localStorage.setItem('dashPanelWeights', JSON.stringify(w)); return w; });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const placed = placedIds(layout);
  const library = WIDGETS.filter(w => isAvailable(w.id));

  if (!editing && shownColumns.length === 0) {
    return (
      <div className="dash-empty">
        <div className="dash-empty-card">
          <div className="dash-empty-title">Build your dashboard</div>
          <p className="dash-empty-text">
            Put the things you use here — your tasks, today’s schedule, payments,
            medications. Add only what you need; you can change it any time.
          </p>
          <button className="dash-empty-btn" onClick={onStartEditing}>Add widgets</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {shownColumns.map((col, pos) => {
        const members = editing ? (layout.columns[col] || []).filter(isAvailable) : membersOf(col);
        const isNewColumn = col >= layout.columns.length;
        const dropHere = drag?.target?.col === col;
        const visibleMembers = members.filter(id => !(drag && drag.id === id && dropHere));
        const lineAt = dropHere ? drag.target.index : -1;
        return (
          <Fragment key={col}>
            {pos > 0 && !editing && (
              <div
                className="col-resize-handle"
                onMouseDown={e => startColResize(pos - 1, e)}
                onDoubleClick={resetColWidths}
              />
            )}
            <div
              className={`todo-col-wrapper${dropHere ? ' dash-drop-target' : ''}${editing ? ' editing' : ''}`}
              ref={el => { colRefs.current[col] = el; }}
              style={!editing && colWidths[pos] ? { flex: `1 1 ${colWidths[pos]}px`, minWidth: 0 } : { flex: 1, minWidth: 0 }}
            >
              <div className="dash-col-stack">
                {members.map((id, idx) => {
                  const collapsedHere = isCollapsed(id);
                  const prevExpanded = members.slice(0, idx).filter(m => !isCollapsed(m)).slice(-1)[0];
                  const visibleIdx = visibleMembers.indexOf(id);
                  return (
                    <Fragment key={id}>
                      {lineAt >= 0 && visibleIdx === lineAt && <div className="dash-drop-line" />}
                      {!editing && idx > 0 && prevExpanded && !collapsedHere && (
                        <div className="dash-stack-resize" onMouseDown={startStackResize(col, prevExpanded, id)} />
                      )}
                      <div
                        data-widget={id}
                        className={`dash-col-pane${drag && drag.id === id ? ' dragging' : ''}${collapsedHere ? ' collapsed' : ''}${editing ? ' editing' : ''}`}
                        // Only flex-grow changes between the two states, so the
                        // pane can animate between them; min-height keeps the
                        // header visible once it has shrunk away to nothing.
                        style={{ flex: `${collapsedHere ? 0 : (weights[id] ?? 2)} 1 0` }}
                        onMouseDown={headerDrag(id)}
                      >
                        {renderPanel(id, {
                          collapsed: !!collapsed[id],
                          onToggle: () => toggleCollapsed(id),
                        })}
                        {editing && (
                          <div className="dash-edit-overlay" onMouseDown={(e) => { if (!e.target.closest('.dash-edit-remove')) beginDrag(id, e, false); }}>
                            <div className="dash-edit-bar">
                              <span className="dash-edit-grip">⠿</span>
                              <span className="dash-edit-title">{widgetTitle(id)}</span>
                              <button
                                className="dash-edit-remove"
                                title="Remove from dashboard"
                                onClick={() => commit(remove(layout, id))}
                              >×</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </Fragment>
                  );
                })}
                {lineAt >= 0 && lineAt >= visibleMembers.length && <div className="dash-drop-line" />}
                {editing && members.length === 0 && (
                  <div className="dash-col-empty">{isNewColumn ? 'Drop here for a new column' : 'Drop a widget here'}</div>
                )}
              </div>
            </div>
          </Fragment>
        );
      })}

      {editing && (
        <aside className="dash-library">
          <div className="dash-library-title">Widgets</div>
          <p className="dash-library-hint">Drag one onto the dashboard, or press Add.</p>
          {library.map(w => {
            const on = placed.has(w.id);
            return (
              <div
                key={w.id}
                className={`dash-library-item${on ? ' placed' : ''}`}
                onMouseDown={on ? undefined : (e) => { if (!e.target.closest('button')) beginDrag(w.id, e, true); }}
              >
                <div className="dash-library-text">
                  <div className="dash-library-name">{widgetTitle(w.id)}</div>
                  <div className="dash-library-blurb">{w.blurb}</div>
                </div>
                {on
                  ? <span className="dash-library-on">On dashboard</span>
                  : <button className="dash-library-add" onClick={() => addFromLibrary(w.id)}>Add</button>}
              </div>
            );
          })}
        </aside>
      )}

      {drag && (
        <div className="dash-drag-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          {widgetTitle(drag.id)}
        </div>
      )}
    </>
  );
}
