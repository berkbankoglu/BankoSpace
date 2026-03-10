import { useEffect, useRef, useState, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

const MIN_H = 700;
const MAX_H = 2500;
const DEFAULT_H = 1000;

export default function StockMiniChart({ ticker }) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const dragRef = useRef(null);
  const [height, setHeight] = useState(DEFAULT_H);

  useEffect(() => {
    const symbol = (!ticker || ticker === 'all') ? 'AAPL' : ticker;
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: symbol,
      interval: 'D',
      timezone: 'Europe/Istanbul',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: '#1c2128',
      toolbarBg: '#1c2128',
      gridColor: 'rgba(48,54,61,0.8)',
      upColor: '#3fb950',
      downColor: '#f85149',
      borderUpColor: '#3fb950',
      borderDownColor: '#f85149',
      wickUpColor: '#3fb950',
      wickDownColor: '#f85149',
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: true,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      withdateranges: true,
      support_host: 'https://www.tradingview.com',
      overrides: {
        'paneProperties.background': '#1c2128',
        'paneProperties.backgroundType': 'solid',
        'paneProperties.gridLinesMode': 'both',
        'paneProperties.horzGridProperties.color': '#30363d',
        'paneProperties.vertGridProperties.color': '#30363d',
        'paneProperties.crossHairProperties.color': '#8b949e',
        'paneProperties.crossHairProperties.style': 2,
        'scalesProperties.textColor': '#8b949e',
        'scalesProperties.backgroundColor': '#1c2128',
        'scalesProperties.lineColor': '#30363d',
        'mainSeriesProperties.candleStyle.upColor': '#3fb950',
        'mainSeriesProperties.candleStyle.downColor': '#f85149',
        'mainSeriesProperties.candleStyle.borderUpColor': '#3fb950',
        'mainSeriesProperties.candleStyle.borderDownColor': '#f85149',
        'mainSeriesProperties.candleStyle.wickUpColor': '#3fb950',
        'mainSeriesProperties.candleStyle.wickDownColor': '#f85149',
        'mainSeriesProperties.lineStyle.color': '#58a6ff',
        'mainSeriesProperties.areaStyle.color1': '#58a6ff',
        'mainSeriesProperties.areaStyle.color2': 'rgba(88,166,255,0.1)',
        'mainSeriesProperties.areaStyle.linecolor': '#58a6ff',
      },
    });

    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [ticker]);

  const onDragHandleDown = useCallback((e) => {
    e.preventDefault();
    e.target.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = wrapperRef.current ? wrapperRef.current.offsetHeight : height;

    document.body.style.userSelect = 'none';
    getCurrentWindow().setCursorVisible(false).catch(() => {
      document.body.style.cursor = 'none';
    });

    const onMove = (ev) => {
      const delta = ev.clientY - startY;
      const newH = Math.min(MAX_H, Math.max(MIN_H, startH + delta));
      if (wrapperRef.current) wrapperRef.current.style.height = newH + 'px';
    };

    const onUp = (ev) => {
      ev.target.releasePointerCapture(ev.pointerId);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      getCurrentWindow().setCursorVisible(true).catch(() => {});
      const finalH = wrapperRef.current ? wrapperRef.current.offsetHeight : height;
      setHeight(finalH);
      e.target.removeEventListener('pointermove', onMove);
      e.target.removeEventListener('pointerup', onUp);
    };

    e.target.addEventListener('pointermove', onMove);
    e.target.addEventListener('pointerup', onUp);
  }, [height]);

  return (
    <div
      className="smc-wrapper"
      ref={wrapperRef}
      style={{ height, overflow: 'hidden', minHeight: MIN_H }}
    >
      <div className="smc-tv-clip">
        <div
          className="tradingview-widget-container"
          ref={containerRef}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div className="smc-resize-handle" onPointerDown={onDragHandleDown}>
        <span /><span /><span />
      </div>
    </div>
  );
}
