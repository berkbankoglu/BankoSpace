import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './Stocks.css';
import { invoke } from '@tauri-apps/api/core';
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { open } from '@tauri-apps/plugin-shell';

const REFRESH_INTERVAL = 15 * 60 * 1000;
const STORAGE_KEY = 'stock_seen_news';
const FAVS_KEY = 'stock_favs';
const TICKERS_KEY = 'stock_tickers';
const DEFAULT_TICKERS = ['NBIS'];

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
  { ticker: 'QBTS',  name: 'D-Wave Quantum' },
  { ticker: 'RGTI',  name: 'Rigetti' },
  { ticker: 'SOUN',  name: 'SoundHound' },
  { ticker: 'BBAI',  name: 'BigBear.ai' },
  { ticker: 'MARA',  name: 'Marathon Digital' },
  { ticker: 'RIOT',  name: 'Riot Platforms' },
  { ticker: 'CLSK',  name: 'CleanSpark' },
  { ticker: 'HIMS',  name: 'Hims & Hers' },
  { ticker: 'SHOP',  name: 'Shopify' },
  { ticker: 'SQ',    name: 'Block (Square)' },
  { ticker: 'PYPL',  name: 'PayPal' },
  { ticker: 'UBER',  name: 'Uber' },
  { ticker: 'ABNB',  name: 'Airbnb' },
  { ticker: 'SPOT',  name: 'Spotify' },
  { ticker: 'NET',   name: 'Cloudflare' },
  { ticker: 'DDOG',  name: 'Datadog' },
  { ticker: 'CRM',   name: 'Salesforce' },
  { ticker: 'ORCL',  name: 'Oracle' },
  { ticker: 'JPM',   name: 'JPMorgan' },
  { ticker: 'GS',    name: 'Goldman Sachs' },
  { ticker: 'BAC',   name: 'Bank of America' },
  { ticker: 'RIVN',  name: 'Rivian' },
  { ticker: 'NIO',   name: 'NIO' },
  { ticker: 'BABA',  name: 'Alibaba' },
  { ticker: 'IREN',  name: 'IREN' },
  { ticker: 'TSM',   name: 'TSMC' },
  { ticker: 'ASML',  name: 'ASML' },
  { ticker: 'QCOM',  name: 'Qualcomm' },
  { ticker: 'AVGO',  name: 'Broadcom' },
  { ticker: 'MU',    name: 'Micron' },
  { ticker: 'V',     name: 'Visa' },
  { ticker: 'MA',    name: 'Mastercard' },
  { ticker: 'LLY',   name: 'Eli Lilly' },
  { ticker: 'BA',    name: 'Boeing' },
  { ticker: 'BTC-USD', name: 'Bitcoin' },
  { ticker: 'ETH-USD', name: 'Ethereum' },
];

// Preset colors for tickers — cycles through palette
const TICKER_PALETTE = [
  '#58a6ff', '#3fb950', '#f0883e', '#a371f7',
  '#ff7b72', '#e3b341', '#39d353', '#79c0ff',
];
const tickerColorCache = {};
let paletteIdx = 0;
function getTickerColor(ticker) {
  if (!tickerColorCache[ticker]) {
    tickerColorCache[ticker] = TICKER_PALETTE[paletteIdx % TICKER_PALETTE.length];
    paletteIdx++;
  }
  return tickerColorCache[ticker];
}

