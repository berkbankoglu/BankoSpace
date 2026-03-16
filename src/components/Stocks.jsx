import { useState } from 'react';
import StockNews from './StockNews';
import './Stocks.css';

export default function Stocks() {
  const [stockTickers, setStockTickers] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('stock_tickers'));
      return Array.isArray(saved) && saved.length > 0 ? saved : ['AAPL', 'NVDA', 'TSLA'];
    } catch { return ['AAPL', 'NVDA', 'TSLA']; }
  });
  const [activeTicker, setActiveTicker] = useState('all');

  return (
    <div className="stocks-root">
      <div className="stocks-news-fullscreen">
        <StockNews
          tickers={stockTickers}
          setTickers={setStockTickers}
          activeTicker={activeTicker}
          setActiveTicker={setActiveTicker}
          onSizeChange={() => {}}
        />
      </div>
    </div>
  );
}
