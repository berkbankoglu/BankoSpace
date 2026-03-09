import { useState, useRef, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import StockChart from './StockChart';
import StockMiniChart from './StockMiniChart';
import StockNews from './StockNews';
import Portfolio from './Portfolio';
import './Stocks.css';

const NEWS_MIN_W = 240;
const NEWS_MAX_W = 600;
const NEWS_DEFAULT_W = 380;

function makeGroup(name, tickers = []) {
  return { id: crypto.randomUUID(), name, tickers };
}

function loadGroups() {
  try {
    const saved = JSON.parse(localStorage.getItem('price_groups'));
    if (saved && Array.isArray(saved) && saved.length > 0) return saved;
  } catch {}
  // Eski format migration: price_tickers -> tek grup
  try {
    const old = JSON.parse(localStorage.getItem('price_tickers'));
    if (old && old.length > 0) return [makeGroup('Watchlist', old)];
  } catch {}
  return [makeGroup('Watchlist', [])];
}

export default function Stocks() {
  const [bottomTab, setBottomTab] = useState('prices');
  const [stockTickers, setStockTickers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('stock_tickers')) || ['NBIS']; } catch { return ['NBIS']; }
  });
  const [activeStockTicker, setActiveStockTicker] = useState('all');
  const [newsFilterTicker, setNewsFilterTicker] = useState('all');
  const [groups, setGroups] = useState(loadGroups);
  const [newsWidth, setNewsWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem('news_panel_width'));
    return isNaN(saved) ? NEWS_DEFAULT_W : Math.min(NEWS_MAX_W, Math.max(NEWS_MIN_W, saved));
  });
  const newsResizeRef = useRef(null);
  const leftRef = useRef(null);
  const listWrapRef = useRef(null);

  useEffect(() => {
    const leftEl = leftRef.current;
    if (!leftEl) return;
    const updateTop = () => {
      const smcWrapper = leftEl.querySelector('.smc-wrapper');
      const listWrap = listWrapRef.current;
      if (!smcWrapper || !listWrap) return;
      listWrap.style.top = smcWrapper.offsetHeight + 'px';
    };
    updateTop();
    const ro = new ResizeObserver(updateTop);
    const smcWrapper = leftEl.querySelector('.smc-wrapper');
    if (smcWrapper) ro.observe(smcWrapper);
    return () => ro.disconnect();
  }, [activeStockTicker]);

  const saveGroups = (next) => {
    localStorage.setItem('price_groups', JSON.stringify(next));
    setGroups(next);
  };

  const onNewsResizeDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = newsResizeRef.current ? newsResizeRef.current.offsetWidth : newsWidth;
    document.body.style.userSelect = 'none';
    getCurrentWindow().setCursorVisible(false).catch(() => { document.body.style.cursor = 'none'; });
    const onMove = (ev) => {
      const newW = Math.min(NEWS_MAX_W, Math.max(NEWS_MIN_W, startW + (startX - ev.clientX)));
      if (newsResizeRef.current) newsResizeRef.current.style.width = newW + 'px';
    };
    const onUp = (ev) => {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      getCurrentWindow().setCursorVisible(true).catch(() => {});
      const newW = Math.min(NEWS_MAX_W, Math.max(NEWS_MIN_W, startW + (startX - ev.clientX)));
      setNewsWidth(newW);
      localStorage.setItem('news_panel_width', String(newW));
      ev.currentTarget.removeEventListener('pointermove', onMove);
      ev.currentTarget.removeEventListener('pointerup', onUp);
    };
    e.currentTarget.addEventListener('pointermove', onMove);
    e.currentTarget.addEventListener('pointerup', onUp);
  };

  return (
    <div className="stocks-root">
      <div className="stocks-market">
        <div className="stocks-market-left" ref={leftRef}>
          <StockMiniChart ticker={activeStockTicker} />
          <div className="stc-list-wrap" ref={listWrapRef}>
            <div className="stc-bottom-tabs">
              <button className={`stc-bottom-tab ${bottomTab === 'prices' ? 'active' : ''}`} onClick={() => setBottomTab('prices')}>Prices</button>
              <button className={`stc-bottom-tab ${bottomTab === 'portfolio' ? 'active' : ''}`} onClick={() => setBottomTab('portfolio')}>Portfolio</button>
            </div>
            {bottomTab === 'prices' && (
              <StockChart
                groups={groups}
                saveGroups={saveGroups}
                activeTicker={activeStockTicker}
                setActiveTicker={setActiveStockTicker}
              />
            )}
            {bottomTab === 'portfolio' && <Portfolio />}
          </div>
        </div>
        <div className="stocks-market-right" ref={newsResizeRef} style={{ width: newsWidth }}>
          <div className="stocks-news-resize-handle" onPointerDown={onNewsResizeDown} />
          <StockNews
            tickers={stockTickers}
            setTickers={setStockTickers}
            activeTicker={newsFilterTicker}
            setActiveTicker={setNewsFilterTicker}
          />
        </div>
      </div>
    </div>
  );
}
