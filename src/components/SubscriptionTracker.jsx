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
    while (next < today) next.setMonth(next.getMonth() + 1);
  }
  return next.toISOString().split('T')[0];
}

function AddModal({ onAdd, onClose }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('₺');
  const [recurring, setRecurring] = useState(true);

  const handleAdd = () => {
    if (!name.trim() || !date) return;
    onAdd({ id: Date.now(), name: name.trim(), date, price: parseFloat(price) || 0, currency, recurring });
    onClose();
  };

  return (
    <div className="sub-modal-overlay" onClick={onClose}>
      <div className="sub-modal" onClick={e => e.stopPropagation()}>
        <div className="sub-modal-header">
          <span className="sub-modal-title">Abonelik Ekle</span>
          <button className="sub-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="sub-modal-body">
          <div className="sub-field">
            <label className="sub-label">Servis Adı</label>
            <input
              className="sub-input"
              placeholder="Netflix, Spotify..."
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              autoFocus
            />
          </div>
          <div className="sub-field">
            <label className="sub-label">Ödeme Tarihi</label>
            <input
              className="sub-input"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <div className="sub-field">
            <label className="sub-label">Fiyat</label>
            <div className="sub-price-row">
              <select className="sub-select" value={currency} onChange={e => setCurrency(e.target.value)}>
                <option>₺</option>
                <option>$</option>
                <option>€</option>
                <option>£</option>
              </select>
              <input
                className="sub-input"
                placeholder="0.00"
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
              />
            </div>
          </div>
          <label className="sub-recurring-label">
            <div className={`sub-toggle ${recurring ? 'on' : ''}`} onClick={() => setRecurring(r => !r)}>
              <div className="sub-toggle-knob" />
            </div>
            <span>Aylık tekrar</span>
          </label>
        </div>
        <div className="sub-modal-footer">
          <button className="sub-cancel-btn" onClick={onClose}>İptal</button>
          <button className="sub-confirm-btn" onClick={handleAdd} disabled={!name.trim() || !date}>Ekle</button>
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionTracker() {
  const [subs, setSubs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  });
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
  }, [subs]);

  const addSub = (sub) => setSubs(prev => [...prev, sub]);
  const deleteSub = (id) => setSubs(prev => prev.filter(s => s.id !== id));

  const sorted = [...subs].sort((a, b) =>
    getDaysUntil(getNextPayment(a)) - getDaysUntil(getNextPayment(b))
  );

  const totalMonthly = subs
    .filter(s => s.recurring)
    .reduce((sum, s) => sum + (s.currency === '₺' ? s.price : 0), 0);

  return (
    <div className="sub-tracker">
      <div className="sub-header">
        <div className="sub-header-left">
          <span className="sub-title">ABONELİKLER</span>
          {totalMonthly > 0 && (
            <span className="sub-monthly-total">₺{totalMonthly.toFixed(0)}/ay</span>
          )}
        </div>
        <button className="sub-add-btn" onClick={() => setShowModal(true)} title="Ekle">+</button>
      </div>

      <div className="sub-list">
        {sorted.length === 0 && (
          <div className="sub-empty">
            <div className="sub-empty-icon">◈</div>
            <div>Abonelik yok</div>
            <div className="sub-empty-hint">+ ile ekle</div>
          </div>
        )}
        {sorted.map(sub => {
          const nextDate = getNextPayment(sub);
          const days = getDaysUntil(nextDate);
          const urgency = days <= 3 ? 'urgent' : days <= 7 ? 'soon' : 'normal';
          return (
            <div key={sub.id} className={`sub-item sub-item--${urgency}`}>
              <div className="sub-item-dot" />
              <div className="sub-item-left">
                <span className="sub-item-name">{sub.name}</span>
                <span className="sub-item-date">
                  {days === 0 ? 'Bugün' : days < 0 ? `${Math.abs(days)}g önce` : `${days}g sonra`}
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

      {showModal && <AddModal onAdd={addSub} onClose={() => setShowModal(false)} />}
    </div>
  );
}

export function SubscriptionWidget() {
  const [subs, setSubs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  });

  useEffect(() => {
    const interval = setInterval(() => {
      try { setSubs(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []); } catch {}
    }, 2000);
    return () => clearInterval(interval);
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
            <span className="sub-widget-days">{sub.days === 0 ? 'Bugün!' : `${sub.days}g`}</span>
            {sub.price > 0 && <span className="sub-widget-price">{sub.currency}{sub.price.toFixed(0)}</span>}
          </div>
        );
      })}
    </div>
  );
}
