import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './MarketResearch.css';

const WATCHLIST_KEY = 'research_watchlist';
const CHECKED_KEY   = 'research_checked';
const HISTORY_KEY   = 'research_history';

const ALL_STOCKS = [
  { ticker: 'AAPL', name: 'Apple' }, { ticker: 'MSFT', name: 'Microsoft' },
  { ticker: 'NVDA', name: 'NVIDIA' }, { ticker: 'GOOGL', name: 'Alphabet' },
  { ticker: 'AMZN', name: 'Amazon' }, { ticker: 'META', name: 'Meta' },
  { ticker: 'TSLA', name: 'Tesla' }, { ticker: 'AMD', name: 'AMD' },
  { ticker: 'AVGO', name: 'Broadcom' }, { ticker: 'PLTR', name: 'Palantir' },
  { ticker: 'NBIS', name: 'Nebius' }, { ticker: 'CRWD', name: 'CrowdStrike' },
  { ticker: 'PANW', name: 'Palo Alto' }, { ticker: 'COIN', name: 'Coinbase' },
  { ticker: 'NFLX', name: 'Netflix' }, { ticker: 'CRM', name: 'Salesforce' },
  { ticker: 'ORCL', name: 'Oracle' }, { ticker: 'NET', name: 'Cloudflare' },
  { ticker: 'DDOG', name: 'Datadog' }, { ticker: 'SNOW', name: 'Snowflake' },
  { ticker: 'ARM', name: 'Arm Holdings' }, { ticker: 'TSM', name: 'TSMC' },
  { ticker: 'SMCI', name: 'Super Micro' }, { ticker: 'MSTR', name: 'MicroStrategy' },
  { ticker: 'IREN', name: 'IREN' }, { ticker: 'RKLB', name: 'Rocket Lab' },
  { ticker: 'IONQ', name: 'IonQ' }, { ticker: 'SHOP', name: 'Shopify' },
  { ticker: 'UBER', name: 'Uber' }, { ticker: 'PYPL', name: 'PayPal' },
  { ticker: 'JPM', name: 'JPMorgan' }, { ticker: 'GS', name: 'Goldman Sachs' },
  { ticker: 'LLY', name: 'Eli Lilly' }, { ticker: 'XOM', name: 'ExxonMobil' },
  { ticker: 'SPY', name: 'S&P 500 ETF' }, { ticker: 'QQQ', name: 'Nasdaq ETF' },
  { ticker: 'BTC-USD', name: 'Bitcoin' }, { ticker: 'ETH-USD', name: 'Ethereum' },
  { ticker: 'GC=F', name: 'Gold' }, { ticker: 'CL=F', name: 'Crude Oil' },
];

function loadWatchlist() { try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY)) || []; } catch { return []; } }
function saveWatchlist(l) { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(l)); }
function loadChecked(wl) {
  try { const s = JSON.parse(localStorage.getItem(CHECKED_KEY)); if (s) return new Set(s); } catch {}
  return new Set(wl.map(w => w.ticker));
}
function saveChecked(s) { localStorage.setItem(CHECKED_KEY, JSON.stringify([...s])); }
function loadHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; } }
function saveHistory(h) { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 10))); }

async function fetchQuote(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d&includePrePost=true`;
  const text = await invoke('fetch_rss', { url });
  const json = JSON.parse(text);
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error('No data');
  const meta = r.meta;
  const closes = r.indicators?.quote?.[0]?.close ?? [];
  const price = [...closes].reverse().find(v => v != null) ?? meta.regularMarketPrice;
  if (!price) throw new Error('No price');
  const prev = meta.chartPreviousClose ?? meta.regularMarketPreviousClose ?? price;
  const pct = prev ? ((price - prev) / prev) * 100 : 0;
  return { ticker, price, pct };
}

async function fetchEarnings(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=calendarEvents`;
    const text = await invoke('fetch_rss', { url });
    const json = JSON.parse(text);
    const dates = json?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate;
    const ts = dates?.[0]?.raw;
    if (!ts) return null;
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return null; }
}

