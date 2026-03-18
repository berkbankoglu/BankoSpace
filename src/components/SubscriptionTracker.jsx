import { useState, useEffect } from 'react';
import './SubscriptionTracker.css';

const STORAGE_KEY = 'subscriptions';

function getDaysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function getNextPayment(sub) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = new Date(sub.date);
  next.setHours(0, 0, 0, 0);

  if (sub.recurring) {
    // Advance monthly until next >= today
    while (next < today) {
      next.setMonth(next.getMonth() + 1);
    }
  }
  return next.toISOString().split('T')[0];
}

export default function SubscriptionTracker() {
  const [subs, setSubs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  });
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('₺');
  const [recurring, setRecurring] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
  }, [subs]);

  const addSub = () => {
    if (!name.trim() || !date) return;
    const newSub = {
      id: Date.now(),
      name: name.trim(),
      date,
      price: parseFloat(price) || 0,
      currency,
      recurring,
    };
    setSubs(prev => [...prev, newSub]);
    setName(''); setDate(''); setPrice(''); setAdding(false);
  };

  const deleteSub = (id) => setSubs(prev => prev.filter(s => s.id !== id));

  const sorted = [...subs].sort((a, b) => {
    const da = getDaysUntil(getNextPayment(a));
    const db = getDaysUntil(getNextPayment(b));
    return da - db;
  });

  return (
    <div className="sub-tracker">
      <div className="sub-header">
        <span className="sub-title">Abonelikler</span>
        <button className="sub-add-btn" onClick={() => setAdding(a => !a)} title="Ekle">+</button>
      </div>

      {adding && (
        <div className="sub-form">
          <input
            className="sub-input"
            placeholder="Servis adı"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSub()}
            autoFocus
          />
          <div className="sub-form-row">
            <input
              className="sub-input sub-input-price"
              placeholder="Fiyat"
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
            />
            <select className="sub-select" value={currency} onChange={e => setCurrency(e.target.value)}>
              <option>₺</option>
              <option>$</option>
              <option>€</option>
              <option>£</option>
            </select>
          </div>
          <input
            className="sub-input"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          <label className="sub-recurring-label">
            <input
              type="checkbox"
              checked={recurring}
              onChange={e => setRecurring(e.target.checked)}
            />
            <span>Aylık tekrar</span>
          </label>
          <div className="sub-form-actions">
            <button className="sub-confirm-btn" onClick={addSub}>Ekle</button>
            <button className="sub-cancel-btn" onClick={() => setAdding(false)}>İptal</button>
          </div>
        </div>
      )}

      <div className="sub-list">
        {sorted.length === 0 && (
          <div className="sub-empty">Henüz abonelik yok</div>
        )}
        {sorted.map(sub => {
          const nextDate = getNextPayment(sub);
          const days = getDaysUntil(nextDate);
          const urgency = days <= 3 ? 'urgent' : days <= 7 ? 'soon' : 'normal';
          return (
            <div key={sub.id} className={`sub-item sub-item--${urgency}`}>
              <div className="sub-item-left">
                <span className="sub-item-name">{sub.name}</span>
                <span className="sub-item-date">
                  {days === 0 ? 'Bugün' : days < 0 ? `${Math.abs(days)}g geçti` : `${days}g sonra`}
                  {sub.recurring && <span className="sub-recurring-badge">↻</span>}
                </span>
              </div>
              <div className="sub-item-right">
                {sub.price > 0 && (
                  <span className="sub-item-price">{sub.currency}{sub.price.toFixed(2)}</span>
                )}
                <button className="sub-delete-btn" onClick={() => deleteSub(sub.id)}>×</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Mini widget for dashboard sidebar - shows only upcoming (within 14 days)
export function SubscriptionWidget() {
  const [subs, setSubs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  });

  // Listen for storage changes
  useEffect(() => {
    const handler = (e) => {
      if (e.key === STORAGE_KEY) {
        try { setSubs(JSON.parse(e.newValue) || []); }
        catch {}
      }
    };
    window.addEventListener('storage', handler);
    // Also poll localStorage since same-tab changes don't fire storage event
    const interval = setInterval(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        setSubs(stored);
      } catch {}
    }, 2000);
    return () => { window.removeEventListener('storage', handler); clearInterval(interval); };
  }, []);

  const upcoming = subs
    .map(sub => ({ ...sub, nextDate: getNextPayment(sub), days: getDaysUntil(getNextPayment(sub)) }))
    .filter(sub => sub.days >= 0 && sub.days <= 14)
    .sort((a, b) => a.days - b.days);

  if (upcoming.length === 0) return null;

  return (
    <div className="sub-widget">
      <div className="sub-widget-title">Yaklaşan Ödemeler</div>
      {upcoming.map(sub => {
        const urgency = sub.days <= 3 ? 'urgent' : sub.days <= 7 ? 'soon' : 'normal';
        return (
          <div key={sub.id} className={`sub-widget-item sub-widget-item--${urgency}`}>
            <span className="sub-widget-name">{sub.name}</span>
            <span className="sub-widget-days">
              {sub.days === 0 ? 'Bugün!' : `${sub.days}g`}
            </span>
            {sub.price > 0 && (
              <span className="sub-widget-price">{sub.currency}{sub.price.toFixed(0)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