const TICKER_KEYWORDS = {
  AAPL: ['Apple'], MSFT: ['Microsoft'], GOOGL: ['Alphabet', 'Google'], AMZN: ['Amazon'],
  NVDA: ['Nvidia', 'NVIDIA'], META: ['Meta'], TSLA: ['Tesla'], AMD: ['AMD'],
  INTC: ['Intel'], NFLX: ['Netflix'], PLTR: ['Palantir'], CRWD: ['CrowdStrike'],
  SNOW: ['Snowflake'], MSTR: ['MicroStrategy', 'Strategy'], COIN: ['Coinbase'],
  HOOD: ['Robinhood'], RKLB: ['Rocket Lab'], IONQ: ['IonQ'], SOUN: ['SoundHound'],
  MARA: ['Marathon Digital', 'Marathon'], RIOT: ['Riot Platforms', 'Riot'],
  SHOP: ['Shopify'], PYPL: ['PayPal'], UBER: ['Uber'], SPOT: ['Spotify'],
  NET: ['Cloudflare'], DDOG: ['Datadog'], CRM: ['Salesforce'], ORCL: ['Oracle'],
  JPM: ['JPMorgan'], GS: ['Goldman Sachs'], BAC: ['Bank of America'],
  RIVN: ['Rivian'], LCID: ['Lucid'], NIO: ['NIO'], BABA: ['Alibaba'],
  NBIS: ['Nebius'], IREN: ['IREN'],
};

const TV_FEED_URL = 'https://news-headlines.tradingview.com/v2/headlines?client=web&lang=en';

function getSeekingAlphaUrl(ticker) {
  return `https://seekingalpha.com/api/sa/combined/${encodeURIComponent(ticker)}.xml`;
}
function getYahooFinanceUrl(ticker) {
  return `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;
}

function parseYahooRss(xml, ticker) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const items = Array.from(doc.querySelectorAll('item'));
    return items.slice(0, 15).map((item, i) => {
      const title = item.querySelector('title')?.textContent || '';
      const link = item.querySelector('link')?.textContent || '';
      const pubDate = item.querySelector('pubDate')?.textContent || '';
      const description = item.querySelector('description')?.textContent?.replace(/<[^>]*>/g, '').trim() || '';
      return {
        id: `yf_${ticker}_${i}_${pubDate ? new Date(pubDate).getTime() : i}`,
        title, description, link,
        date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'Yahoo Finance', ticker, provider: 'Yahoo',
      };
    });
  } catch { return []; }
}

function parseSeekingAlphaXml(xml, ticker) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const items = Array.from(doc.querySelectorAll('item'));
    return items.slice(0, 20).map((item, i) => {
      const title = item.querySelector('title')?.textContent || '';
      const pubDate = item.querySelector('pubDate')?.textContent || '';
      const guid = item.querySelector('guid')?.textContent || `sa_${ticker}_${i}`;
      const link = `https://seekingalpha.com/symbol/${ticker}/news`;
      const rawDesc = item.querySelector('description')?.textContent || '';
      const description = rawDesc.replace(/<[^>]*>/g, '').trim();
      return {
        id: `sa_${ticker}_${guid}`,
        title, description, link,
        date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'Seeking Alpha', ticker, provider: 'SeekingAlpha',
      };
    });
  } catch { return []; }
}

function parseTvFeed(data, tickers) {
  try {
    const items = data.items || [];
    const results = [];
    const tickerSet = new Set(tickers.map(t => t.toUpperCase()));
    const keywordMap = {};
    tickers.forEach(t => {
      (TICKER_KEYWORDS[t.toUpperCase()] || []).forEach(kw => { keywordMap[kw] = t; });
    });
    for (const item of items) {
      const relSymbols = (item.relatedSymbols || []).map(r => r.symbol || '');
      let matchedTicker = null;
      for (const sym of relSymbols) {
        const bare = sym.split(':').pop().toUpperCase();
        if (tickerSet.has(bare)) { matchedTicker = bare; break; }
      }
      if (!matchedTicker) {
        for (const [kw, t] of Object.entries(keywordMap)) {
          if (item.title.includes(kw)) { matchedTicker = t; break; }
        }
      }
      if (!matchedTicker) continue;
      results.push({
        id: `tv_${item.id}`,
        title: item.title || '',
        description: '',
        link: item.storyPath ? `https://www.tradingview.com${item.storyPath}` : '',
        date: item.published ? new Date(item.published * 1000).toISOString() : new Date().toISOString(),
        source: item.source || 'TradingView',
        ticker: matchedTicker,
        provider: 'TradingView',
      });
    }
    return results;
  } catch { return []; }
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function playNewsSound() {
  try {
    const AudioCtx = window.AudioContext || window['webkitAudioContext'];
    const ctx = new AudioCtx();
    const beep = (freq, startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = 'sine';
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.25, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime); osc.stop(startTime + duration);
    };
    beep(880, ctx.currentTime, 0.12);
    beep(1100, ctx.currentTime + 0.16, 0.10);
  } catch {}
}

