import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import Timer from './components/Timer';
import './App.css';

export default function TimerApp() {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    getCurrentWindow().setAlwaysOnTop(true).catch(() => {});
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();
    if (compact) {
      win.setSize(new LogicalSize(260, 80)).catch(() => {});
    } else {
      win.setSize(new LogicalSize(260, 310)).catch(() => {});
    }
  }, [compact]);

  const closePopup = async () => {
    try { await getCurrentWindow().hide(); } catch {}
  };

  const togglePin = async () => {
    const next = !isAlwaysOnTop;
    try { await getCurrentWindow().setAlwaysOnTop(next); } catch {}
    setIsAlwaysOnTop(next);
  };

  return (
    <div className="timer-popup-container">
      <div className="timer-popup-header">
        <span
          className="timer-popup-header-title"
          style={{ cursor: 'grab', flex: 1, display: 'block', userSelect: 'none' }}
        >⏱ Timer</span>
        <div className="timer-popup-header-actions">
          <button
            className="timer-popup-size-btn"
            onClick={() => setCompact(p => !p)}
            title={compact ? 'Expand' : 'Compact'}
            style={{ fontSize: '14px' }}
          >{compact ? '▲' : '▼'}</button>
          <button
            className={`timer-popup-pin-btn ${isAlwaysOnTop ? 'active' : ''}`}
            onClick={togglePin}
            title={isAlwaysOnTop ? 'Unpin' : 'Pin'}
          >📌</button>
          <button
            className="timer-popup-close-btn"
            onClick={closePopup}
            title="Close"
          >×</button>
        </div>
      </div>
      {!compact && (
        <div className="timer-popup-body">
          <Timer isPopup={true} />
        </div>
      )}
      {compact && (
        <Timer isPopup={true} isCompact={true} />
      )}
    </div>
  );
}
