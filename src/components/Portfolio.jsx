import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Portfolio.css';

async function fetchQuote(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d&includePrePost=true`;
  const text = await invoke('fetch_rss', { url });
  const json = JSON.parse(text);
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('No data');
  const meta = result.meta;
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const livePrice = [...closes].reverse().find(v => v != null);
  const price = livePrice ?? meta.regularMarketPrice;
  if (price == null) throw new Error('Missing price');
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const name = meta.shortName ?? meta.longName ?? '';
  return { price, prevClose, name };
}

const EMPTY_FORM = {
  ticker: '',
  name: '',
  shares: '',
  buyPrice: '',
  targetPrice: '',
  date: new Date().toISOString().slice(0, 10),
  note: '',
};

export default function Portfolio() {
  const [positions, setPositions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('portfolio_positions') || '[]'); } catch { return []; }
  });
  const [closedTrades, setClosedTrades] = useState(() => {
    try { return JSON.parse(localStorage.getItem('portfolio_closed') || '[]'); } catch { return []; }
  });
  const [quotes, setQuotes] = useState({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [tab, setTab] = useState('open'); // 'open' | 'closed' | 'add' | 'sell'
  const [form, setForm] = useState(EMPTY_FORM);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [formCurrentPrice, setFormCurrentPrice] = useState(null);
  const fetchDebounceRef = useRef(null);
  const [sellForm, setSellForm] = useState({ id: null, sellPrice: '', date: new Date().toISOString().slice(0, 10) });
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    localStorage.setItem('portfolio_positions', JSON.stringify(positions));
  }, [positions]);

  useEffect(() => {
    localStorage.setItem('portfolio_closed', JSON.stringify(closedTrades));
  }, [closedTrades]);

  const refreshQuotes = useCallback(async () => {
    if (!positions.length) return;
    setLoadingQuotes(true);
    const tickers = [...new Set(positions.map(p => p.ticker.toUpperCase()))];
    const results = await Promise.allSettled(tickers.map(t => fetchQuote(t).then(q => ({ ticker: t, ...q }))));
    const map = {};
    results.forEach(r => { if (r.status === 'fulfilled') map[r.value.ticker] = r.value; });
    setQuotes(map);
    setLoadingQuotes(false);
  }, []);

  // Only re-fetch when the set of tickers actually changes, not on every positions update
  const tickerKey = positions.map(p => p.ticker.toUpperCase()).sort().join(',');
  useEffect(() => { refreshQuotes(); }, [tickerKey]);

  // Auto-fetch current price when ticker changes in form
  const handleFormTicker = (val) => {
    const ticker = val.toUpperCase();
    setForm(f => ({ ...f, ticker }));
    setFormCurrentPrice(null);
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    if (ticker.length < 1) return;
    fetchDebounceRef.current = setTimeout(async () => {
      setFetchingPrice(true);
      try {
        const q = await fetchQuote(ticker);
        setFormCurrentPrice(q.price);
        setForm(f => ({
          ...f,
          buyPrice: f.buyPrice || q.price.toFixed(2),
          name: f.name || q.name,
        }));
      } catch { /* ignore */ } finally {
        setFetchingPrice(false);
      }
    }, 600);
  };

  const savePosition = () => {
    setError('');
    if (!form.ticker || !form.shares || !form.buyPrice) { setError('Symbol, shares and buy price are required.'); return; }
    const shares = parseFloat(form.shares);
    const buyPrice = parseFloat(form.buyPrice);
    const targetPrice = form.targetPrice ? parseFloat(form.targetPrice) : null;
    if (isNaN(shares) || isNaN(buyPrice)) { setError('Please enter valid numbers.'); return; }

    if (editId) {
      setPositions(prev => prev.map(p => p.id === editId
        ? { ...p, ticker: form.ticker.toUpperCase(), name: form.name, shares, buyPrice, targetPrice, date: form.date, note: form.note }
        : p));
      setEditId(null);
    } else {
      setPositions(prev => [...prev, {
        id: Date.now(),
        ticker: form.ticker.toUpperCase(),
        name: form.name,
        shares,
        buyPrice,
        targetPrice,
        date: form.date,
        note: form.note,
      }]);
    }
    setForm(EMPTY_FORM);
    setFormCurrentPrice(null);
    setTab('open');
  };

  const startEdit = (pos) => {
    setForm({
      ticker: pos.ticker,
      name: pos.name || '',
      shares: String(pos.shares),
      buyPrice: String(pos.buyPrice),
      targetPrice: pos.targetPrice != null ? String(pos.targetPrice) : '',
      date: pos.date || new Date().toISOString().slice(0, 10),
      note: pos.note || '',
    });
    setEditId(pos.id);
    setFormCurrentPrice(null);
    // Fetch current price
    fetchQuote(pos.ticker).then(q => setFormCurrentPrice(q.price)).catch(() => {});
    setTab('add');
  };

  const deletePosition = (id) => {
    setPositions(prev => prev.filter(p => p.id !== id));
  };

  const startSell = (pos) => {
    setSellForm({ id: pos.id, sellPrice: '', date: new Date().toISOString().slice(0, 10) });
    setTab('sell');
  };

  const confirmSell = () => {
    setError('');
    const pos = positions.find(p => p.id === sellForm.id);
    if (!pos) return;
    const sellPrice = parseFloat(sellForm.sellPrice);
    if (isNaN(sellPrice)) { setError('Please enter a valid sell price.'); return; }
    const pnl = (sellPrice - pos.buyPrice) * pos.shares;
    const pnlPct = ((sellPrice - pos.buyPrice) / pos.buyPrice) * 100;
    setClosedTrades(prev => [...prev, {
      id: Date.now(),
      ticker: pos.ticker,
      name: pos.name,
      shares: pos.shares,
      buyPrice: pos.buyPrice,
      sellPrice,
      buyDate: pos.date,
      sellDate: sellForm.date,
      pnl,
      pnlPct,
      note: pos.note,
    }]);
    setPositions(prev => prev.filter(p => p.id !== sellForm.id));
    setSellForm({ id: null, sellPrice: '', date: new Date().toISOString().slice(0, 10) });
    setTab('closed');
  };

  const deleteClosedTrade = (id) => {
    setClosedTrades(prev => prev.filter(t => t.id !== id));
  };

  // Summary calculations
  const totalInvested = positions.reduce((s, p) => s + p.shares * p.buyPrice, 0);
  const totalCurrentValue = positions.reduce((s, p) => {
    const q = quotes[p.ticker.toUpperCase()];
    return s + p.shares * (q?.price ?? p.buyPrice);
  }, 0);
  const totalPnl = totalCurrentValue - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const totalRealizedPnl = closedTrades.reduce((s, t) => s + t.pnl, 0);

  const fmt = (n) => n?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (n) => (n >= 0 ? '+' : '') + n?.toFixed(2) + '%';

  return (
    <div className="pf-root">

      {/* Toolbar — like a price bar */}
      <div className="pf-toolbar">
        {/* Summary row */}
        <div className="pf-summary-row">
          <span className="pf-sum-item">Invested <b>${fmt(totalInvested)}</b></span>
          <span className="pf-sum-sep">·</span>
          <span className="pf-sum-item">Value <b>${fmt(totalCurrentValue)}</b></span>
          <span className="pf-sum-sep">·</span>
          <span className={`pf-sum-item ${totalPnl >= 0 ? 'pos' : 'neg'}`}>
            Open P/L <b>{totalPnl >= 0 ? '+' : ''}${fmt(totalPnl)}</b>
            <span className="pf-sum-pct"> ({fmtPct(totalPnlPct)})</span>
          </span>
          <span className="pf-sum-sep">·</span>
          <span className={`pf-sum-item ${totalRealizedPnl >= 0 ? 'pos' : 'neg'}`}>
            Realize <b>{totalRealizedPnl >= 0 ? '+' : ''}${fmt(totalRealizedPnl)}</b>
          </span>
        </div>

        {/* Right actions */}
        <div className="pf-toolbar-right">
          <div className="pf-tab-bar">
            <button className={`stc-bottom-tab ${tab === 'open' ? 'active' : ''}`} onClick={() => setTab('open')}>
              Open ({positions.length})
            </button>
            <button className={`stc-bottom-tab ${tab === 'closed' ? 'active' : ''}`} onClick={() => setTab('closed')}>
              Closed ({closedTrades.length})
            </button>
          </div>
          <button className={`pf-icon-btn ${loadingQuotes ? 'spin' : ''}`} onClick={refreshQuotes} disabled={loadingQuotes} title="Refresh prices">↻</button>
          <button className="pf-icon-btn add" onClick={() => { setForm(EMPTY_FORM); setEditId(null); setTab('add'); }} title="Add position">+</button>
        </div>
      </div>

      {/* Inline form */}
      {(tab === 'add' || tab === 'sell') && (
        <div className="pf-inline-form">
          {error && <div className="pf-form-error">{error}</div>}
          {tab === 'add' && (() => {
            const shares = parseFloat(form.shares);
            const buyPrice = parseFloat(form.buyPrice);
            const cur = formCurrentPrice;
            const tutar = !isNaN(shares) && !isNaN(buyPrice) ? shares * buyPrice : null;
            const pnl = cur != null && !isNaN(shares) && !isNaN(buyPrice) ? (cur - buyPrice) * shares : null;
            const pnlPct = cur != null && !isNaN(buyPrice) && buyPrice !== 0 ? ((cur - buyPrice) / buyPrice) * 100 : null;
            return (
              <div className="pf-form-row">
                <input className="pf-input" placeholder="SYMBOL" value={form.ticker} onChange={e => handleFormTicker(e.target.value)} autoFocus />
                <input className="pf-input" placeholder="Company name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <input className="pf-input" type="number" placeholder="Lot" value={form.shares} onChange={e => setForm(f => ({ ...f, shares: e.target.value }))} />
                <input
                  className={`pf-input ${fetchingPrice ? 'pf-input-loading' : ''}`}
                  type="number"
                  placeholder="Buy $"
                  value={form.buyPrice}
                  onChange={e => setForm(f => ({ ...f, buyPrice: e.target.value }))}
                />
                {tutar != null && <span className="pf-form-tutar">${fmt(tutar)}</span>}
                {cur != null && !isNaN(buyPrice) && (
                  <span className={`pf-form-preview ${pnl >= 0 ? 'pos' : 'neg'}`}>
                    {pnl != null && `${pnl >= 0 ? '+' : ''}$${fmt(pnl)}`}
                    {pnlPct != null && <span className="pf-form-preview-pct"> ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)</span>}
                  </span>
                )}
                <input className="pf-input" type="number" placeholder="Target $" value={form.targetPrice} onChange={e => setForm(f => ({ ...f, targetPrice: e.target.value }))} />
                <input className="pf-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                <button className="pf-icon-btn add" onClick={savePosition} title={editId ? 'Update' : 'Save'}>✓</button>
                <button className="pf-icon-btn" onClick={() => { setTab('open'); setEditId(null); setError(''); setFormCurrentPrice(null); }} title="Cancel">✕</button>
              </div>
            );
          })()}
          {tab === 'sell' && (() => {
            const pos = positions.find(p => p.id === sellForm.id);
            if (!pos) return null;
            const q = quotes[pos.ticker];
            const sp = parseFloat(sellForm.sellPrice);
            const preview = !isNaN(sp) ? (sp - pos.buyPrice) * pos.shares : null;
            return (
              <div className="pf-form-row">
                <span className="pf-sell-label">{pos.ticker} · {pos.shares} shares · buy ${fmt(pos.buyPrice)}{q ? ` · now $${fmt(q.price)}` : ''}</span>
                <input className="pf-input" type="number" placeholder="Sell $" value={sellForm.sellPrice} onChange={e => setSellForm(f => ({ ...f, sellPrice: e.target.value }))} autoFocus />
                <input className="pf-input" type="date" value={sellForm.date} onChange={e => setSellForm(f => ({ ...f, date: e.target.value }))} />
                {preview != null && (
                  <span className={preview >= 0 ? 'pf-sum-item pos' : 'pf-sum-item neg'}>
                    {preview >= 0 ? '+' : ''}${fmt(preview)}
                  </span>
                )}
                <button className="pf-icon-btn add" onClick={confirmSell} title="Sell">✓</button>
                <button className="pf-icon-btn" onClick={() => { setTab('open'); setError(''); }}>✕</button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Open positions */}
      {tab === 'open' && (
        positions.length === 0
          ? <div className="stc-empty">No open positions yet.</div>
          : (
            <div className="stc-list">
              <div className="stc-list-header pf-grid-open">
                <span>Symbol</span><span>Buy</span><span>Amount</span><span>Current</span>
                <span>P/L $</span><span>P/L %</span><span>Target</span><span>To Target</span><span></span>
              </div>
              {positions.map(pos => {
                const q = quotes[pos.ticker.toUpperCase()];
                const cur = q?.price ?? null;
                const pnl = cur != null ? (cur - pos.buyPrice) * pos.shares : null;
                const pnlPct = pnl != null ? ((cur - pos.buyPrice) / pos.buyPrice) * 100 : null;
                const toTarget = pos.targetPrice && cur ? ((pos.targetPrice - cur) / cur) * 100 : null;
                return (
                  <div key={pos.id} className="stc-row pf-grid-open">
                    <span className="stc-symbol">{pos.ticker}{pos.name && <span className="pf-name"> {pos.name}</span>}</span>
                    <span className="stc-price">${fmt(pos.buyPrice)}</span>
                    <span className="stc-prev">${fmt(pos.shares * pos.buyPrice)}</span>
                    <span className="stc-price">{cur != null ? `$${fmt(cur)}` : <span className="stc-na">—</span>}</span>
                    <span className={pnl != null ? (pnl >= 0 ? 'stc-change pos' : 'stc-change neg') : 'stc-prev'}>
                      {pnl != null ? `${pnl >= 0 ? '+' : ''}$${fmt(pnl)}` : '—'}
                    </span>
                    <span className={pnlPct != null ? (pnlPct >= 0 ? 'stc-change pos' : 'stc-change neg') : 'stc-prev'}>
                      {pnlPct != null ? <><span className="stc-change-arrow">{pnlPct >= 0 ? '▲' : '▼'}</span>{fmtPct(pnlPct)}</> : '—'}
                    </span>
                    <span className="stc-prev">{pos.targetPrice ? `$${fmt(pos.targetPrice)}` : '—'}</span>
                    <span className={toTarget != null ? (toTarget >= 0 ? 'stc-change pos' : 'stc-change neg') : 'stc-prev'}>
                      {toTarget != null ? fmtPct(toTarget) : '—'}
                    </span>
                    <span className="pf-actions">
                      <button className="pf-row-btn sell" onClick={() => startSell(pos)}>Sell</button>
                      <button className="pf-row-btn edit" onClick={() => startEdit(pos)}>✎</button>
                      <button className="pf-row-btn del" onClick={() => deletePosition(pos.id)}>✕</button>
                    </span>
                  </div>
                );
              })}
            </div>
          )
      )}

      {/* Closed trades */}
      {tab === 'closed' && (
        closedTrades.length === 0
          ? <div className="stc-empty">No closed trades yet.</div>
          : (
            <div className="stc-list">
              <div className="stc-list-header pf-grid-closed">
                <span>Symbol</span><span>Buy</span><span>Sell</span>
                <span>P/L $</span><span>P/L %</span><span>Date</span><span></span>
              </div>
              {closedTrades.map(t => (
                <div key={t.id} className="stc-row pf-grid-closed">
                  <span className="stc-symbol">{t.ticker}</span>
                  <span className="stc-price">${fmt(t.buyPrice)}</span>
                  <span className="stc-price">${fmt(t.sellPrice)}</span>
                  <span className={t.pnl >= 0 ? 'stc-change pos' : 'stc-change neg'}>
                    {t.pnl >= 0 ? '+' : ''}${fmt(t.pnl)}
                  </span>
                  <span className={t.pnlPct >= 0 ? 'stc-change pos' : 'stc-change neg'}>
                    <span className="stc-change-arrow">{t.pnlPct >= 0 ? '▲' : '▼'}</span>{fmtPct(t.pnlPct)}
                  </span>
                  <span className="stc-prev">{t.sellDate}</span>
                  <button className="pf-row-btn del" onClick={() => deleteClosedTrade(t.id)}>✕</button>
                </div>
              ))}
            </div>
          )
      )}
    </div>
  );
}