// Geniş market feed listesi — çok kaynak = çok güncel haber
const MARKET_FEEDS = [
  // Yahoo Finance — büyük indeksler
  { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US', source: 'Yahoo Finance' },
  { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EIXIC&region=US&lang=en-US', source: 'Yahoo Finance' },
  { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EDJI&region=US&lang=en-US',  source: 'Yahoo Finance' },
  { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5ETNX&region=US&lang=en-US',  source: 'Yahoo Finance' },
  { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=GC%3DF&region=US&lang=en-US',  source: 'Yahoo Finance' },
  { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=CL%3DF&region=US&lang=en-US',  source: 'Yahoo Finance' },
  { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=BTC-USD&region=US&lang=en-US', source: 'Yahoo Finance' },
  // Benzinga — çok sık güncellenir, anlık haberler
  { url: 'https://www.benzinga.com/feed', source: 'Benzinga' },
  { url: 'https://www.benzinga.com/rss/topic/markets', source: 'Benzinga' },
  { url: 'https://www.benzinga.com/rss/topic/stocks', source: 'Benzinga' },
  // Seeking Alpha — genel market
  { url: 'https://seekingalpha.com/market_currents.xml', source: 'Seeking Alpha' },
  { url: 'https://seekingalpha.com/feed.xml', source: 'Seeking Alpha' },
  // Investopedia
  { url: 'https://www.investopedia.com/feedbuilder/feed/getfeed/?feedName=rss_articles', source: 'Investopedia' },
];

function parseMarketRss(xml, source) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const items = Array.from(doc.querySelectorAll('item'));
    return items.slice(0, 20).map((item, i) => {
      const title = item.querySelector('title')?.textContent || '';
      const link = item.querySelector('link')?.textContent || '';
      const pubDate = item.querySelector('pubDate')?.textContent || '';
      const description = item.querySelector('description')?.textContent?.replace(/<[^>]*>/g, '').trim() || '';
      return {
        id: `mkt_${source.replace(/\s/g, '')}_${i}_${pubDate ? new Date(pubDate).getTime() : i}`,
        title, description, link,
        date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source,
        ticker: 'US Market',
        provider: 'Market',
        isMarket: true,
      };
    });
  } catch { return []; }
}

async function fetchMarketNews() {
  const results = await Promise.allSettled(
    MARKET_FEEDS.map(async ({ url, source }) => {
      const text = await invoke('fetch_rss', { url });
      return parseMarketRss(text, source);
    })
  );
  const cutoff = Date.now() - 48 * 60 * 60 * 1000; // 48 saatten eski haberleri gösterme
  const all = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
  const seen = new Set();
  const unique = all.filter(item => {
    if (!item.title || item.title.length < 10) return false;
    if (new Date(item.date).getTime() < cutoff) return false;
    const key = item.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  unique.sort((a, b) => new Date(b.date) - new Date(a.date));
  return unique;
}

async function fetchAllNews(tickers) {
  if (!tickers || tickers.length === 0) return [];
  const saResults = await Promise.allSettled(
    tickers.map(async t => {
      try {
        const text = await invoke('fetch_rss', { url: getSeekingAlphaUrl(t) });
        const items = parseSeekingAlphaXml(text, t);
        if (items.length > 0) return items;
        throw new Error('empty');
      } catch {
        try {
          const text = await invoke('fetch_rss', { url: getYahooFinanceUrl(t) });
          return parseYahooRss(text, t);
        } catch { return []; }
      }
    })
  );
  const saItems = saResults.filter(r => r.status === 'fulfilled').flatMap(r => r.value);

  let tvItems = [];
  try {
    const tvText = await invoke('fetch_rss', { url: TV_FEED_URL });
    tvItems = parseTvFeed(JSON.parse(tvText), tickers);
  } catch {}

  const cutoff = Date.now() - 72 * 60 * 60 * 1000; // ticker haberleri için 72 saat
  const all = [...tvItems, ...saItems];
  const seen = new Set();
  const unique = all.filter(item => {
    if (!item.title) return false;
    if (new Date(item.date).getTime() < cutoff) return false;
    const key = item.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  unique.sort((a, b) => new Date(b.date) - new Date(a.date));
  return unique;
}

async function fetchAiComment(title, tickers, description = '') {
  let key = localStorage.getItem('anthropic_api_key');
  if (!key) throw new Error('NO_KEY');
  // Strip accidental quotes from stored key
  key = key.trim().replace(/^["']|["']$/g, '');
  if (!key.startsWith('sk-')) throw new Error('INVALID_KEY');

  const validTickers = (tickers || []).filter(t => t && t !== 'US Market');
  const tickerCtx = validTickers.length > 0 ? `Related tickers: ${validTickers.join(', ')}\n` : '';
  const tickerLabel = validTickers.length > 0 ? validTickers.join(', ') + ' stock' : 'US markets';

  const bodyStr = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `${tickerCtx}Headline: "${title}"${description ? `\nSummary: ${description}` : ''}\n\nBu haberi ${tickerLabel} için yatırımcı perspektifinden Türkçe olarak analiz et. Sadece JSON formatında yanıt ver (başka hiçbir şey yazma):\n{"comment":"Haberin yatırımcılar için ne anlama geldiğini açıklayan 2 cümle","detail":"Dikkat edilmesi gereken önemli bir risk veya fırsat (1 cümle), yoksa boş string"}`
    }]
  });
  const text = await invoke('fetch_post', {
    url: 'https://api.anthropic.com/v1/messages',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: bodyStr,
  });
  const data = JSON.parse(text);
  if (data.error) throw new Error(data.error.message);
  if (!data.content?.[0]?.text) throw new Error('Empty response from API');
  const raw = data.content[0].text.trim();
  const jsonStr = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  if (!jsonStr) throw new Error('Could not parse AI response');
  const parsed = JSON.parse(jsonStr);
  if (!parsed.comment) throw new Error('Unexpected response format');
  return parsed;
}

export default function StockNews({ tickers, setTickers, activeTicker, setActiveTicker }) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerRef = useRef(null);

  const [news, setNews] = useState([]);
  const [marketNews, setMarketNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [search, setSearch] = useState('');
  const [favs, setFavs] = useState(() => new Set(JSON.parse(localStorage.getItem(FAVS_KEY) || '[]')));
  const [filterFavs, setFilterFavs] = useState(false);
  const seenRef = useRef(new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')));
  const isFirstLoad = useRef(true);
  const [aiComments, setAiComments] = useState({});
  const [aiClosing, setAiClosing] = useState({});

  const closeAiPanel = (id) => {
    setAiClosing(prev => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setAiComments(prev => ({ ...prev, [id]: { ...prev[id], collapsed: true } }));
      setAiClosing(prev => { const n = { ...prev }; delete n[id]; return n; });
    }, 250);
  };

  const requestAiComment = async (item, e) => {
    e.stopPropagation();
    const id = item.id;
    if (aiComments[id]?.status === 'loading') return;
    if (aiComments[id]?.status === 'done' && !aiComments[id]?.collapsed) return; // açık ve hazır, tekrar istek atma
    if (aiComments[id]?.status === 'done' && aiComments[id]?.collapsed) {
      // gizli ama hazır — sadece aç, yeniden analiz etme
      setAiComments(prev => ({ ...prev, [id]: { ...prev[id], collapsed: false } }));
      return;
    }
    setAiComments(prev => ({ ...prev, [id]: { status: 'loading' } }));
    try {
      const result = await fetchAiComment(item.title, [item.ticker], item.description || '');
      setAiComments(prev => ({ ...prev, [id]: { status: 'done', data: result } }));
    } catch (err) {
      let msg = `Error: ${err?.message || 'Unknown'}`;
      if (err?.message === 'NO_KEY') msg = 'API key missing — set it in Settings';
      if (err?.message === 'INVALID_KEY') msg = 'Invalid API key — must start with sk-';
      setAiComments(prev => ({ ...prev, [id]: { status: 'error', msg } }));
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

  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false); setPickerSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
        sendNotification({ title: item.ticker, body: item.title });
      }
    }
  };

  const load = useCallback(async (notify = false) => {
    try {
      setError(null);
      const activeTickers = tickers?.length > 0 ? tickers : DEFAULT_TICKERS;
      const [items, mktItems] = await Promise.all([
        fetchAllNews(activeTickers),
        fetchMarketNews(),
      ]);
      const newItems = items.filter(n => !seenRef.current.has(n.id));
      setNews(items);
      setMarketNews(mktItems);
      setLastUpdated(new Date());
      if (notify && newItems.length > 0) await notifyNew(newItems);
      if (isFirstLoad.current) {
        items.forEach(n => seenRef.current.add(n.id));
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...seenRef.current].slice(-500)));
        isFirstLoad.current = false;
      }
    } catch (e) {
      setError('Failed to load: ' + (e?.message || String(e)));
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
    let items = activeTicker === 'US_MARKET' ? marketNews : news;
    if (activeTicker !== 'all' && activeTicker !== 'US_MARKET') items = items.filter(n => n.ticker === activeTicker);
    if (filterFavs) items = items.filter(n => favs.has(n.id));
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(n => n.title.toLowerCase().includes(q) || n.ticker.toLowerCase().includes(q));
    }
    return items;
  }, [news, marketNews, activeTicker, filterFavs, search, favs]);

  return (
    <div className="sn-root">
      {/* ── Header ── */}
      <div className="sn-header">
        <div className="sn-header-top">
          <div className="sn-header-left">
            <span className="sn-title">Market News</span>
            {lastUpdated && <span className="sn-updated-badge">{timeAgo(lastUpdated)} ago</span>}
          </div>
          <div className="sn-header-right">
            <div className="sn-search-wrap">
              <input
                className="sn-search"
                placeholder="Search news…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button
              className={`sn-icon-btn ${filterFavs ? 'active-fav' : ''}`}
              onClick={() => setFilterFavs(f => !f)}
              title="Saved"
            >★</button>
            <button
              className="sn-icon-btn"
              onClick={() => { setLoading(true); load(true); }}
              title="Refresh"
            >↻</button>
          </div>
        </div>

        {/* ── Ticker chips ── */}
        <div className="sn-ticker-row">
          <button
            className={`sn-chip ${activeTicker === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTicker('all')}
          >All</button>
          <button
            className={`sn-chip sn-chip-market ${activeTicker === 'US_MARKET' ? 'active' : ''}`}
            onClick={() => setActiveTicker('US_MARKET')}
          >🇺🇸 US Market</button>
          {tickers.map(t => {
            const color = getTickerColor(t);
            return (
              <span
                key={t}
                className={`sn-chip ${activeTicker === t ? 'active' : ''}`}
                style={activeTicker === t ? { color, borderColor: color, background: `${color}18` } : { borderColor: `${color}40`, color: `${color}99` }}
              >
                <span onClick={() => setActiveTicker(t)}>{t}</span>
                <button className="sn-chip-x" onClick={() => {
                  const next = tickers.filter(x => x !== t);
                  saveTickers(next);
                  if (activeTicker === t) setActiveTicker('all');
                }}>×</button>
              </span>
            );
          })}
          <div className="sn-add-wrap" ref={pickerRef}>
            <button className="sn-add-chip" onClick={() => setShowPicker(p => !p)}>+ Add</button>
            {showPicker && (
              <div className="sn-picker">
                <input
                  className="sn-picker-input"
                  placeholder="Search ticker…"
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  autoFocus
                />
                <div className="sn-picker-list">
                  {POPULAR_STOCKS
                    .filter((s, idx, arr) => arr.findIndex(x => x.ticker === s.ticker) === idx)
                    .filter(s => {
                      const q = pickerSearch.toLowerCase();
                      return !q || s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
                    })
                    .map(s => (
                      <button
                        key={s.ticker}
                        className={`sn-picker-item ${tickers.includes(s.ticker) ? 'selected' : ''}`}
                        onMouseDown={e => { e.preventDefault(); toggleTicker(s.ticker); }}
                      >
                        <span className="sn-picker-ticker">{s.ticker}</span>
                        <span className="sn-picker-name">{s.name}</span>
                        {tickers.includes(s.ticker) && <span className="sn-picker-check">✓</span>}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── News feed ── */}
      <div className="sn-feed">
        {loading && (
          <div className="sn-center-state">
            <span className="sn-spinner" />
            <span>Loading news…</span>
          </div>
        )}
        {error && <div className="sn-center-state sn-err-text">{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="sn-center-state">No news found</div>
        )}
        {!loading && !error && filtered.map((item, i) => {
          const color = getTickerColor(item.ticker);
          const isUnread = !seenRef.current.has(item.id);
          const ai = aiComments[item.id];
          return (
            <div
              key={item.id || i}
              className={`sn-card ${isUnread ? 'unread' : ''} ${ai?.status === 'done' ? 'sn-card-expanded' : ''}`}
              style={{ '--ticker-color': color }}
            >
              <div className="sn-card-accent" />
              <div className="sn-card-inner">
                <div className="sn-card-top">
                  <span className="sn-card-ticker" style={{ color, background: `${color}18`, borderColor: `${color}30` }}>
                    {item.ticker}
                  </span>
                  {item.provider === 'TradingView' && <span className="sn-live">LIVE</span>}
                  {item.source && <span className="sn-card-source">{item.source}</span>}
                  <span className="sn-card-time">{timeAgo(item.date)}</span>
                  <div className="sn-card-actions">
                    <button
                      className={`sn-ai-btn ${ai?.status === 'done' ? 'on' : ''}`}
                      onClick={e => requestAiComment(item, e)}
                      title="AI Analysis"
                    >
                      {ai?.status === 'loading' ? <span className="sn-spin-sm" /> : '✦ AI'}
                    </button>
                    <button
                      className="sn-fav-btn"
                      onClick={e => { e.stopPropagation(); seenRef.current.add(item.id); localStorage.setItem(STORAGE_KEY, JSON.stringify([...seenRef.current].slice(-500))); open(item.link).catch(() => {}); }}
                      title="Open article"
                    >↗</button>
                    <button
                      className={`sn-fav-btn ${favs.has(item.id) ? 'on' : ''}`}
                      onClick={e => toggleFav(item.id, e)}
                    >★</button>
                  </div>
                </div>
                <div className="sn-card-headline">{item.title}</div>
                {item.description && (
                  <div className="sn-card-desc">{item.description}</div>
                )}
                {/* AI panel — card içinde, aşağıya açılır */}
                {ai && ai.status !== 'loading' && (
                  <div className={`sn-ai-wrap${ai.collapsed ? ' collapsed' : ''}${aiClosing[item.id] ? ' closing' : ''}`}>
                    <div className="sn-ai-wrap-inner">
                      {/* Expanded content */}
                      <div className="sn-ai-expand-inner">
                        {ai.status === 'error' ? (
                          <p className="sn-ai-err">{ai.msg}</p>
                        ) : ai.data ? (
                          <>
                            <p className="sn-ai-comment">{ai.data.comment}</p>
                            {ai.data.detail && <p className="sn-ai-detail">{ai.data.detail}</p>}
                          </>
                        ) : (
                          <p className="sn-ai-err">No response received</p>
                        )}
                      </div>
                      {/* Toggle button — changes label based on state */}
                      <button
                        className="sn-ai-toggle-btn"
                        onClick={() => {
                          if (ai.collapsed) {
                            setAiComments(prev => ({ ...prev, [item.id]: { ...prev[item.id], collapsed: false } }));
                          } else {
                            closeAiPanel(item.id);
                          }
                        }}
                      >
                        {ai.collapsed ? '▼ AI yorumunu göster' : '▲ Gizle'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
