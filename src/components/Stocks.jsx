import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import StockChart from './StockChart';
import StockNews from './StockNews';
import Portfolio from './Portfolio';
import './Stocks.css';

function makeGroup(name, tickers = []) {
  return { id: crypto.randomUUID(), name, tickers };
}

function loadGroups() {
  try {
    const saved = JSON.parse(localStorage.getItem('price_groups'));
    if (saved && Array.isArray(saved) && saved.length > 0) return saved;
  } catch {}
  try {
    const old = JSON.parse(localStorage.getItem('price_tickers'));
    if (old && old.length > 0) return [makeGroup('Watchlist', old)];
  } catch {}
  return [makeGroup('Watchlist', [])];
}

export default function Stocks({ session }) {
  const [bottomTab, setBottomTab] = useState('prices');
  const [stockTickers, setStockTickers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('stock_tickers')) || ['NBIS']; } catch { return ['NBIS']; }
  });
  const [newsFilterTicker, setNewsFilterTicker] = useState('all');
  const [groups, setGroups] = useState(loadGroups);
  const [chartTicker, setChartTicker] = useState('AAPL');
  const centerRef = useRef(null);
  const childCreated = useRef(false);

  const saveGroups = (next) => {
    localStorage.setItem('price_groups', JSON.stringify(next));
    setGroups(next);
  };

  const handleSetActiveTicker = (t) => {
    setNewsFilterTicker(t);
    if (t && t !== 'all') setChartTicker(t);
  };

  const getCenterBounds = useCallback(() => {
    if (!centerRef.current) return null;
    const rect = centerRef.current.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }, []);

  // Child webview aç
  useEffect(() => {
    const openChild = async () => {
      const bounds = getCenterBounds();
      if (!bounds || bounds.width < 10) return;

      const url = `https://www.tradingview.com/chart/?symbol=${chartTicker}`;
      try {
        await invoke('create_child_webview', {
          url,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        });
        childCreated.current = true;
      } catch (e) {
        console.error('Child webview create error:', e);
      }
    };

    // DOM render sonrası çalıştır
    const timeout = setTimeout(openChild, 200);
    return () => clearTimeout(timeout);
  }, []);

  // Sembol değişince navigate et
  useEffect(() => {
    if (!chartTicker || !childCreated.current) return;
    const url = `https://www.tradingview.com/chart/?symbol=${chartTicker}`;
    invoke('navigate_child_webview', { url }).catch(console.error);
  }, [chartTicker]);

  // Unmount: child'ı gizle
  useEffect(() => {
    return () => {
      invoke('hide_child_webview').catch(() => {});
    };
  }, []);

  // Window resize'da bounds güncelle
  useEffect(() => {
    const handleResize = () => {
      if (!childCreated.current) return;
      const bounds = getCenterBounds();
      if (!bounds) return;
      invoke('set_child_webview_bounds', {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }).catch(console.error);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getCenterBounds]);

  return (
    <div className="stocks-root">
      <div className="stocks-market">
        {/* Sol panel: Haberler */}
        <div className="stocks-market-left">
          <StockNews
            tickers={stockTickers}
            setTickers={setStockTickers}
            activeTicker={newsFilterTicker}
            setActiveTicker={handleSetActiveTicker}
            onSizeChange={() => {}}
          />
        </div>

        {/* Orta alan: TradingView child webview buraya gömülü */}
        <div className="stocks-market-center" ref={centerRef}>
          <div className="stocks-tv-embed-placeholder">
            <div className="stocks-tv-embed-ticker">{chartTicker}</div>
          </div>
        </div>

        {/* Sağ panel: Watchlist / Portfolio */}
        <div className="stocks-market-right">
          <div className="stc-bottom-tabs">
            <button className={`stc-bottom-tab ${bottomTab === 'prices' ? 'active' : ''}`} onClick={() => setBottomTab('prices')}>Prices</button>
            <button className={`stc-bottom-tab ${bottomTab === 'portfolio' ? 'active' : ''}`} onClick={() => setBottomTab('portfolio')}>Portfolio</button>
          </div>
          <div className="stc-list-wrap">
            {bottomTab === 'prices' && (
              <StockChart
                groups={groups}
                saveGroups={saveGroups}
                activeTicker={newsFilterTicker}
                setActiveTicker={handleSetActiveTicker}
              />
            )}
            {bottomTab === 'portfolio' && <Portfolio />}
          </div>
        </div>

      </div>
    </div>
  );
}
