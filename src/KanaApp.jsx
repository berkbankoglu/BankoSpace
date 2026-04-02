import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PracticeTab } from './components/JapaneseKana';
import './App.css';
import './components/JapaneseKana.css';

export default function KanaApp() {
  const [selectedRows, setSelectedRows] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kana_selected_rows')) || null; } catch { return null; }
  });
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);

  useEffect(() => {
    getCurrentWindow().setAlwaysOnTop(true).catch(() => {});
  }, []);

  const closePopup = async () => {
    try { await getCurrentWindow().hide(); } catch {}
  };

  const togglePin = async () => {
    const next = !isAlwaysOnTop;
    try { await getCurrentWindow().setAlwaysOnTop(next); } catch {}
    setIsAlwaysOnTop(next);
  };

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#0d1117', color: '#c9d1d9',
      fontFamily: "'Inter','Segoe UI',sans-serif",
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Drag bar + controls */}
      <div
        data-tauri-drag-region
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', background: '#161b22',
          borderBottom: '1px solid #21262d', flexShrink: 0, cursor: 'move',
        }}
      >
        <span data-tauri-drag-region style={{ fontSize: 12, fontWeight: 600, color: '#8b949e', pointerEvents: 'none' }}>
          Kana Practice
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={togglePin}
            title={isAlwaysOnTop ? 'Unpin' : 'Pin on top'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: isAlwaysOnTop ? '#58a6ff' : '#484f58', fontSize: 14, padding: '0 4px',
            }}
          >📌</button>
          <button
            onClick={closePopup}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#484f58', fontSize: 14, padding: '0 4px',
            }}
          >✕</button>
        </div>
      </div>

      {/* Practice content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <PracticeTab selectedRows={selectedRows} setSelectedRows={setSelectedRows} />
      </div>
    </div>
  );
}
