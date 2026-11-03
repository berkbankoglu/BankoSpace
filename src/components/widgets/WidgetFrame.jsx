import './Widgets.css';

// The shell every dashboard widget shares, built to match the panels that were
// already there (Payments, Medications): the same header strip, the same
// collapse arrow, the same ↗ to open the full section. A new widget should
// look like it was always part of the dashboard.
export default function WidgetFrame({ title, badge, collapsed, onToggle, onOpen, openTitle, children, className = '' }) {
  return (
    <div className={`wg-panel${collapsed ? ' collapsed' : ''} ${className}`}>
      {/* The whole strip opens and closes it, as Today's does. */}
      <div className="wg-header" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'}>
        <span className={`wg-chevron${collapsed ? ' collapsed' : ''}`}>▾</span>
        <span className="wg-title">{title}</span>
        {badge != null && badge !== '' && <span className="wg-badge">{badge}</span>}
        {onOpen && (
          <button className="wg-open" onClick={(e) => { e.stopPropagation(); onOpen(); }} title={openTitle || 'Open'}>↗</button>
        )}
      </div>
      {/* Always mounted, folded away when closed — the same open/close as
          Today and Payments (.dash-collapsible), rather than a snap. */}
      <div className={`dash-collapsible${collapsed ? ' collapsed' : ''}`}>
        <div className="wg-collapsible-inner">
          <div className="wg-body">{children}</div>
        </div>
      </div>
    </div>
  );
}

// A one-line message for a widget with nothing to show yet, with the way to
// fix that.
export function WidgetEmpty({ children, action, onAction }) {
  return (
    <div className="wg-empty">
      <div>{children}</div>
      {action && <button className="wg-link" onClick={onAction}>{action}</button>}
    </div>
  );
}
