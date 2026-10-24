import './Widgets.css';

// The shell every dashboard widget shares, built to match the panels that were
// already there (Payments, Medications): the same header strip, the same
// collapse arrow, the same ↗ to open the full section. A new widget should
// look like it was always part of the dashboard.
export default function WidgetFrame({ title, badge, collapsed, onToggle, onOpen, openTitle, children, className = '' }) {
  return (
    <div className={`wg-panel${collapsed ? ' collapsed' : ''} ${className}`}>
      <div className="wg-header">
        <button className="wg-collapse" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? '▸' : '▾'}
        </button>
        <span className="wg-title">{title}</span>
        {badge != null && badge !== '' && <span className="wg-badge">{badge}</span>}
        {onOpen && <button className="wg-open" onClick={onOpen} title={openTitle || 'Open'}>↗</button>}
      </div>
      {!collapsed && <div className="wg-body">{children}</div>}
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
