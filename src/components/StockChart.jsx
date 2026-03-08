import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';

const REFRESH_MS = 5 * 1000;
const SIZES = ['S', 'M', 'L'];
const SIZE_LABELS = { S: 'Small', M: 'Medium', L: 'Large' };

const POPULAR_STOCKS = [
  { ticker: 'AAPL',  name: 'Apple' },
  { ticker: 'MSFT',  name: 'Microsoft' },
  { ticker: 'GOOGL', name: 'Alphabet' },
  { ticker: 'AMZN',  name: 'Amazon' },
  { ticker: 'NVDA',  name: 'NVIDIA' },
  { ticker: 'META',  name: 'Meta' },
  { ticker: 'TSLA',  name: 'Tesla' },
  { ticker: 'AMD',   name: 'AMD' },
  { ticker: 'INTC',  name: 'Intel' },
  { ticker: 'NFLX',  name: 'Netflix' },
  { ticker: 'PLTR',  name: 'Palantir' },
  { ticker: 'NBIS',  name: 'Nebius Group' },
  { ticker: 'CRWD',  name: 'CrowdStrike' },
  { ticker: 'SNOW',  name: 'Snowflake' },
  { ticker: 'SMCI',  name: 'Super Micro' },
  { ticker: 'ARM',   name: 'Arm Holdings' },
  { ticker: 'MSTR',  name: 'MicroStrategy' },
  { ticker: 'COIN',  name: 'Coinbase' },
  { ticker: 'HOOD',  name: 'Robinhood' },
  { ticker: 'RKLB',  name: 'Rocket Lab' },
  { ticker: 'IONQ',  name: 'IonQ' },
  { ticker: 'SOUN',  name: 'SoundHound' },
  { ticker: 'MARA',  name: 'Marathon Digital' },
  { ticker: 'RIOT',  name: 'Riot Platforms' },
  { ticker: 'SHOP',  name: 'Shopify' },
  { ticker: 'PYPL',  name: 'PayPal' },
  { ticker: 'UBER',  name: 'Uber' },
  { ticker: 'SPOT',  name: 'Spotify' },
  { ticker: 'NET',   name: 'Cloudflare' },
  { ticker: 'DDOG',  name: 'Datadog' },
  { ticker: 'CRM',   name: 'Salesforce' },
  { ticker: 'ORCL',  name: 'Oracle' },
  { ticker: 'TSM',   name: 'TSMC' },
  { ticker: 'NVDA',  name: 'NVIDIA' },
  { ticker: 'AVGO',  name: 'Broadcom' },
  { ticker: 'JPM',   name: 'JPMorgan' },
  { ticker: 'GS',    name: 'Goldman Sachs' },
  { ticker: 'V',     name: 'Visa' },
  { ticker: 'MA',    name: 'Mastercard' },
  { ticker: 'LLY',   name: 'Eli Lilly' },
  { ticker: 'XOM',   name: 'ExxonMobil' },
  { ticker: 'BA',    name: 'Boeing' },
  { ticker: 'RIVN',  name: 'Rivian' },
  { ticker: 'F',     name: 'Ford' },
  { ticker: 'NIO',   name: 'NIO' },
  { ticker: 'BTC-USD', name: 'Bitcoin' },
  { ticker: 'ETH-USD', name: 'Ethereum' },
  { ticker: 'IREN',  name: 'IREN' },
];

