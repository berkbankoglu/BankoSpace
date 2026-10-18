import { useState } from 'react';
import './MobileTabBar.css';

// How many views get a tab of their own before the rest fold into "More".
const PRIMARY_COUNT = 4;

// Bottom tab bar — the mobile replacement for the desktop's persistent left
// sidebar (that sidebar stays completely untouched; this only ever renders
// when useIsMobile() is true). Reuses the same sidebarItems/activeView state
// App.jsx already has, just with a touch-first navigation shell around it.
export default function MobileTabBar({ items, activeView, onNavigate }) {
  const [showMore, setShowMore] = useState(false);

  // The tabs follow the sidebar's own order rather than a list fixed here, so
  // whatever you keep at the top of the sidebar is what you get at the bottom
  // of the phone — and reordering the sidebar reorders these too. The previous
  // fixed list predated the calendar and left it buried under "More".
  const visible = items.filter(i => !i.hidden);
  const primary = visible.slice(0, PRIMARY_COUNT);
  const rest = visible.slice(PRIMARY_COUNT);
  const moreIsActive = rest.some(i => i.view === activeView);

  const go = (view) => { onNavigate(view); setShowMore(false); };

  return (
    <>
      {showMore && (
        <div className="mtb-sheet-overlay" onClick={() => setShowMore(false)}>
          <div className="mtb-sheet" onClick={e => e.stopPropagation()}>
            <div className="mtb-sheet-handle" />
            <div className="mtb-sheet-title">More</div>
            <div className="mtb-sheet-list">
              {rest.map(item => (
                <button
                  key={item.id}
                  className={`mtb-sheet-item ${activeView === item.view ? 'active' : ''}`}
                  onClick={() => go(item.view)}
                >
                  <span className="mtb-sheet-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="mtb-bar">
        {primary.map(item => (
          <button
            key={item.id}
            className={`mtb-tab ${activeView === item.view ? 'active' : ''}`}
            onClick={() => go(item.view)}
          >
            <span className="mtb-tab-icon">{item.icon}</span>
            <span className="mtb-tab-label">{item.label}</span>
          </button>
        ))}
        {rest.length > 0 && (
          <button
            className={`mtb-tab ${moreIsActive ? 'active' : ''}`}
            onClick={() => setShowMore(true)}
          >
            <span className="mtb-tab-icon">⋯</span>
            <span className="mtb-tab-label">More</span>
          </button>
        )}
      </nav>
    </>
  );
}
