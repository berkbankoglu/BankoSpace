import { useState, useRef, Fragment } from 'react';
import './DashColumns.css';

// The dashboard's three columns. The side panels (today's planner, payments,
// activity) aren't pinned to the last column any more: each remembers which
// column it lives in and its header doubles as a drag handle for moving it.
// Heights are weighted per panel id, so a panel keeps its share wherever it
// ends up. What each panel actually renders stays with the caller — this only
// owns the layout, the drag, and the collapse state.
export const PANEL_IDS = ['planner', 'payments', 'activity'];
const FIXED_BY_COL = { 0: 'daily', 1: 'weekly' };
const DEFAULT_PANEL_COL = { planner: 2, payments: 2, activity: 2 };
const DEFAULT_WEIGHT = { daily: 3, weekly: 3, planner: 3, payments: 2, activity: 2 };
const HEADER_SELECTOR = '.dp-header, .sub-header, .activity-box-header';

function readStored(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v && typeof v === 'object' ? { ...fallback, ...v } : fallback;
  } catch { return fallback; }
}

export default function DashColumns({ colWidths, startColResize, resetColWidths, renderPanel }) {
  const [panelCol, setPanelCol] = useState(() => readStored('dashPanelCol', DEFAULT_PANEL_COL));
  const [weights, setWeights] = useState(() => readStored('dashPanelWeights', DEFAULT_WEIGHT));
  const [collapsed, setCollapsed] = useState(() => readStored('dashPanelCollapsed', { planner: false, payments: false, activity: false }));
  const [drag, setDrag] = useState(null); // { id, overCol } while moving a panel
  const colRefs = useRef([]);

  const store = (key, value, setter) => { localStorage.setItem(key, JSON.stringify(value)); setter(value); };
  const toggleCollapsed = (id) => store('dashPanelCollapsed', { ...collapsed, [id]: !collapsed[id] }, setCollapsed);
  const isCollapsed = (id) => PANEL_IDS.includes(id) && !!collapsed[id];

  // Top to bottom in a column: its fixed category column (if it has one), then
  // whichever panels have been moved into it.
  const membersOf = (col) => [
    ...(FIXED_BY_COL[col] ? [FIXED_BY_COL[col]] : []),
    ...PANEL_IDS.filter(id => panelCol[id] === col),
  ];

  // Vertical split between two stacked members of one column.
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

  // Press a panel header and drag sideways to move it into another column. A
  // press that never travels far enough stays a click, so the header's own
  // collapse toggle still works.
  const startPanelDrag = (id) => (e) => {
    if (e.button !== 0) return;
    if (!e.target.closest(HEADER_SELECTOR)) return;
    if (e.target.closest('button')) return; // e.g. Payments' add button
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const colAt = (x, y) => colRefs.current.findIndex(el => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });

    const onMove = (ev) => {
      if (!moved && Math.abs(ev.clientX - startX) < 6 && Math.abs(ev.clientY - startY) < 6) return;
      moved = true;
      setDrag({ id, overCol: colAt(ev.clientX, ev.clientY) });
    };
    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDrag(null);
      if (!moved) return;
      // Swallow the click this press would otherwise fire on the header.
      document.addEventListener('click', (ce) => { ce.stopPropagation(); ce.preventDefault(); }, { capture: true, once: true });
      const target = colAt(ev.clientX, ev.clientY);
      if (target >= 0 && target !== panelCol[id]) {
        store('dashPanelCol', { ...panelCol, [id]: target }, setPanelCol);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <>
      {[0, 1, 2].map(col => {
        const members = membersOf(col);
        return (
          <Fragment key={col}>
            {col > 0 && (
              <div
                className="col-resize-handle"
                onMouseDown={e => startColResize(col - 1, e)}
                onDoubleClick={resetColWidths}
              />
            )}
            <div
              className={`todo-col-wrapper${drag && drag.overCol === col ? ' dash-drop-target' : ''}`}
              ref={el => { colRefs.current[col] = el; }}
              style={colWidths[col] ? { flex: `1 1 ${colWidths[col]}px`, minWidth: 0 } : { flex: 1, minWidth: 0 }}
            >
              <div className="dash-col-stack">
                {members.map((id, idx) => {
                  const collapsedHere = isCollapsed(id);
                  const prevExpanded = members.slice(0, idx).filter(m => !isCollapsed(m)).slice(-1)[0];
                  return (
                    <Fragment key={id}>
                      {idx > 0 && prevExpanded && !collapsedHere && (
                        <div className="dash-stack-resize" onMouseDown={startStackResize(col, prevExpanded, id)} />
                      )}
                      <div
                        className={`dash-col-pane${drag && drag.id === id ? ' dragging' : ''}`}
                        style={collapsedHere ? { flex: '0 0 auto' } : { flex: `${weights[id] ?? 2} 1 0` }}
                        onMouseDown={PANEL_IDS.includes(id) ? startPanelDrag(id) : undefined}
                      >
                        {renderPanel(id, {
                          collapsed: !!collapsed[id],
                          onToggle: () => toggleCollapsed(id),
                        })}
                      </div>
                    </Fragment>
                  );
                })}
                {members.length === 0 && <div className="dash-col-empty">Drop a panel here</div>}
              </div>
            </div>
          </Fragment>
        );
      })}
    </>
  );
}
