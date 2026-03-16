import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { open } from '@tauri-apps/plugin-shell';

const REFRESH_INTERVAL = 15 * 60 * 1000;
const STORAGE_KEY = 'stock_seen_news';
const FAVS_KEY = 'stock_favs';
const TICKERS_KEY = 'stock_tickers';

const DEFAULT_TICKERS = ['NBIS'];

// Popular stocks for the searchable picker
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
  { ticker: 'AMZN',  name: 'Amazon' },
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
  { ticker: 'QBTS',  name: 'D-Wave Quantum' },
  { ticker: 'RGTI',  name: 'Rigetti' },
  { ticker: 'SOUN',  name: 'SoundHound' },
  { ticker: 'BBAI',  name: 'BigBear.ai' },
  { ticker: 'BTBT',  name: 'Bit Digital' },
  { ticker: 'MARA',  name: 'Marathon Digital' },
  { ticker: 'RIOT',  name: 'Riot Platforms' },
  { ticker: 'CLSK',  name: 'CleanSpark' },
  { ticker: 'HIMS',  name: 'Hims & Hers' },
  { ticker: 'CELH',  name: 'Celsius Holdings' },
  { ticker: 'SHOP',  name: 'Shopify' },
  { ticker: 'SQ',    name: 'Block (Square)' },
  { ticker: 'PYPL',  name: 'PayPal' },
  { ticker: 'UBER',  name: 'Uber' },
  { ticker: 'LYFT',  name: 'Lyft' },
  { ticker: 'ABNB',  name: 'Airbnb' },
  { ticker: 'DASH',  name: 'DoorDash' },
  { ticker: 'SPOT',  name: 'Spotify' },
  { ticker: 'RBLX',  name: 'Roblox' },
  { ticker: 'U',     name: 'Unity' },
  { ticker: 'PATH',  name: 'UiPath' },
  { ticker: 'AI',    name: 'C3.ai' },
  { ticker: 'GTLB',  name: 'GitLab' },
  { ticker: 'MDB',   name: 'MongoDB' },
  { ticker: 'NET',   name: 'Cloudflare' },
  { ticker: 'ZS',    name: 'Zscaler' },
  { ticker: 'DDOG',  name: 'Datadog' },
  { ticker: 'TEAM',  name: 'Atlassian' },
  { ticker: 'NOW',   name: 'ServiceNow' },
  { ticker: 'CRM',   name: 'Salesforce' },
  { ticker: 'ORCL',  name: 'Oracle' },
  { ticker: 'SAP',   name: 'SAP' },
  { ticker: 'IBM',   name: 'IBM' },
  { ticker: 'DELL',  name: 'Dell' },
  { ticker: 'HPQ',   name: 'HP Inc.' },
  { ticker: 'TSM',   name: 'TSMC' },
  { ticker: 'ASML',  name: 'ASML' },
  { ticker: 'QCOM',  name: 'Qualcomm' },
  { ticker: 'AVGO',  name: 'Broadcom' },
  { ticker: 'TXN',   name: 'Texas Instruments' },
  { ticker: 'MU',    name: 'Micron' },
  { ticker: 'WDC',   name: 'Western Digital' },
  { ticker: 'JPM',   name: 'JPMorgan' },
  { ticker: 'GS',    name: 'Goldman Sachs' },
  { ticker: 'BAC',   name: 'Bank of America' },
  { ticker: 'MS',    name: 'Morgan Stanley' },
  { ticker: 'V',     name: 'Visa' },
  { ticker: 'MA',    name: 'Mastercard' },
  { ticker: 'BRK.B', name: 'Berkshire B' },
  { ticker: 'JNJ',   name: 'Johnson & Johnson' },
  { ticker: 'PFE',   name: 'Pfizer' },
  { ticker: 'MRNA',  name: 'Moderna' },
  { ticker: 'LLY',   name: 'Eli Lilly' },
  { ticker: 'ABBV',  name: 'AbbVie' },
  { ticker: 'XOM',   name: 'ExxonMobil' },
  { ticker: 'CVX',   name: 'Chevron' },
  { ticker: 'BA',    name: 'Boeing' },
  { ticker: 'LMT',   name: 'Lockheed Martin' },
  { ticker: 'GE',    name: 'GE Aerospace' },
  { ticker: 'SPCE',  name: 'Virgin Galactic' },
  { ticker: 'LCID',  name: 'Lucid Motors' },
  { ticker: 'RIVN',  name: 'Rivian' },
  { ticker: 'F',     name: 'Ford' },
  { ticker: 'GM',    name: 'General Motors' },
  { ticker: 'NIO',   name: 'NIO' },
  { ticker: 'BYD',   name: 'BYD' },
  { ticker: 'BABA',  name: 'Alibaba' },
  { ticker: 'JD',    name: 'JD.com' },
  { ticker: 'PDD',   name: 'PDD Holdings' },
  { ticker: 'TCEHY', name: 'Tencent' },
  { ticker: 'BTC-USD', name: 'Bitcoin' },
  { ticker: 'ETH-USD', name: 'Ethereum' },
  { ticker: 'IREN',   name: 'IREN' },
  { ticker: 'RKLB',   name: 'Rocket Lab' },
];

