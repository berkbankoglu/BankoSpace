import { useState } from 'react';
import StockNews from './StockNews';
import './Stocks.css';

export default function Stocks() {
  const [stockTickers, setStockTickers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('stock_tickers')) || []; } catch { return []; }
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
