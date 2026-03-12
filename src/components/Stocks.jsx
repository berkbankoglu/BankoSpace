import { useState } from 'react';
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

export default function Stocks() {
  const [bottomTab, setBottomTab] = useState('prices');
  const [stockTickers, setStockTickers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('stock_tickers')) || ['NBIS']; } catch { return ['NBIS']; }
  });
  const [newsFilterTicker, setNewsFilterTicker] = useState('all');
  const [groups, setGroups] = useState(loadGroups);

  const saveGroups = (next) => {
    localStorage.setItem('price_groups', JSON.stringify(next));
    setGroups(next);
  };

  return (
    <div className="stocks-root">
      <div className="stocks-market">
        {/* Sol panel: fiyat listesi + portfolio */}
        <div className="stocks-market-left">
          <div className="stc-bottom-tabs">
            <button className={`stc-bottom-tab ${bottomTab === 'prices' ? 'active' : ''}`} onClick={() => setBottomTab('prices')}>Prices</button>
            <button className={`stc-bottom-tab ${bottomTab === 'portfolio' ? 'active' : ''}`} onClick={() => setBottomTab('portfolio')}>Portfolio</button>
          </div>
          <div className="stc-list-wrap">
            {bottomTab === 'prices' && (
              <StockChart
                groups={groups}
                saveGroups={saveGroups}
                activeTicker={null}
                setActiveTicker={() => {}}
              />
            )}
            {bottomTab === 'portfolio' && <Portfolio />}
          </div>
        </div>

        {/* Sağ ana alan: haberler */}
        <div className="stocks-market-right">
          <StockNews
            tickers={stockTickers}
            setTickers={setStockTickers}
            activeTicker={newsFilterTicker}
            setActiveTicker={setNewsFilterTicker}
            onSizeChange={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