async function fetchNews(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=0&newsCount=5`;
    const text = await invoke('fetch_rss', { url });
    const json = JSON.parse(text);
    return (json?.news || []).map(n => n.title).filter(Boolean).slice(0, 5);
  } catch { return []; }
}

// ── Stock Card ────────────────────────────────────────────────────────────────
function StockCard({ ticker, name, quote, analysis, earningsDate }) {
  const pos = quote ? quote.pct >= 0 : null;
  return (
    <div className="mr-card">
      <div className={`mr-card-header ${pos === true ? 'pos' : pos === false ? 'neg' : ''}`}>
        <div className="mr-card-left">
          <span className="mr-card-ticker">{ticker}</span>
          <span className="mr-card-name">{name}</span>
        </div>
        <div className="mr-card-right">
          {quote && (
            <>
              <span className="mr-card-price">${quote.price.toFixed(2)}</span>
              <span className={`mr-card-pct ${pos ? 'pos' : 'neg'}`}>
                {pos ? '▲' : '▼'} {Math.abs(quote.pct).toFixed(2)}%
              </span>
            </>
          )}
        </div>
      </div>
      {earningsDate && (
        <div className="mr-card-earnings-row">
          <span className="mr-earnings-icon">📅</span>
          <span className="mr-earnings-label">Bilanço:</span>
          <span className="mr-earnings-date">{earningsDate}</span>
        </div>
      )}
      <div className="mr-card-analysis">{analysis}</div>
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────────
function SummaryCard({ text }) {
  if (!text) return null;
  return (
    <div className="mr-summary-card">
      {text.split('\n').map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: 8 }} />;
        const bold = line.match(/^\*\*(.+?)\*\*:?(.*)/);
        if (bold) return (
          <div key={i} className="mr-summary-line">
            <span className="mr-summary-bold">{bold[1]}</span>
            {bold[2] && <span className="mr-summary-rest"> {bold[2].trim()}</span>}
          </div>
        );
        return <p key={i} className="mr-summary-p">{line}</p>;
      })}
    </div>
  );
}

// ── Earnings calendar panel ───────────────────────────────────────────────────
function EarningsPanel({ watchlist, earnings }) {
  const rows = watchlist
    .map(({ ticker, name }) => ({ ticker, name, date: earnings[ticker] }))
    .filter(r => r.date);
  return (
    <div className="mr-earnings-section">
      <div className="mr-section-label" style={{ cursor: 'default' }}>
        <span className="mr-section-label-txt">📅 Bilanço Takvimi</span>
      </div>
      <div className="mr-earnings-list">
        {rows.length === 0
          ? <div className="mr-earnings-empty">Tarih yükleniyor...</div>
          : rows.map(r => (
            <div key={r.ticker} className="mr-earnings-row">
              <span className="mr-earnings-ticker-col">{r.ticker}</span>
              <span className="mr-earnings-name-col">{r.name}</span>
              <span className="mr-earnings-date-col">{r.date}</span>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── History panel ─────────────────────────────────────────────────────────────
function HistoryPanel({ history, onSelect, activeId }) {
  if (!history.length) return null;
  return (
    <div className="mr-history">
      <div className="mr-history-label">Geçmiş ({history.length})</div>
      <div className="mr-history-list">
        {history.map(h => (
          <button key={h.id} className={`mr-history-item${activeId === h.id ? ' active' : ''}`}
            onClick={() => onSelect(h)}>
            <span className="mr-hist-icon">{h.mode === 'market' ? '🌍' : '🔍'}</span>
            <div className="mr-hist-body">
              <span className="mr-hist-label">{h.label}</span>
              <span className="mr-hist-time">{h.dateStr}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MarketResearch() {
  const [watchlist, setWatchlist] = useState(loadWatchlist);
  const [checked, setChecked] = useState(() => loadChecked(loadWatchlist()));
  const [searchAdd, setSearchAdd] = useState('');
  const [prices, setPrices] = useState({});
  const [earnings, setEarnings] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);

  const [cards, setCards] = useState([]);
  const [summaryText, setSummaryText] = useState('');
  const [mode, setMode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastTime, setLastTime] = useState('');
  const [activeHistId, setActiveHistId] = useState(null);

  const [history, setHistory] = useState(loadHistory);

  const refreshPrices = useCallback(async () => {
    if (!watchlist.length) return;
    setPricesLoading(true);
    const res = {};
    for (let i = 0; i < watchlist.length; i += 4) {
      await Promise.allSettled(watchlist.slice(i, i + 4).map(async ({ ticker }) => {
        try { res[ticker] = await fetchQuote(ticker); } catch { res[ticker] = null; }
      }));
    }
    setPrices(res); setPricesLoading(false);
  }, [watchlist]);

  const refreshEarnings = useCallback(async () => {
    if (!watchlist.length) return;
    const res = {};
    await Promise.allSettled(watchlist.map(async ({ ticker }) => {
      res[ticker] = await fetchEarnings(ticker);
    }));
    setEarnings(res);
  }, [watchlist]);

  useEffect(() => { refreshPrices(); refreshEarnings(); }, [refreshPrices, refreshEarnings]);

  function pushHistory(entry) {
    const next = [entry, ...history.filter(h => h.id !== entry.id)].slice(0, 10);
    setHistory(next); saveHistory(next);
  }

  function addToWatchlist(stock) {
    if (watchlist.find(w => w.ticker === stock.ticker)) return;
    const next = [...watchlist, { ticker: stock.ticker, name: stock.name }];
    setWatchlist(next); saveWatchlist(next);
    const nc = new Set([...checked, stock.ticker]);
    setChecked(nc); saveChecked(nc);
  }

  function addCustom() {
    const t = searchAdd.trim().toUpperCase();
    if (!t) return;
    addToWatchlist(ALL_STOCKS.find(s => s.ticker === t) || { ticker: t, name: t });
    setSearchAdd('');
  }

  function removeFromWatchlist(ticker) {
    const next = watchlist.filter(w => w.ticker !== ticker);
    setWatchlist(next); saveWatchlist(next);
    const nc = new Set([...checked].filter(t => t !== ticker));
    setChecked(nc); saveChecked(nc);
  }

  function toggleCheck(ticker) {
    const nc = new Set(checked);
    nc.has(ticker) ? nc.delete(ticker) : nc.add(ticker);
    setChecked(nc); saveChecked(nc);
  }

  function toggleAll() {
    if (checked.size === watchlist.length) { setChecked(new Set()); saveChecked(new Set()); }
    else { const a = new Set(watchlist.map(w => w.ticker)); setChecked(a); saveChecked(a); }
  }

  function loadHistoryEntry(h) {
    setMode(h.mode);
    setCards(h.cards || []);
    setSummaryText(h.summaryText || '');
    setLastTime(h.dateStr);
    setActiveHistId(h.id);
    setError('');
  }

  async function runStocksResearch() {
    const targets = watchlist.filter(w => checked.has(w.ticker));
    if (!targets.length) { setError('En az bir hisse seç.'); return; }
    setLoading(true); setError(''); setCards([]); setSummaryText(''); setMode('stocks'); setActiveHistId(null);

    try {
      const data = [];
      for (const { ticker, name } of targets) {
        const [quote, news] = await Promise.all([
          fetchQuote(ticker).catch(() => null),
          fetchNews(ticker),
        ]);
        data.push({ ticker, name, quote, news });
      }

      const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      const stockLines = data.map(({ ticker, name, quote, news }) => {
        const priceStr = quote ? `$${quote.price.toFixed(2)} (${quote.pct >= 0 ? '+' : ''}${quote.pct.toFixed(2)}%)` : 'fiyat yok';
        return `${ticker} (${name}): ${priceStr}\n${news.map(n => `- ${n}`).join('\n') || '- haber yok'}`;
      }).join('\n\n');

      const prompt = `Bugün ${today}. Hisseler için kısa Türkçe analiz.\nSadece JSON array döndür:\n[{"ticker":"X","analysis":"2-3 cümle"},...]'\n\nVERİ:\n${stockLines}`;

      const apiKey = localStorage.getItem('anthropic_api_key') || '';
      const resp = JSON.parse(await invoke('fetch_post', {
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
      }));
      if (resp.error) throw new Error(resp.error.message);
      const raw = resp.content?.[0]?.text?.trim() || '[]';
      const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || '[]');

      const resultCards = data.map(({ ticker, name, quote }) => ({
        ticker, name, quote,
        analysis: parsed.find(p => p.ticker === ticker)?.analysis || '',
        earningsDate: earnings[ticker] || null,
      }));

      const ts = new Date();
      const dateStr = `${ts.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${ts.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
      const entry = {
        id: ts.getTime().toString(),
        mode: 'stocks',
        label: targets.map(t => t.ticker).join(', '),
        dateStr,
        cards: resultCards,
        summaryText: '',
      };
      setCards(resultCards);
      setLastTime(dateStr);
      setActiveHistId(entry.id);
      pushHistory(entry);
    } catch (e) { setError(e.message || 'Hata.'); setMode(null); }
    finally { setLoading(false); }
  }

  async function runMarketSummary() {
    setLoading(true); setError(''); setCards([]); setSummaryText(''); setMode('market'); setActiveHistId(null);
    try {
      const quotes = {};
      await Promise.allSettled(['SPY', 'QQQ', 'DIA', 'BTC-USD'].map(async t => {
        try { quotes[t] = await fetchQuote(t); } catch {}
      }));
      const news = await fetchNews('stock market');
      const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      const priceLines = Object.entries(quotes).map(([t, q]) => q ? `${t}: $${q.price.toFixed(2)} (${q.pct >= 0 ? '+' : ''}${q.pct.toFixed(2)}%)` : `${t}: veri yok`).join('\n');
      const prompt = `Bugün ${today}. Kısa Türkçe piyasa özeti. **Piyasa Durumu** ile başla, **Ana Baskılar** ve **Öne Çıkan** başlıklarıyla devam et. 4-5 cümle.\n\nEndeksler:\n${priceLines}\n\nHaberler:\n${news.map(n => `- ${n}`).join('\n')}`;

      const apiKey = localStorage.getItem('anthropic_api_key') || '';
      const resp = JSON.parse(await invoke('fetch_post', {
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
      }));
      if (resp.error) throw new Error(resp.error.message);
      const txt = resp.content?.[0]?.text?.trim() || '';

      const ts = new Date();
      const dateStr = `${ts.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${ts.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
      const entry = { id: ts.getTime().toString(), mode: 'market', label: 'Piyasa Özeti', dateStr, cards: [], summaryText: txt };
      setSummaryText(txt);
      setLastTime(dateStr);
      setActiveHistId(entry.id);
      pushHistory(entry);
    } catch (e) { setError(e.message || 'Hata.'); setMode(null); }
    finally { setLoading(false); }
  }

  const filteredSug = searchAdd.length > 0
    ? ALL_STOCKS.filter(s => (s.ticker.toLowerCase().includes(searchAdd.toLowerCase()) || s.name.toLowerCase().includes(searchAdd.toLowerCase())) && !watchlist.find(w => w.ticker === s.ticker)).slice(0, 6)
    : [];

  const checkedCount = watchlist.filter(w => checked.has(w.ticker)).length;

  return (
    <div className="mr-container">
      {/* ── Sidebar ── */}
      <div className="mr-sidebar">
        <div className="mr-sidebar-top">
          {/* Add */}
          <div className="mr-add-wrap">
            <div className="mr-add-row">
              <input className="mr-add-input" placeholder="Ticker ara veya ekle..."
                value={searchAdd} onChange={e => setSearchAdd(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustom()} />
              <button className="mr-add-btn" onClick={addCustom}>+</button>
            </div>
            {filteredSug.length > 0 && (
              <div className="mr-suggestions">
                {filteredSug.map(s => (
                  <button key={s.ticker} className="mr-sug-item" onClick={() => { addToWatchlist(s); setSearchAdd(''); }}>
                    <span className="mr-sug-ticker">{s.ticker}</span>
                    <span className="mr-sug-name">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {watchlist.length > 0 && (
            <div className="mr-section-label" onClick={toggleAll}>
              <span className={`mr-cb${checked.size === watchlist.length ? ' on' : ''}`} />
              <span className="mr-section-label-txt">Watchlist</span>
              <button className="mr-refresh-btn" title="Fiyat ve tarihleri güncelle"
                onClick={e => { e.stopPropagation(); refreshPrices(); refreshEarnings(); }}
                disabled={pricesLoading}>
                {pricesLoading ? <span className="mr-spin-xs" /> : '↻'}
              </button>
            </div>
          )}

          <div className="mr-list">
            {watchlist.map(({ ticker, name }) => {
              const q = prices[ticker];
              const pos = q && q.pct >= 0;
              const ed = earnings[ticker];
              return (
                <div key={ticker} className={`mr-item${checked.has(ticker) ? ' on' : ''}`} onClick={() => toggleCheck(ticker)}>
                  <span className={`mr-cb${checked.has(ticker) ? ' on' : ''}`} />
                  <div className="mr-item-body">
                    <div className="mr-item-row1">
                      <span className="mr-item-ticker">{ticker}</span>
                      {q && <span className={`mr-item-pct ${pos ? 'pos' : 'neg'}`}>{pos ? '+' : ''}{q.pct.toFixed(2)}%</span>}
                      {!q && pricesLoading && <span className="mr-spin-xs" style={{ marginLeft: 4 }} />}
                    </div>
                    <div className="mr-item-row2">
                      <span className="mr-item-name">{name}</span>
                      {q && <span className="mr-item-price">${q.price.toFixed(2)}</span>}
                    </div>
                    {ed && (
                      <div className="mr-item-earnings-row">
                        <span className="mr-item-earnings-dot" />
                        <span className="mr-item-earnings-txt">Bilanço: {ed}</span>
                      </div>
                    )}
                  </div>
                  <button className="mr-del" onClick={e => { e.stopPropagation(); removeFromWatchlist(ticker); }}>×</button>
                </div>
              );
            })}
            {watchlist.length === 0 && <div className="mr-empty-hint">Yukarıdan hisse ekle</div>}
          </div>

          {/* Earnings calendar */}
          {watchlist.length > 0 && <EarningsPanel watchlist={watchlist} earnings={earnings} />}

          {/* History */}
          <HistoryPanel history={history} onSelect={loadHistoryEntry} activeId={activeHistId} />
        </div>

        <div className="mr-actions">
          <button className="mr-btn mr-btn--market" onClick={runMarketSummary} disabled={loading}>
            {loading && mode === 'market' ? <><span className="mr-spin-sm" /> Yükleniyor</> : '🌍 Piyasa Özeti'}
          </button>
          <button className="mr-btn mr-btn--stocks" onClick={runStocksResearch} disabled={loading || checkedCount === 0}>
            {loading && mode === 'stocks' ? <><span className="mr-spin-sm" /> Araştırılıyor...</> : `🔍 Araştır (${checkedCount})`}
          </button>
        </div>
      </div>

      {/* ── Result ── */}
      <div className="mr-result">
        {error && <div className="mr-error">{error}</div>}

        {!mode && !loading && (
          <div className="mr-placeholder">
            <div className="mr-ph-icon">📊</div>
            <div className="mr-ph-title">Piyasa Araştırması</div>
            <div className="mr-ph-desc">Watchlist'e hisse ekle, seçtiklerini işaretle, <strong>Araştır</strong>'a bas.<br />Ya da <strong>Piyasa Özeti</strong> ile günlük durumu gör.</div>
          </div>
        )}

        {loading && (
          <div className="mr-loading">
            <div className="mr-spin-lg" />
            <div className="mr-loading-txt">{mode === 'market' ? 'Veriler çekiliyor...' : 'Haberler çekiliyor ve analiz yazılıyor...'}</div>
          </div>
        )}

        {!loading && mode && (
          <div className="mr-result-inner">
            <div className="mr-result-topbar">
              <span className="mr-result-label">{mode === 'market' ? '🌍 Piyasa Özeti' : '🔍 Hisse Analizi'}</span>
              {activeHistId && history.find(h => h.id !== history[0]?.id && h.id === activeHistId) && (
                <span className="mr-hist-badge">Geçmiş</span>
              )}
              {lastTime && <span className="mr-result-time">{lastTime}</span>}
              <button className="mr-copy-btn" onClick={() => {
                const txt = mode === 'market' ? summaryText : cards.map(c => `${c.ticker}: ${c.analysis}`).join('\n\n');
                navigator.clipboard.writeText(txt);
              }}>Kopyala</button>
            </div>
            <div className="mr-result-scroll">
              {mode === 'market' && <SummaryCard text={summaryText} />}
              {mode === 'stocks' && cards.map(c => <StockCard key={c.ticker} {...c} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