async function fetchQuote(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d&includePrePost=true`;
  const text = await invoke('fetch_rss', { url });
  const json = JSON.parse(text);
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('No data');

  const meta = result.meta;

  // Real-time price: last non-null close from the quotes array
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const livePrice = [...closes].reverse().find(v => v != null);

  // Fallback to meta if no quotes yet
  const price = livePrice ?? meta.regularMarketPrice;
  if (price == null) throw new Error('Missing price');

  // Determine market session
  const tp = meta.currentTradingPeriod;
  const nowTs = Date.now() / 1000;
  const inRegular = tp?.regular && nowTs >= tp.regular.start && nowTs < tp.regular.end;
  const inPre  = tp?.pre  && nowTs >= tp.pre.start  && nowTs < tp.pre.end;
  const inPost = tp?.post && nowTs >= tp.post.start && nowTs < tp.post.end;

  // last regular session close (shown as prevClose on card)
  const lastRegularClose = meta.regularMarketPrice;
  const yesterdayClose = meta.chartPreviousClose ?? meta.previousClose ?? lastRegularClose;

  // During regular hours: change vs yesterday; pre/post: change vs last close
  const prev = inRegular ? yesterdayClose : lastRegularClose;
  if (prev == null) throw new Error('Missing prevClose');

  // The "main" price shown on the card is always the last regular close during pre/post,
  // and the live price during regular hours
  const marketPrice = inRegular ? price : lastRegularClose;
  const marketChange = marketPrice - yesterdayClose;
  const marketPct = (marketChange / yesterdayClose) * 100;

  // Extended hours
  let preMarket = null;
  let postMarket = null;
  if (inPre && price != null && lastRegularClose != null) {
    preMarket = { price, change: price - lastRegularClose, pct: ((price - lastRegularClose) / lastRegularClose) * 100 };
  }
  if (inPost && price != null && lastRegularClose != null) {
    postMarket = { price, change: price - lastRegularClose, pct: ((price - lastRegularClose) / lastRegularClose) * 100 };
  }

  return { ticker, price: marketPrice, change: marketChange, pct: marketPct, preMarket, postMarket, prevClose: yesterdayClose };
}

export default function StockChart({ tickers, saveTickers, activeTicker, setActiveTicker }) {
  const [quotes, setQuotes] = useState({});
  const [size, setSize] = useState(() => localStorage.getItem('stc_size') || 'M');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerHighlight, setPickerHighlight] = useState(-1);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [sizeMenuPos, setSizeMenuPos] = useState({ top: 0, right: 0 });
  const pickerRef = useRef(null);
  const addBtnRef = useRef(null);
  const sizeMenuRef = useRef(null);
  const sizeBtnRef = useRef(null);
  const pickerListRef = useRef(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, right: 0 });
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const dragState = useRef(null); // { idx, startX, startY, moved }

  const loadAll = useCallback(() => {
    tickers.forEach(t => {
      setQuotes(prev => {
        const cur = prev[t];
        const hasData = cur && cur !== 'loading' && cur !== 'error';
        return { ...prev, [t]: hasData ? cur : 'loading' };
      });
      fetchQuote(t)
        .then(q => setQuotes(prev => ({ ...prev, [t]: q })))
        .catch(() => setQuotes(prev => ({ ...prev, [t]: 'error' })));
    });
  }, [tickers]);

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadAll]);

  // Cancel drag on pointer up anywhere (e.g. released outside a card)
  useEffect(() => {
    const cancel = () => {
      if (dragState.current) {
        dragState.current = null;
        setDragIdx(null);
        setDragOverIdx(null);
      }
    };
    window.addEventListener('pointerup', cancel);
    return () => window.removeEventListener('pointerup', cancel);
  }, []);

  // Close picker/size menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false);
        setPickerSearch('');
      }
      if (
        sizeMenuRef.current && !sizeMenuRef.current.contains(e.target) &&
        sizeBtnRef.current && !sizeBtnRef.current.contains(e.target)
      ) {
        setShowSizeMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleTicker = (t) => {
    if (tickers.includes(t)) {
      const next = tickers.filter(x => x !== t);
      saveTickers(next);
      if (activeTicker === t) setActiveTicker('all');
    } else {
      saveTickers([...tickers, t]);
      setShowPicker(false);
      setPickerSearch('');
      setPickerHighlight(-1);
    }
  };

  const handlePickerKeyDown = (e) => {
    if (!showPicker) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPickerHighlight(prev => {
        const next = Math.min(prev + 1, filteredStocks.length - 1);
        scrollPickerItem(next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPickerHighlight(prev => {
        const next = Math.max(prev - 1, 0);
        scrollPickerItem(next);
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (pickerHighlight >= 0 && pickerHighlight < filteredStocks.length) {
        toggleTicker(filteredStocks[pickerHighlight].ticker);
      }
    } else if (e.key === 'Escape') {
      setShowPicker(false);
      setPickerSearch('');
      setPickerHighlight(-1);
    }
  };

  const scrollPickerItem = (idx) => {
    if (!pickerListRef.current) return;
    const items = pickerListRef.current.querySelectorAll('.stc-picker-item');
    if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
  };

  const removeTicker = (t, e) => {
    e.stopPropagation();
    const next = tickers.filter(x => x !== t);
    saveTickers(next);
    if (activeTicker === t) setActiveTicker('all');
  };

  const changeSize = (s) => { setSize(s); localStorage.setItem('stc_size', s); };

  const uniqueStocks = POPULAR_STOCKS.filter((s, idx, arr) => arr.findIndex(x => x.ticker === s.ticker) === idx);
  const filteredStocks = uniqueStocks.filter(s => {
    const q = pickerSearch.toLowerCase();
    return !q || s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
  });

  // Reset highlight when search changes
  const handlePickerSearchChange = (e) => {
    setPickerSearch(e.target.value);
    setPickerHighlight(-1);
  };

  return (
    <div className={`stock-ticker-bar stc-size-${size.toLowerCase()}`}>
      <div className="stock-ticker-cards">
        {tickers.length === 0 && (
          <span className="stc-empty">+ ile hisse ekle</span>
        )}
        {tickers.map((t, idx) => {
          const q = quotes[t];
          const isLoading = !q || q === 'loading';
          const isError = q === 'error';
          const pos = !isLoading && !isError && q.change >= 0;
          const isDragging = dragIdx === idx;
          const isOver = dragOverIdx === idx;
          const isActive = activeTicker === t;

          const handlePointerDown = (e) => {
            if (e.button !== 0) return;
            dragState.current = { idx, startX: e.clientX, startY: e.clientY, moved: false };
          };

          const handlePointerMove = (e) => {
            if (!dragState.current || dragState.current.idx !== idx) return;
            const dx = Math.abs(e.clientX - dragState.current.startX);
            const dy = Math.abs(e.clientY - dragState.current.startY);
            if (!dragState.current.moved && (dx > 5 || dy > 5)) {
              dragState.current.moved = true;
              setDragIdx(idx);
            }
          };

          const handlePointerEnter = () => {
            if (dragState.current && dragState.current.moved && dragState.current.idx !== idx) {
              setDragOverIdx(idx);
            }
          };

          const handlePointerUp = (e) => {
            if (!dragState.current) return;
            const wasMoved = dragState.current.moved;
            const fromIdx = dragState.current.idx;
            dragState.current = null;
            setDragIdx(null);
            setDragOverIdx(null);
            if (wasMoved) {
              if (fromIdx !== idx) {
                const next = [...tickers];
                const [moved] = next.splice(fromIdx, 1);
                next.splice(idx, 0, moved);
                saveTickers(next);
              }
            } else {
              setActiveTicker(activeTicker === t ? 'all' : t);
            }
          };

          return (
            <div
              key={t}
              className={`stock-ticker-card ${!isLoading && !isError ? (pos ? 'pos' : 'neg') : ''} ${isActive ? 'active' : ''} ${isDragging ? 'stc-dragging' : ''} ${isOver ? 'stc-drag-over' : ''}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerEnter={handlePointerEnter}
              onPointerUp={handlePointerUp}
              title={`Open ${t} on TradingView`}
            >
              <div className="stc-card-top">
                <span className="stc-symbol">{t}</span>
                <div className="stc-card-actions">
                  <button className="stc-remove" onClick={e => removeTicker(t, e)} title={`Remove ${t}`}>×</button>
                </div>
              </div>
              {isLoading && <span className="stc-loading" />}
              {isError && <span className="stc-error">—</span>}
              {!isLoading && !isError && (
                <>
                  <span className="stc-price">${q.price.toFixed(2)}</span>
                  <span className="stc-change">{pos ? '+' : ''}{q.pct.toFixed(2)}%</span>
                  <span className="stc-prev-close">Prev {q.prevClose.toFixed(2)}</span>
                  {q.preMarket && (
                    <span className={`stc-ext ${q.preMarket.change >= 0 ? 'pos' : 'neg'}`}>
                      Pre ${q.preMarket.price.toFixed(2)} ({q.preMarket.change >= 0 ? '+' : ''}{q.preMarket.pct.toFixed(2)}%)
                    </span>
                  )}
                  {q.postMarket && (
                    <span className={`stc-ext ${q.postMarket.change >= 0 ? 'pos' : 'neg'}`}>
                      After ${q.postMarket.price.toFixed(2)} ({q.postMarket.change >= 0 ? '+' : ''}{q.postMarket.pct.toFixed(2)}%)
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* + Picker — immediately after cards */}
      <div className="stc-picker-wrap" ref={pickerRef}>
        <button
          className={`stc-add-btn ${showPicker ? 'active' : ''}`}
          ref={addBtnRef}
          onClick={() => {
            if (!showPicker && addBtnRef.current) {
              const r = addBtnRef.current.getBoundingClientRect();
              setPickerPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
            }
            setShowPicker(p => !p);
          }}
          title="Add ticker"
        >+</button>
        {showPicker && (
          <div className="stc-picker-dropdown stc-picker-dropdown--portal" style={{ position: 'fixed', top: pickerPos.top, right: pickerPos.right, left: 'auto' }}>
            <input
              className="stc-picker-search"
              placeholder="Ara... (AAPL, TSLA...)"
              value={pickerSearch}
              onChange={handlePickerSearchChange}
              onKeyDown={handlePickerKeyDown}
              autoFocus
            />
            <div className="stc-picker-list" ref={pickerListRef}>
              {filteredStocks.map((s, idx) => (
                <button
                  key={s.ticker}
                  className={`stc-picker-item ${tickers.includes(s.ticker) ? 'selected' : ''} ${idx === pickerHighlight ? 'highlighted' : ''}`}
                  onMouseDown={e => { e.preventDefault(); toggleTicker(s.ticker); }}
                  onMouseEnter={() => setPickerHighlight(idx)}
                >
                  <span className="stc-picker-ticker">{s.ticker}</span>
                  <span className="stc-picker-name">{s.name}</span>
                  {tickers.includes(s.ticker) && <span className="stc-picker-check">✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Size selector — single button with dropdown */}
      <div className="stc-size-wrap">
        <button
          className={`stc-size-toggle ${showSizeMenu ? 'active' : ''}`}
          ref={sizeBtnRef}
          onClick={() => {
            if (!showSizeMenu && sizeBtnRef.current) {
              const r = sizeBtnRef.current.getBoundingClientRect();
              setSizeMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
            }
            setShowSizeMenu(p => !p);
          }}
          title="Card size"
        >{size}</button>
        {showSizeMenu && createPortal(
          <div ref={sizeMenuRef} className="stc-size-menu" style={{ position: 'fixed', top: sizeMenuPos.top, right: sizeMenuPos.right, left: 'auto', zIndex: 99999 }}>
            {SIZES.map(s => (
              <button
                key={s}
                className={`stc-size-menu-item ${size === s ? 'active' : ''}`}
                onClick={() => { changeSize(s); setShowSizeMenu(false); }}
              >{s} <span className="stc-size-menu-label">{SIZE_LABELS[s]}</span></button>
            ))}
          </div>,
          document.body
        )}
      </div>

      <button className="stock-ticker-refresh" onClick={loadAll} title="Refresh prices">↻</button>
    </div>
  );
}