function getGoogleNewsUrl(ticker) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(ticker)}+stock&hl=en-US&gl=US&ceid=US:en`;
}

function parseRssXml(xml, ticker) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const items = Array.from(doc.querySelectorAll('item'));
    return items.slice(0, 30).map((item, i) => {
      const title = item.querySelector('title')?.textContent || '';
      const link = item.querySelector('link')?.textContent || '';
      const pubDate = item.querySelector('pubDate')?.textContent || '';
      const source = item.querySelector('source')?.textContent || 'Google News';
      const guid = item.querySelector('guid')?.textContent || `${ticker}_${i}`;
      return {
        id: `${ticker}_${guid}`,
        title: title.replace(/ - [^-]+$/, ''), // remove source suffix
        link,
        date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source,
        ticker,
        provider: 'Google News',
      };
    });
  } catch {
    return [];
  }
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function playNewsSound() {
  try {
    const AudioCtx = /** @type {typeof AudioContext} */ (window.AudioContext || window['webkitAudioContext']);
    const ctx = new AudioCtx();
    // İki kısa bip — dikkat çekici ama rahatsız etmez
    const beep = (freq, startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.25, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    beep(880, ctx.currentTime, 0.12);
    beep(1100, ctx.currentTime + 0.16, 0.10);
  } catch {}
}

async function fetchTickerNews(ticker) {
  const text = await invoke('fetch_rss', { url: getGoogleNewsUrl(ticker) });
  return parseRssXml(text, ticker);
}

async function fetchAllNews(tickers) {
  if (!tickers || tickers.length === 0) return [];
  const results = await Promise.allSettled(tickers.map(fetchTickerNews));
  results.forEach((r, i) => { if (r.status === 'rejected') console.error('News fetch failed for', tickers[i], r.reason); });
  const all = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);
  // Deduplicate by title similarity across tickers
  const seen = new Set();
  const unique = all.filter(item => {
    const key = item.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => new Date(b.date) - new Date(a.date));
  return unique;
}

async function fetchAiComment(title, tickers) {
  const key = localStorage.getItem('anthropic_api_key');
  if (!key) throw new Error('NO_KEY');
  const tickerCtx = tickers && tickers.length > 0 ? `Related tickers: ${tickers.join(', ')}\n` : '';
  const bodyStr = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `${tickerCtx}Hisse senedi haberi başlığı: "${title}"\n\nBu haberi ${tickers && tickers.length > 0 ? tickers.join(', ') + ' hissesi' : 'ilgili hisse'} açısından yatırımcı bakış açısıyla analiz et. Şu formatta JSON yanıt ver (başka hiçbir şey yazma, sadece JSON):\n{"yorum":"2 cümle Türkçe yorum, haberin ne anlama geldiğini açıkla","detay":"Varsa ekstra önemli bağlam veya dikkat edilmesi gereken nokta (max 1 cümle), yoksa boş string"}`
    }]
  });
  const text = await invoke('fetch_post', {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: bodyStr,
  });
  const data = JSON.parse(text);
  if (data.error) throw new Error(data.error.message);
  const raw = data.content[0].text.trim();
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  return JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
}

const SN_SIZES = ['S', 'M', 'L'];

export default function StockNews({ tickers, setTickers, activeTicker, setActiveTicker, onSizeChange }) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerRef = useRef(null);
  const [snSize, setSnSize] = useState(() => localStorage.getItem('sn_size') || 'M');
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const sizeMenuRef = useRef(null);
  const sizeBtnRef = useRef(null);
  const [sizeMenuPos, setSizeMenuPos] = useState({ top: 0, right: 0 });

  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [favs, setFavs] = useState(() => new Set(JSON.parse(localStorage.getItem(FAVS_KEY) || '[]')));
  const seenRef = useRef(new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')));
  const isFirstLoad = useRef(true);
  // AI yorumları: { [itemId]: { status: 'loading'|'done'|'error', text: string } }
  const [aiComments, setAiComments] = useState({});

  const requestAiComment = async (item, e) => {
    e.stopPropagation();
    const id = item.id;
    if (aiComments[id]?.status === 'loading') return;
    // toggle: eğer zaten gösteriliyorsa kapat
    if (aiComments[id]?.status === 'done') {
      setAiComments(prev => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    setAiComments(prev => ({ ...prev, [id]: { status: 'loading', text: '' } }));
    try {
      const text = await fetchAiComment(item.title, item.tickers);
      setAiComments(prev => ({ ...prev, [id]: { status: 'done', text } }));
    } catch (err) {
      const msg = err?.message === 'NO_KEY'
        ? 'API key missing (Flash Cards > 🔑)'
        : `Error: ${err?.message || 'Unknown error'}`;
      setAiComments(prev => ({ ...prev, [id]: { status: 'error', text: msg } }));
    }
  };

  const saveTickers = (next) => {
    localStorage.setItem(TICKERS_KEY, JSON.stringify(next));
    setTickers(next);
  };


  const toggleTicker = (t) => {
    if (tickers.includes(t)) {
      const next = tickers.filter(x => x !== t);
      saveTickers(next);
      if (activeTicker === t) setActiveTicker('all');
    } else {
      saveTickers([...tickers, t]);
      setShowPicker(false);
      setPickerSearch('');
    }
  };

  // Close picker / size menu on outside click
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

  const removeTicker = (t, e) => {
    e.stopPropagation();
    const next = tickers.filter(x => x !== t);
    saveTickers(next);
    if (activeTicker === t) setActiveTicker('all');
  };

  const toggleFav = (id, e) => {
    e.stopPropagation();
    setFavs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(FAVS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const notifyNew = async (newItems) => {
    if (newItems.length === 0) return;
    newItems.forEach(n => seenRef.current.add(n.id));
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seenRef.current].slice(-500)));
    playNewsSound();
    let granted = await isPermissionGranted();
    if (!granted) { const perm = await requestPermission(); granted = perm === 'granted'; }
    if (granted) {
      for (const item of newItems.slice(0, 2)) {
        sendNotification({
          title: item.ticker,
          body: item.title,
        });
      }
    }
  };

  const load = useCallback(async (notify = false) => {
    try {
      setError(null);
      const activeTickers = tickers && tickers.length > 0 ? tickers : DEFAULT_TICKERS;
      const items = await fetchAllNews(activeTickers);
      const newItems = items.filter(n => !seenRef.current.has(n.id));
      setNews(items);
      setLastUpdated(new Date());
      if (notify && newItems.length > 0) await notifyNew(newItems);
      if (isFirstLoad.current) {
        items.forEach(n => seenRef.current.add(n.id));
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...seenRef.current].slice(-500)));
        isFirstLoad.current = false;
      }
    } catch (e) {
      setError('Could not load news: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }, [tickers]);

  useEffect(() => {
    setLoading(true);
    isFirstLoad.current = true;
    load(false);
    const interval = setInterval(() => load(true), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = useMemo(() => {
    let items = news;
    if (activeTicker !== 'all') items = items.filter(n => n.ticker === activeTicker);
    if (filter === 'favorites') items = items.filter(n => favs.has(n.id));
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(n => n.title.toLowerCase().includes(q) || n.ticker.toLowerCase().includes(q));
    }
    return items;
  }, [news, activeTicker, filter, search, favs]);

  const favCount = useMemo(() => news.filter(n => favs.has(n.id)).length, [news, favs]);

  return (
    <div className={`stock-news-column sn-size-${snSize.toLowerCase()}`}>
      {/* Header */}
      <div className="stock-news-header">
        <span className="stock-news-label">Stock News</span>
        <div className="stock-news-picker-wrap" ref={pickerRef}>
          <input
            className="stock-news-picker-search"
            placeholder="+ Add ticker..."
            value={pickerSearch}
            onChange={e => setPickerSearch(e.target.value)}
            onFocus={() => setShowPicker(true)}
          />
          {showPicker && (
            <div className="stock-news-picker-dropdown">
              {POPULAR_STOCKS
                .filter((s, idx, arr) => arr.findIndex(x => x.ticker === s.ticker) === idx)
                .filter(s => {
                  const q = pickerSearch.toLowerCase();
                  return !q || s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
                })
                .map(s => (
                  <button
                    key={s.ticker}
                    className={`stock-news-picker-item ${tickers.includes(s.ticker) ? 'selected' : ''}`}
                    onMouseDown={e => { e.preventDefault(); toggleTicker(s.ticker); }}
                    title={s.name}
                  >
                    <span className="stock-news-picker-ticker">{s.ticker}</span>
                    <span className="stock-news-picker-name">{s.name}</span>
                    {tickers.includes(s.ticker) && <span className="stock-news-picker-check">✓</span>}
                  </button>
                ))
              }
            </div>
          )}
        </div>
        <div className="stock-news-meta">
          {lastUpdated && <span className="stock-news-updated">{timeAgo(lastUpdated)}</span>}
          <div className="sn-size-wrap">
            <button
              className={`sn-size-toggle ${showSizeMenu ? 'active' : ''}`}
              ref={sizeBtnRef}
              onClick={() => {
                if (!showSizeMenu && sizeBtnRef.current) {
                  const r = sizeBtnRef.current.getBoundingClientRect();
                  setSizeMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
                }
                setShowSizeMenu(p => !p);
              }}
              title="Text size"
            >{snSize}</button>
            {showSizeMenu && createPortal(
              <div ref={sizeMenuRef} className="sn-size-menu" style={{ position: 'fixed', top: sizeMenuPos.top, right: sizeMenuPos.right, left: 'auto', zIndex: 99999 }}>
                {SN_SIZES.map(s => (
                  <button
                    key={s}
                    className={`sn-size-menu-item ${snSize === s ? 'active' : ''}`}
                    onClick={() => { setSnSize(s); localStorage.setItem('sn_size', s); setShowSizeMenu(false); if (onSizeChange) onSizeChange(s); }}
                  >{s}</button>
                ))}
              </div>,
              document.body
            )}
          </div>
          <button
            className="stock-news-refresh-btn"
            onClick={() => { setLoading(true); load(true); }}
            title="Refresh"
          >↻</button>
        </div>
      </div>

      {/* Ticker tabs */}
      <div className="stock-news-ticker-tabs">
        <button
          className={`stock-news-ticker-tab ${activeTicker === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTicker('all')}
        >All</button>
        {tickers.map(t => (
          <span key={t} className={`stock-news-ticker-tab ${activeTicker === t ? 'active' : ''}`}>
            <span onClick={() => setActiveTicker(t)}>{t}</span>
            <button
              className="stock-news-tab-remove"
              onClick={e => removeTicker(t, e)}
              title={`Remove ${t}`}
            >×</button>
          </span>
        ))}
      </div>

      {/* Search */}
      <div className="stock-news-search-row">
        <input
          className="stock-news-search"
          placeholder="Search news..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Filters */}
      <div className="stock-news-filters">
        {[
          { key: 'all', label: 'All' },
          { key: 'favorites', label: `★ Saved${favCount > 0 ? ` (${favCount})` : ''}` },
        ].map(f => (
          <button
            key={f.key}
            className={`stock-news-filter-btn ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >{f.label}</button>
        ))}
      </div>

      {/* List */}
      <div className="stock-news-list">
        {loading && (
          <div className="stock-news-loading">
            <span className="stock-news-spinner" />
            Loading...
          </div>
        )}
        {error && <div className="stock-news-error">{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="stock-news-empty">No news found</div>
        )}
        {!loading && !error && filtered.map((item, i) => (
          <div
            key={item.id || i}
            className={`stock-news-item ${!seenRef.current.has(item.id) ? 'stock-news-item--unread' : ''}`}
          >
            <div className="stock-news-item-top">
              <span
                className="stock-news-item-title"
                onClick={() => {
                  seenRef.current.add(item.id);
                  localStorage.setItem(STORAGE_KEY, JSON.stringify([...seenRef.current].slice(-500)));
                  open(item.link).catch(() => {});
                }}
                style={{ cursor: 'pointer' }}
              >{item.title}</span>
              <div className="stock-news-item-actions">
                <button
                  className={`stock-news-ai-btn ${aiComments[item.id]?.status === 'done' ? 'active' : ''}`}
                  onClick={e => requestAiComment(item, e)}
                  title="AI yorumu"
                >
                  {aiComments[item.id]?.status === 'loading'
                    ? <span className="stock-news-ai-spinner" />
                    : 'AI'}
                </button>
                <button
                  className={`stock-news-fav-btn ${favs.has(item.id) ? 'active' : ''}`}
                  onClick={e => toggleFav(item.id, e)}
                  title={favs.has(item.id) ? 'Remove from saved' : 'Save'}
                >★</button>
              </div>
            </div>
            <div className="stock-news-item-meta">
              <span className="stock-news-item-ticker-badge">{item.ticker}</span>
              <span className="stock-news-item-time">{timeAgo(item.date)}</span>
            </div>
            {aiComments[item.id] && aiComments[item.id].status !== 'loading' && (
              <div className={`stock-news-ai-comment ${aiComments[item.id].status}`}>
                {aiComments[item.id].status === 'error' ? (
                  <span>{aiComments[item.id].text}</span>
                ) : (
                  <>
                    <div className="sn-ai-yorum">{aiComments[item.id].text.yorum}</div>
                    {aiComments[item.id].text.detay && (
                      <div className="sn-ai-detay">{aiComments[item.id].text.detay}</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
