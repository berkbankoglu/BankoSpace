import { useState, useEffect, useRef, useCallback } from 'react';
import './RefBoard.css';

const ZOOM_MIN = 0.04;
const ZOOM_MAX = 10;
const MAX_IMG_PX = 900;

function compressToDataUrl(file, cb) {
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const scale = img.width > MAX_IMG_PX ? MAX_IMG_PX / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      cb(canvas.toDataURL('image/jpeg', 0.82), canvas.width, canvas.height);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function getImageDims(src, cb) {
  const img = new Image();
  img.onload = () => cb(img.naturalWidth, img.naturalHeight);
  img.onerror = () => cb(400, 300);
  img.src = src;
}

const HANDLES = ['nw','n','ne','e','se','s','sw','w'];

function applyResize(item, handle, dx, dy) {
  let { x, y, w, h } = item;
  if (handle.includes('e'))  w = Math.max(20, w + dx);
  if (handle.includes('s'))  h = Math.max(20, h + dy);
  if (handle.includes('w')) { const nw = Math.max(20, w - dx); x = x + w - nw; w = nw; }
  if (handle.includes('n')) { const nh = Math.max(20, h - dy); y = y + h - nh; h = nh; }
  return { x, y, w, h };
}

export default function RefBoard() {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('refboard_items') || '[]'); }
    catch { return []; }
  });
  const [pan,  setPan]  = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState(null);
  const [grayscale, setGrayscale] = useState(false);

  const rootRef   = useRef(null);
  const panRef    = useRef({ x: 0, y: 0 });
  const zoomRef   = useRef(1);

  // sync refs so event handlers always have latest values
  useEffect(() => { panRef.current  = pan;  }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // interaction state — all via refs to avoid stale closures
  const drag = useRef(null);   // { type:'pan'|'move'|'resize'|'rotate', ...data }

  // ── Persist ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('refboard_items', JSON.stringify(items));
  }, [items]);

  // ── Wheel zoom (zoom to cursor) ───────────────────────────────────────────────
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.9;
      const z0 = zoomRef.current;
      const z1 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z0 * factor));
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const p0 = panRef.current;
      const p1 = { x: mx - (mx - p0.x) * (z1 / z0), y: my - (my - p0.y) * (z1 / z0) };
      setPan(p1);
      setZoom(z1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Global mouse move / up ───────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      const d = drag.current;
      if (!d) return;
      if (d.type === 'pan') {
        setPan({ x: d.px + (e.clientX - d.mx), y: d.py + (e.clientY - d.my) });
      } else if (d.type === 'move') {
        const dx = (e.clientX - d.mx) / zoomRef.current;
        const dy = (e.clientY - d.my) / zoomRef.current;
        setItems(prev => prev.map(it => it.id === d.id ? { ...it, x: d.ix + dx, y: d.iy + dy } : it));
      } else if (d.type === 'resize') {
        const dx = (e.clientX - d.mx) / zoomRef.current;
        const dy = (e.clientY - d.my) / zoomRef.current;
        setItems(prev => prev.map(it => it.id === d.id ? { ...it, ...applyResize(d, d.handle, dx, dy) } : it));
      } else if (d.type === 'rotate') {
        const angle  = Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * (180 / Math.PI);
        const start  = Math.atan2(d.my - d.cy, d.mx - d.cx) * (180 / Math.PI);
        const newRot = d.rot + (angle - start);
        setItems(prev => prev.map(it => it.id === d.id ? { ...it, rot: newRot } : it));
      }
    };
    const onUp = () => { drag.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // ── Keyboard ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        setItems(prev => prev.filter(it => it.id !== selected));
        setSelected(null);
      }
      if (e.key === 'Escape') setSelected(null);
      if (e.key === ' ') { e.preventDefault(); fitAll(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') { e.preventDefault(); setGrayscale(g => !g); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  // ── Paste ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onPaste = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const imgItem = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
      if (!imgItem) return;
      const file = imgItem.getAsFile();
      if (!file) return;
      const p = panRef.current;
      const z = zoomRef.current;
      const cx = (rootRef.current?.clientWidth  / 2 - p.x) / z;
      const cy = (rootRef.current?.clientHeight / 2 - p.y) / z;
      compressToDataUrl(file, (src, w, h) => {
        setItems(prev => [...prev, makeItem(src, cx - w / 2, cy - h / 2, w, h)]);
      });
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const makeItem = (src, x, y, w, h) => ({
    id: Date.now() + Math.random(), src, x, y, w, h,
    rot: 0, opacity: 1, flipH: false, flipV: false,
  });

  const bringToFront = (id) => {
    setItems(prev => {
      const it = prev.find(i => i.id === id);
      if (!it) return prev;
      return [...prev.filter(i => i.id !== id), it];
    });
  };

  const fitAll = useCallback(() => {
    if (!items.length || !rootRef.current) return;
    const xs = items.map(i => i.x);
    const ys = items.map(i => i.y);
    const xe = items.map(i => i.x + i.w);
    const ye = items.map(i => i.y + i.h);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xe), maxY = Math.max(...ye);
    const pad = 40;
    const cw = rootRef.current.clientWidth  - pad * 2;
    const ch = rootRef.current.clientHeight - pad * 2;
    const z = Math.min(1, cw / (maxX - minX), ch / (maxY - minY));
    const nx = pad + (cw - (maxX - minX) * z) / 2 - minX * z;
    const ny = pad + (ch - (maxY - minY) * z) / 2 - minY * z;
    setZoom(z);
    setPan({ x: nx, y: ny });
  }, [items]);

  // ── Drop ─────────────────────────────────────────────────────────────────────
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const rect = rootRef.current.getBoundingClientRect();
    const p = panRef.current;
    const z = zoomRef.current;
    const cx = (e.clientX - rect.left - p.x) / z;
    const cy = (e.clientY - rect.top  - p.y) / z;

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) {
      files.forEach((file, i) => {
        compressToDataUrl(file, (src, w, h) => {
          setItems(prev => [...prev, makeItem(src, cx + i * 24 - w / 2, cy + i * 24 - h / 2, w, h)]);
        });
      });
      return;
    }

    // URL or web image drag
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (url && (url.startsWith('http') || url.startsWith('data:'))) {
      getImageDims(url, (w, h) => {
        const scale = w > MAX_IMG_PX ? MAX_IMG_PX / w : 1;
        setItems(prev => [...prev, makeItem(url, cx - w * scale / 2, cy - h * scale / 2, w * scale, h * scale)]);
      });
    }
  }, []);

  // ── Canvas mouse down ────────────────────────────────────────────────────────
  const handleBgMouseDown = (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      drag.current = { type: 'pan', mx: e.clientX, my: e.clientY, px: panRef.current.x, py: panRef.current.y };
      return;
    }
    if (e.button === 0) setSelected(null);
  };

  // ── Item mouse down ──────────────────────────────────────────────────────────
  const handleItemMouseDown = (e, item) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(item.id);
    bringToFront(item.id);

    if (e.ctrlKey) {
      // Rotate via Ctrl+drag — use element center
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      drag.current = {
        type: 'rotate', id: item.id,
        mx: e.clientX, my: e.clientY,
        cx: rect.left + rect.width  / 2,
        cy: rect.top  + rect.height / 2,
        rot: item.rot || 0,
      };
    } else {
      drag.current = { type: 'move', id: item.id, mx: e.clientX, my: e.clientY, ix: item.x, iy: item.y };
    }
  };

  // ── Resize handle mouse down ─────────────────────────────────────────────────
  const handleResizeDown = (e, item, handle) => {
    e.stopPropagation();
    e.preventDefault();
    drag.current = { type: 'resize', id: item.id, handle, mx: e.clientX, my: e.clientY, ...item };
  };

  // ── Rotate handle mouse down ─────────────────────────────────────────────────
  const handleRotateDown = (e, item) => {
    e.stopPropagation();
    e.preventDefault();
    const itemEl = e.currentTarget.closest('.rb-item');
    const rect = itemEl.getBoundingClientRect();
    drag.current = {
      type: 'rotate', id: item.id,
      mx: e.clientX, my: e.clientY,
      cx: rect.left + rect.width  / 2,
      cy: rect.top  + rect.height / 2,
      rot: item.rot || 0,
    };
  };

  const selectedItem = items.find(i => i.id === selected);

  const updateSelected = (patch) => {
    setItems(prev => prev.map(i => i.id === selected ? { ...i, ...patch } : i));
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="rb-root" ref={rootRef}>

      {/* ── Toolbar ── */}
      <div className="rb-toolbar" onMouseDown={e => e.stopPropagation()}>
        <span className="rb-zoom-pct">{Math.round(zoom * 100)}%</span>
        <button className="rb-btn" title="Fit all (Space)" onClick={fitAll}>⊡</button>
        <div className="rb-sep" />
        <button className={`rb-btn ${grayscale ? 'active' : ''}`} title="Grayscale (Ctrl+G)" onClick={() => setGrayscale(g => !g)}>◑</button>
        <div className="rb-sep" />

        {selectedItem ? (<>
          <button className="rb-btn" title="Flip Horizontal" onClick={() => updateSelected({ flipH: !selectedItem.flipH })}>⇄</button>
          <button className="rb-btn" title="Flip Vertical"   onClick={() => updateSelected({ flipV: !selectedItem.flipV })}>⇅</button>
          <button className="rb-btn" title="Reset rotation"  onClick={() => updateSelected({ rot: 0 })}>↺</button>
          <div className="rb-sep" />
          <span className="rb-opacity-label">Opacity</span>
          <input
            className="rb-slider" type="range" min="0.05" max="1" step="0.05"
            value={selectedItem.opacity}
            onChange={e => updateSelected({ opacity: parseFloat(e.target.value) })}
          />
          <span className="rb-opacity-val">{Math.round(selectedItem.opacity * 100)}%</span>
          <div className="rb-sep" />
          <button className="rb-btn danger" title="Delete (Del)" onClick={() => { setItems(prev => prev.filter(i => i.id !== selected)); setSelected(null); }}>✕ Delete</button>
        </>) : (
          <span className="rb-hint">Drop images · Paste · Ctrl+drag to rotate</span>
        )}

        <div style={{ flex: 1 }} />
        <button className="rb-btn muted" title="Clear all" onClick={() => { if (items.length && window.confirm('Clear all images?')) { setItems([]); setSelected(null); } }}>Clear</button>
      </div>

      {/* ── Canvas ── */}
      <div
        className="rb-canvas-root"
        onMouseDown={handleBgMouseDown}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        <div
          className="rb-canvas"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, filter: grayscale ? 'grayscale(1)' : 'none' }}
        >
          {items.map(item => (
            <div
              key={item.id}
              className={`rb-item${selected === item.id ? ' selected' : ''}`}
              style={{
                left: item.x, top: item.y,
                width: item.w, height: item.h,
                transform: `rotate(${item.rot || 0}deg)`,
                opacity: item.opacity ?? 1,
              }}
              onMouseDown={e => handleItemMouseDown(e, item)}
            >
              <img
                src={item.src}
                draggable={false}
                alt=""
                style={{
                  width: '100%', height: '100%', objectFit: 'fill', display: 'block',
                  transform: `scaleX(${item.flipH ? -1 : 1}) scaleY(${item.flipV ? -1 : 1})`,
                  pointerEvents: 'none',
                }}
              />

              {selected === item.id && (<>
                {/* Resize handles */}
                {HANDLES.map(h => (
                  <div key={h} className={`rb-handle rb-h-${h}`} onMouseDown={e => handleResizeDown(e, item, h)} />
                ))}
                {/* Rotate handle */}
                <div className="rb-rotate-handle" onMouseDown={e => handleRotateDown(e, item)} title="Rotate (drag) — or Ctrl+drag image">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6a4 4 0 1 1 1.2 2.8" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                    <polyline points="1,8.5 1,11 3.5,11" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                {/* Rotate line */}
                <div className="rb-rotate-line" />
              </>)}
            </div>
          ))}
        </div>

        {/* Empty state */}
        {items.length === 0 && (
          <div className="rb-empty">
            <div className="rb-empty-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="6" y="10" width="36" height="28" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="16" cy="20" r="4" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M6 32l10-8 8 6 6-5 12 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="rb-empty-title">Reference Board</div>
            <div className="rb-empty-sub">Drop images here or paste from clipboard</div>
            <div className="rb-empty-keys">
              <kbd>Alt+drag</kbd> pan &nbsp;·&nbsp;
              <kbd>Scroll</kbd> zoom &nbsp;·&nbsp;
              <kbd>Ctrl+drag</kbd> rotate &nbsp;·&nbsp;
              <kbd>Space</kbd> fit all &nbsp;·&nbsp;
              <kbd>Del</kbd> delete
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
