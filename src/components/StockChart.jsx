import { useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';

const REFRESH_MS = 5 * 1000;

const POPULAR_STOCKS = [
  // Hisseler
  { ticker: 'AAPL',  name: 'Apple',           cat: 'stocks' },
  { ticker: 'MSFT',  name: 'Microsoft',        cat: 'stocks' },
  { ticker: 'GOOGL', name: 'Alphabet',         cat: 'stocks' },
  { ticker: 'AMZN',  name: 'Amazon',           cat: 'stocks' },
  { ticker: 'NVDA',  name: 'NVIDIA',           cat: 'stocks' },
  { ticker: 'META',  name: 'Meta',             cat: 'stocks' },
  { ticker: 'TSLA',  name: 'Tesla',            cat: 'stocks' },
  { ticker: 'AMD',   name: 'AMD',              cat: 'stocks' },
  { ticker: 'INTC',  name: 'Intel',            cat: 'stocks' },
  { ticker: 'NFLX',  name: 'Netflix',          cat: 'stocks' },
  { ticker: 'PLTR',  name: 'Palantir',         cat: 'stocks' },
  { ticker: 'NBIS',  name: 'Nebius Group',     cat: 'stocks' },
  { ticker: 'CRWD',  name: 'CrowdStrike',      cat: 'stocks' },
  { ticker: 'SNOW',  name: 'Snowflake',        cat: 'stocks' },
  { ticker: 'SMCI',  name: 'Super Micro',      cat: 'stocks' },
  { ticker: 'ARM',   name: 'Arm Holdings',     cat: 'stocks' },
  { ticker: 'MSTR',  name: 'MicroStrategy',    cat: 'stocks' },
  { ticker: 'COIN',  name: 'Coinbase',         cat: 'stocks' },
  { ticker: 'HOOD',  name: 'Robinhood',        cat: 'stocks' },
  { ticker: 'RKLB',  name: 'Rocket Lab',       cat: 'stocks' },
  { ticker: 'IONQ',  name: 'IonQ',             cat: 'stocks' },
  { ticker: 'SOUN',  name: 'SoundHound',       cat: 'stocks' },
  { ticker: 'MARA',  name: 'Marathon Digital',  cat: 'stocks' },
  { ticker: 'RIOT',  name: 'Riot Platforms',   cat: 'stocks' },
  { ticker: 'SHOP',  name: 'Shopify',          cat: 'stocks' },
  { ticker: 'PYPL',  name: 'PayPal',           cat: 'stocks' },
  { ticker: 'UBER',  name: 'Uber',             cat: 'stocks' },
  { ticker: 'SPOT',  name: 'Spotify',          cat: 'stocks' },
  { ticker: 'NET',   name: 'Cloudflare',       cat: 'stocks' },
  { ticker: 'DDOG',  name: 'Datadog',          cat: 'stocks' },
  { ticker: 'CRM',   name: 'Salesforce',       cat: 'stocks' },
  { ticker: 'ORCL',  name: 'Oracle',           cat: 'stocks' },
  { ticker: 'TSM',   name: 'TSMC',             cat: 'stocks' },
  { ticker: 'AVGO',  name: 'Broadcom',         cat: 'stocks' },
  { ticker: 'JPM',   name: 'JPMorgan',         cat: 'stocks' },
  { ticker: 'GS',    name: 'Goldman Sachs',    cat: 'stocks' },
  { ticker: 'V',     name: 'Visa',             cat: 'stocks' },
  { ticker: 'MA',    name: 'Mastercard',       cat: 'stocks' },
  { ticker: 'LLY',   name: 'Eli Lilly',        cat: 'stocks' },
  { ticker: 'XOM',   name: 'ExxonMobil',       cat: 'stocks' },
  { ticker: 'BA',    name: 'Boeing',           cat: 'stocks' },
  { ticker: 'RIVN',  name: 'Rivian',           cat: 'stocks' },
  { ticker: 'F',     name: 'Ford',             cat: 'stocks' },
  { ticker: 'NIO',   name: 'NIO',              cat: 'stocks' },
  { ticker: 'IREN',  name: 'IREN',             cat: 'stocks' },
  { ticker: 'BABA',  name: 'Alibaba',          cat: 'stocks' },
  { ticker: 'DIS',   name: 'Disney',           cat: 'stocks' },
  { ticker: 'NFLX',  name: 'Netflix',          cat: 'stocks' },
  { ticker: 'WMT',   name: 'Walmart',          cat: 'stocks' },
  { ticker: 'PG',    name: 'Procter & Gamble', cat: 'stocks' },
  { ticker: 'KO',    name: 'Coca-Cola',        cat: 'stocks' },
  { ticker: 'PEP',   name: 'PepsiCo',          cat: 'stocks' },
  { ticker: 'MCD',   name: "McDonald's",       cat: 'stocks' },
  { ticker: 'SBUX',  name: 'Starbucks',        cat: 'stocks' },
  { ticker: 'AMGN',  name: 'Amgen',            cat: 'stocks' },
  { ticker: 'GILD',  name: 'Gilead Sciences',  cat: 'stocks' },
  { ticker: 'PFE',   name: 'Pfizer',           cat: 'stocks' },
  { ticker: 'MRNA',  name: 'Moderna',          cat: 'stocks' },
  { ticker: 'JNJ',   name: 'Johnson & Johnson', cat: 'stocks' },
  { ticker: 'UNH',   name: 'UnitedHealth',     cat: 'stocks' },
  { ticker: 'CVX',   name: 'Chevron',          cat: 'stocks' },
  { ticker: 'CAT',   name: 'Caterpillar',      cat: 'stocks' },
  { ticker: 'DE',    name: 'John Deere',       cat: 'stocks' },
  { ticker: 'HON',   name: 'Honeywell',        cat: 'stocks' },
  { ticker: 'RTX',   name: 'Raytheon',         cat: 'stocks' },
  { ticker: 'LMT',   name: 'Lockheed Martin',  cat: 'stocks' },
  { ticker: 'GE',    name: 'GE Aerospace',     cat: 'stocks' },
  { ticker: 'SPCE',  name: 'Virgin Galactic',  cat: 'stocks' },
  { ticker: 'LCID',  name: 'Lucid Motors',     cat: 'stocks' },
  { ticker: 'SOFI',  name: 'SoFi Technologies', cat: 'stocks' },
  { ticker: 'PINS',  name: 'Pinterest',        cat: 'stocks' },
  { ticker: 'SNAP',  name: 'Snap',             cat: 'stocks' },
  { ticker: 'TWTR',  name: 'X (Twitter)',      cat: 'stocks' },
  { ticker: 'ABNB',  name: 'Airbnb',           cat: 'stocks' },
  { ticker: 'LYFT',  name: 'Lyft',             cat: 'stocks' },
  { ticker: 'DASH',  name: 'DoorDash',         cat: 'stocks' },
  { ticker: 'RBLX',  name: 'Roblox',           cat: 'stocks' },
  { ticker: 'U',     name: 'Unity Software',   cat: 'stocks' },
  { ticker: 'AFRM',  name: 'Affirm',           cat: 'stocks' },
  { ticker: 'OPEN',  name: 'Opendoor',         cat: 'stocks' },
  { ticker: 'HIMS',  name: 'Hims & Hers',      cat: 'stocks' },
  { ticker: 'CELH',  name: 'Celsius Holdings', cat: 'stocks' },
  { ticker: 'DUOL',  name: 'Duolingo',         cat: 'stocks' },
  { ticker: 'RDDT',  name: 'Reddit',           cat: 'stocks' },
  { ticker: 'ACHR',  name: 'Archer Aviation',  cat: 'stocks' },
  { ticker: 'JOBY',  name: 'Joby Aviation',    cat: 'stocks' },
  // Kripto
  { ticker: 'BTC-USD',  name: 'Bitcoin',       cat: 'crypto' },
  { ticker: 'ETH-USD',  name: 'Ethereum',      cat: 'crypto' },
  { ticker: 'SOL-USD',  name: 'Solana',        cat: 'crypto' },
  { ticker: 'BNB-USD',  name: 'BNB',           cat: 'crypto' },
  { ticker: 'XRP-USD',  name: 'Ripple',        cat: 'crypto' },
  { ticker: 'ADA-USD',  name: 'Cardano',       cat: 'crypto' },
  { ticker: 'AVAX-USD', name: 'Avalanche',     cat: 'crypto' },
  { ticker: 'DOGE-USD', name: 'Dogecoin',      cat: 'crypto' },
  { ticker: 'SHIB-USD', name: 'Shiba Inu',     cat: 'crypto' },
  { ticker: 'DOT-USD',  name: 'Polkadot',      cat: 'crypto' },
  { ticker: 'MATIC-USD',name: 'Polygon',       cat: 'crypto' },
  { ticker: 'LINK-USD', name: 'Chainlink',     cat: 'crypto' },
  { ticker: 'UNI7083-USD', name: 'Uniswap',   cat: 'crypto' },
  { ticker: 'LTC-USD',  name: 'Litecoin',      cat: 'crypto' },
  { ticker: 'ATOM1-USD',name: 'Cosmos',        cat: 'crypto' },
  { ticker: 'NEAR-USD', name: 'NEAR Protocol', cat: 'crypto' },
  { ticker: 'APT21794-USD', name: 'Aptos',     cat: 'crypto' },
  { ticker: 'SUI20947-USD', name: 'Sui',       cat: 'crypto' },
  { ticker: 'ARB11841-USD', name: 'Arbitrum',  cat: 'crypto' },
  { ticker: 'OP-USD',   name: 'Optimism',      cat: 'crypto' },
  // Emtialar
  { ticker: 'GC=F',  name: 'Gold',               cat: 'commodities' },
  { ticker: 'SI=F',  name: 'Silver',              cat: 'commodities' },
  { ticker: 'CL=F',  name: 'Crude Oil (WTI)',     cat: 'commodities' },
  { ticker: 'BZ=F',  name: 'Brent Oil',           cat: 'commodities' },
  { ticker: 'NG=F',  name: 'Natural Gas',         cat: 'commodities' },
  { ticker: 'HG=F',  name: 'Copper',              cat: 'commodities' },
  { ticker: 'PL=F',  name: 'Platinum',            cat: 'commodities' },
  { ticker: 'PA=F',  name: 'Palladium',           cat: 'commodities' },
  { ticker: 'ZC=F',  name: 'Corn',                cat: 'commodities' },
  { ticker: 'ZW=F',  name: 'Wheat',               cat: 'commodities' },
  { ticker: 'ZS=F',  name: 'Soybeans',            cat: 'commodities' },
  { ticker: 'CC=F',  name: 'Cocoa',               cat: 'commodities' },
  { ticker: 'KC=F',  name: 'Coffee',              cat: 'commodities' },
  { ticker: 'CT=F',  name: 'Cotton',              cat: 'commodities' },
  { ticker: 'SB=F',  name: 'Sugar',               cat: 'commodities' },
  // Indices
  { ticker: '^GSPC',  name: 'S&P 500',             cat: 'indices' },
  { ticker: '^DJI',   name: 'Dow Jones',            cat: 'indices' },
  { ticker: '^IXIC',  name: 'NASDAQ Composite',     cat: 'indices' },
  { ticker: '^NDX',   name: 'NASDAQ 100',           cat: 'indices' },
  { ticker: '^RUT',   name: 'Russell 2000',         cat: 'indices' },
  { ticker: '^VIX',   name: 'VIX (Volatility)',     cat: 'indices' },
  { ticker: '^FTSE',  name: 'FTSE 100 (UK)',        cat: 'indices' },
  { ticker: '^GDAXI', name: 'DAX (Germany)',        cat: 'indices' },
  { ticker: '^FCHI',  name: 'CAC 40 (France)',      cat: 'indices' },
  { ticker: '^N225',  name: 'Nikkei 225 (Japan)',   cat: 'indices' },
  { ticker: '^HSI',   name: 'Hang Seng (HK)',       cat: 'indices' },
  { ticker: '000001.SS', name: 'Shanghai Composite', cat: 'indices' },
  { ticker: '^BSESN', name: 'BSE Sensex (India)',   cat: 'indices' },
  { ticker: 'XU100.IS', name: 'BIST 100 (Turkey)', cat: 'indices' },
  // Forex
  { ticker: 'EURUSD=X', name: 'EUR/USD',            cat: 'forex' },
  { ticker: 'GBPUSD=X', name: 'GBP/USD',            cat: 'forex' },
  { ticker: 'USDJPY=X', name: 'USD/JPY',            cat: 'forex' },
  { ticker: 'USDTRY=X', name: 'USD/TRY',            cat: 'forex' },
  { ticker: 'EURTRY=X', name: 'EUR/TRY',            cat: 'forex' },
  { ticker: 'GBPTRY=X', name: 'GBP/TRY',            cat: 'forex' },
  { ticker: 'USDCHF=X', name: 'USD/CHF',            cat: 'forex' },
  { ticker: 'USDCAD=X', name: 'USD/CAD',            cat: 'forex' },
  { ticker: 'AUDUSD=X', name: 'AUD/USD',            cat: 'forex' },
  { ticker: 'NZDUSD=X', name: 'NZD/USD',            cat: 'forex' },
  { ticker: 'USDINR=X', name: 'USD/INR',            cat: 'forex' },
  { ticker: 'USDCNY=X', name: 'USD/CNY',            cat: 'forex' },
  { ticker: 'USDRUB=X', name: 'USD/RUB',            cat: 'forex' },
  { ticker: 'USDBRL=X', name: 'USD/BRL',            cat: 'forex' },
  { ticker: 'DX-Y.NYB', name: 'Dollar Index (DXY)', cat: 'forex' },
];

const PICKER_CATS = [
  { key: 'all',        label: 'All' },
  { key: 'stocks',     label: 'Stocks' },
  { key: 'crypto',     label: 'Crypto' },
  { key: 'commodities',label: 'Commodities' },
  { key: 'indices',    label: 'Indices' },
  { key: 'forex',      label: 'Forex' },
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

// Tek grup için satır listesi
function GroupRows({ group, quotes, activeTicker, setActiveTicker, dragState, dragOver, setDragOver, onRemove, onDrop }) {
  return group.tickers.map((t, idx) => {
    const q = quotes[t];
    const isLoading = !q || q === 'loading';
    const isError = q === 'error';
    const pos = !isLoading && !isError && q.change >= 0;
    const isActive = activeTicker === t;
    const isDragging = dragState.current?.groupId === group.id && dragState.current?.idx === idx;
    const isOver = dragOver?.groupId === group.id && dragOver?.idx === idx;

    const handlePointerDown = (e) => {
      if (e.button !== 0) return;
      dragState.current = { groupId: group.id, idx, ticker: t, startX: e.clientX, startY: e.clientY, moved: false };
    };
    const handlePointerMove = (e) => {
      if (!dragState.current || dragState.current.groupId !== group.id || dragState.current.idx !== idx) return;
      const dx = Math.abs(e.clientX - dragState.current.startX);
      const dy = Math.abs(e.clientY - dragState.current.startY);
      if (!dragState.current.moved && (dx > 5 || dy > 5)) dragState.current.moved = true;
    };
    const handlePointerEnter = () => {
      if (dragState.current?.moved) setDragOver({ groupId: group.id, idx });
    };
    const handlePointerUp = () => {
      if (!dragState.current) return;
      const { moved, groupId: fromGroupId, idx: fromIdx, ticker: fromTicker } = dragState.current;
      dragState.current = null;
      setDragOver(null);
      if (moved) {
        onDrop(fromGroupId, fromIdx, fromTicker, group.id, idx);
      } else {
        setActiveTicker(activeTicker === t ? 'all' : t);
      }
    };

    const stockInfo = POPULAR_STOCKS.find(s => s.ticker === t);

    return (
      <div
        key={t}
        className={`stc-row ${isActive ? 'active' : ''} ${isDragging ? 'stc-dragging' : ''} ${isOver ? 'stc-drag-over' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerEnter={handlePointerEnter}
        onPointerUp={handlePointerUp}
      >
        <div className="stc-row-left">
          <span className="stc-symbol">{t}</span>
          {stockInfo && <span className="stc-name-label">{stockInfo.name}</span>}
        </div>
        <div className="stc-row-right">
          <span className="stc-price">
            {isLoading && <span className="stc-loading-dot" />}
            {isError && <span className="stc-error">—</span>}
            {!isLoading && !isError && `$${q.price.toFixed(2)}`}
          </span>
          <span className={`stc-change ${!isLoading && !isError ? (pos ? 'pos' : 'neg') : ''}`}>
            {!isLoading && !isError && (
              <>
                {pos ? '▲' : '▼'} {pos ? '+' : ''}{q.pct.toFixed(2)}%
              </>
            )}
          </span>
          {!isLoading && !isError && q.preMarket && (
            <span className={`stc-ext-badge ${q.preMarket.change >= 0 ? 'pos' : 'neg'}`}>
              Pre {q.preMarket.change >= 0 ? '+' : ''}{q.preMarket.pct.toFixed(2)}%
            </span>
          )}
          {!isLoading && !isError && q.postMarket && (
            <span className={`stc-ext-badge ${q.postMarket.change >= 0 ? 'pos' : 'neg'}`}>
              After {q.postMarket.change >= 0 ? '+' : ''}{q.postMarket.pct.toFixed(2)}%
            </span>
          )}
        </div>
        <button
          className="stc-tv-btn"
          onClick={e => { e.stopPropagation(); open(`https://www.tradingview.com/chart/?symbol=${t}`); }}
          title="TradingView'de Aç"
        >↗</button>
        <button className="stc-remove" onClick={e => { e.stopPropagation(); onRemove(group.id, t); }} title={`Remove ${t}`}>×</button>
      </div>
    );
  });
}

export default function StockChart({ groups, saveGroups, activeTicker, setActiveTicker }) {
  const [quotes, setQuotes] = useState({});
  // Picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerGroupId, setPickerGroupId] = useState(null); // hangi gruba eklenecek
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerHighlight, setPickerHighlight] = useState(-1);
  const [pickerCat, setPickerCat] = useState('all');
  const pickerDropdownRef = useRef(null);
  const addBtnRef = useRef(null);
  const pickerListRef = useRef(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  // Drag state
  const [dragOver, setDragOver] = useState(null);
  const dragState = useRef(null);
  // Group rename
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');

  // Tüm ticker'ları çek
  const allTickers = [...new Set(groups.flatMap(g => g.tickers))];

  const loadAll = useCallback(() => {
    allTickers.forEach(t => {
      setQuotes(prev => {
        const cur = prev[t];
        const hasData = cur && cur !== 'loading' && cur !== 'error';
        return { ...prev, [t]: hasData ? cur : 'loading' };
      });
      fetchQuote(t)
        .then(q => setQuotes(prev => ({ ...prev, [t]: q })))
        .catch(() => setQuotes(prev => ({ ...prev, [t]: 'error' })));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(allTickers)]);

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadAll]);

  // Cancel drag globally
  useEffect(() => {
    const cancel = () => { dragState.current = null; setDragOver(null); };
    window.addEventListener('pointerup', cancel);
    return () => window.removeEventListener('pointerup', cancel);
  }, []);

  // Close picker on outside click (dropdown + grup + butonlar hariç)
  useEffect(() => {
    const handler = (e) => {
      if (!showPicker) return;
      if (pickerDropdownRef.current && pickerDropdownRef.current.contains(e.target)) return;
      // grup + butonlarına tıklamak kapatmasın — closest ile kontrol
      if (e.target.closest?.('.stc-group-add-btn')) return;
      closePicker();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const closePicker = () => { setShowPicker(false); setPickerSearch(''); setPickerCat('all'); setPickerHighlight(-1); setPickerGroupId(null); };

  // --- Group ops ---
  const addGroup = () => {
    const next = [...groups, { id: crypto.randomUUID(), name: 'Yeni Liste', tickers: [] }];
    saveGroups(next);
  };

  const deleteGroup = (gid) => {
    if (groups.length <= 1) return; // en az 1 grup kalsın
    const g = groups.find(x => x.id === gid);
    if (g) g.tickers.forEach(t => { if (activeTicker === t) setActiveTicker('all'); });
    saveGroups(groups.filter(x => x.id !== gid));
  };

  const renameGroup = (gid, name) => {
    saveGroups(groups.map(g => g.id === gid ? { ...g, name } : g));
  };

  const removeTicker = (gid, t) => {
    saveGroups(groups.map(g => g.id === gid ? { ...g, tickers: g.tickers.filter(x => x !== t) } : g));
    if (activeTicker === t) setActiveTicker('all');
  };

  // Sürükle-bırak: swap (aynı grup) veya gruplar arası taşıma
  const handleDrop = (fromGroupId, fromIdx, fromTicker, toGroupId, toIdx) => {
    if (fromGroupId === toGroupId) {
      // Aynı grup: swap
      saveGroups(groups.map(g => {
        if (g.id !== fromGroupId) return g;
        const next = [...g.tickers];
        [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
        return { ...g, tickers: next };
      }));
    } else {
      // Farklı grup: from'dan çıkar, to'ya ekle
      saveGroups(groups.map(g => {
        if (g.id === fromGroupId) return { ...g, tickers: g.tickers.filter(t => t !== fromTicker) };
        if (g.id === toGroupId) {
          const next = [...g.tickers];
          next.splice(toIdx, 0, fromTicker);
          return { ...g, tickers: next };
        }
        return g;
      }));
      if (activeTicker === fromTicker) setActiveTicker('all');
    }
  };

  // --- Picker ---
  const openPicker = (gid, btnEl) => {
    const r = btnEl.getBoundingClientRect();
    const dropW = 260;
    let left = r.right - dropW;
    if (left < 4) left = 4;
    setPickerPos({ top: r.bottom + 4, left });
    setPickerGroupId(gid);
    setShowPicker(true);
  };

  const groupTickers = groups.find(g => g.id === pickerGroupId)?.tickers ?? [];

  const toggleTicker = (t) => {
    if (!pickerGroupId) return;
    const g = groups.find(x => x.id === pickerGroupId);
    if (!g) return;
    if (g.tickers.includes(t)) {
      saveGroups(groups.map(x => x.id === pickerGroupId ? { ...x, tickers: x.tickers.filter(tt => tt !== t) } : x));
      if (activeTicker === t) setActiveTicker('all');
    } else {
      saveGroups(groups.map(x => x.id === pickerGroupId ? { ...x, tickers: [...x.tickers, t] } : x));
      closePicker();
    }
  };

  const uniqueStocks = POPULAR_STOCKS.filter((s, idx, arr) => arr.findIndex(x => x.ticker === s.ticker) === idx);
  const filteredStocks = uniqueStocks.filter(s => {
    const q = pickerSearch.toLowerCase();
    const matchCat = pickerCat === 'all' || s.cat === pickerCat;
    const matchQ = !q || s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    return matchCat && matchQ;
  });
  const searchTrimmed = pickerSearch.trim().toUpperCase();
  const isCustom = searchTrimmed.length > 0 && !uniqueStocks.some(s => s.ticker === searchTrimmed);

  const addCustomTicker = () => {
    if (!searchTrimmed || !pickerGroupId) return;
    const g = groups.find(x => x.id === pickerGroupId);
    if (!g || g.tickers.includes(searchTrimmed)) return;
    saveGroups(groups.map(x => x.id === pickerGroupId ? { ...x, tickers: [...x.tickers, searchTrimmed] } : x));
    closePicker();
  };

  const handlePickerKeyDown = (e) => {
    if (!showPicker) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPickerHighlight(prev => { const next = Math.min(prev + 1, filteredStocks.length - 1); scrollPickerItem(next); return next; });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPickerHighlight(prev => { const next = Math.max(prev - 1, 0); scrollPickerItem(next); return next; });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (pickerHighlight >= 0 && pickerHighlight < filteredStocks.length) toggleTicker(filteredStocks[pickerHighlight].ticker);
      else if (isCustom) addCustomTicker();
    } else if (e.key === 'Escape') {
      closePicker();
    }
  };

  const scrollPickerItem = (idx) => {
    if (!pickerListRef.current) return;
    const items = pickerListRef.current.querySelectorAll('.stc-picker-item');
    if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
  };

  const hasAnyTicker = groups.some(g => g.tickers.length > 0);

  return (
    <div className="stock-ticker-bar">
      {/* Global toolbar */}
      <div className="stc-toolbar">
        <button className="stc-add-group-btn" onClick={addGroup} title="Add group">+ Group</button>
        <button className="stock-ticker-refresh" onClick={loadAll} title="Refresh">↻</button>
      </div>

      {/* Groups */}
      <div className="stc-list">
        {groups.map(group => (
          <div
            key={group.id}
            className="stc-group"
            onPointerEnter={() => {
              if (dragState.current?.moved && group.tickers.length === 0) {
                setDragOver({ groupId: group.id, idx: 0 });
              }
            }}
            onPointerUp={() => {
              if (!dragState.current?.moved) return;
              if (group.tickers.length === 0) {
                const { groupId: fromGroupId, idx: fromIdx, ticker: fromTicker } = dragState.current;
                dragState.current = null;
                setDragOver(null);
                handleDrop(fromGroupId, fromIdx, fromTicker, group.id, 0);
              }
            }}
          >
            {/* Group header */}
            <div className="stc-group-header" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
              {renamingId === group.id ? (
                <input
                  className="stc-group-name-input"
                  style={{ userSelect: 'text' }}
                  value={renameVal}
                  autoFocus
                  onChange={e => setRenameVal(e.target.value)}
                  onBlur={() => { renameGroup(group.id, renameVal || group.name); setRenamingId(null); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { renameGroup(group.id, renameVal || group.name); setRenamingId(null); }
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                />
              ) : (
                <span
                  className="stc-group-name"
                  onDoubleClick={() => { setRenamingId(group.id); setRenameVal(group.name); }}
                  title="Double-click to rename"
                >{group.name}</span>
              )}
              <div className="stc-group-actions">
                <button
                  className="stc-group-add-btn"
                  ref={pickerGroupId === group.id ? addBtnRef : null}
                  onClick={e => {
                    if (showPicker && pickerGroupId === group.id) { closePicker(); }
                    else { openPicker(group.id, e.currentTarget); }
                  }}
                  title="Add symbol"
                >+</button>
                {groups.length > 1 && (
                  <button className="stc-group-del-btn" onClick={() => deleteGroup(group.id)} title="Delete group">×</button>
                )}
              </div>
            </div>

            {/* Rows */}
            {group.tickers.length === 0 && (
              <span className="stc-empty stc-group-empty">Click + to add symbols</span>
            )}
            <GroupRows
              group={group}
              quotes={quotes}
              activeTicker={activeTicker}
              setActiveTicker={setActiveTicker}
              dragState={dragState}
              dragOver={dragOver}
              setDragOver={setDragOver}
              onRemove={removeTicker}
              onDrop={handleDrop}
            />
          </div>
        ))}
      </div>

      {/* Picker dropdown */}
      {showPicker && (
        <div ref={pickerDropdownRef} className="stc-picker-dropdown stc-picker-dropdown--portal" style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.left, zIndex: 9999 }}>
          <input
            className="stc-picker-search"
            placeholder="Search or enter ticker... (AAPL, GC=F, BTC-USD)"
            value={pickerSearch}
            onChange={e => { setPickerSearch(e.target.value); setPickerHighlight(-1); }}
            onKeyDown={handlePickerKeyDown}
            autoFocus
          />
          <div className="stc-picker-cats">
            {PICKER_CATS.map(c => (
              <button
                key={c.key}
                className={`stc-picker-cat ${pickerCat === c.key ? 'active' : ''}`}
                onMouseDown={e => { e.preventDefault(); setPickerCat(c.key); setPickerHighlight(-1); }}
              >{c.label}</button>
            ))}
          </div>
          <div className="stc-picker-list" ref={pickerListRef}>
            {isCustom && (
              <button className="stc-picker-item stc-picker-custom" onMouseDown={e => { e.preventDefault(); addCustomTicker(); }}>
                <span className="stc-picker-ticker">{searchTrimmed}</span>
                <span className="stc-picker-name">Add custom ticker</span>
                <span className="stc-picker-add-icon">+</span>
              </button>
            )}
            {pickerCat === 'all' && !pickerSearch
              ? PICKER_CATS.filter(c => c.key !== 'all').map(cat => {
                  const items = filteredStocks.filter(s => s.cat === cat.key);
                  if (items.length === 0) return null;
                  const groupOffset = PICKER_CATS.filter(c => c.key !== 'all')
                    .slice(0, PICKER_CATS.filter(c => c.key !== 'all').findIndex(c => c.key === cat.key))
                    .reduce((acc, c) => acc + filteredStocks.filter(s => s.cat === c.key).length, 0);
                  return (
                    <div key={cat.key} className="stc-picker-group">
                      <div className="stc-picker-group-label">{cat.label}</div>
                      {items.map((s, i) => {
                        const flatIdx = groupOffset + i;
                        return (
                          <button
                            key={s.ticker}
                            className={`stc-picker-item ${groupTickers.includes(s.ticker) ? 'selected' : ''} ${flatIdx === pickerHighlight ? 'highlighted' : ''}`}
                            onMouseDown={e => { e.preventDefault(); toggleTicker(s.ticker); }}
                            onMouseEnter={() => setPickerHighlight(flatIdx)}
                          >
                            <span className="stc-picker-ticker">{s.ticker}</span>
                            <span className="stc-picker-name">{s.name}</span>
                            {groupTickers.includes(s.ticker) && <span className="stc-picker-check">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              : filteredStocks.map((s, idx) => (
                  <button
                    key={s.ticker}
                    className={`stc-picker-item ${groupTickers.includes(s.ticker) ? 'selected' : ''} ${idx === pickerHighlight ? 'highlighted' : ''}`}
                    onMouseDown={e => { e.preventDefault(); toggleTicker(s.ticker); }}
                    onMouseEnter={() => setPickerHighlight(idx)}
                  >
                    <span className="stc-picker-ticker">{s.ticker}</span>
                    <span className="stc-picker-name">{s.name}</span>
                    {groupTickers.includes(s.ticker) && <span className="stc-picker-check">✓</span>}
                  </button>
                ))
            }
          </div>
        </div>
      )}
    </div>
  );
}
