import { useState, useEffect, useRef } from 'react';
import './SubscriptionTracker.css';

const STORAGE_KEY = 'payments_v2';

function todayLocal() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getDaysUntil(dateStr) {
  return Math.ceil((parseLocalDate(dateStr) - todayLocal()) / 86400000);
}

function getNextMonthly(dateStr) {
  const today = todayLocal();
  let d = parseLocalDate(dateStr);
  while (d < today) d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function useLocalStorage(key, def) {
  const [val, setVal] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; }
  });
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    localStorage.setItem(key, JSON.stringify(val));
  }, [key, val]);
  return [val, setVal];
}

// category: 'monthly-auto' | 'monthly-manual' | 'once-payment' | 'once-cancel'
const EMPTY_FORM = { name: '', date: '', price: '', currency: '₺', category: 'monthly-auto', cancelBy: '', note: '' };

function AddModal({ initial, onSave, onDelete, onClose }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(initial ? { ...EMPTY_FORM, ...initial } : EMPTY_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    const needsDate = form.category !== 'once-cancel';
    if (!form.name.trim() || (needsDate && !form.date)) return;
    onSave({ ...form, id: form.id || Date.now(), name: form.name.trim(), price: parseFloat(form.price) || 0 });
    onClose();
  };

  return (
    <div className="sub-modal-overlay" onClick={onClose}>
      <div className="sub-modal" onClick={e => e.stopPropagation()}>
        <div className="sub-modal-header">
          <span className="sub-modal-title">{isEdit ? 'Edit' : 'New Entry'}</span>
          <button className="sub-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="sub-modal-body">
          {/* Primary choice: Monthly / One-time */}
          <div className="sub-cat-grid sub-cat-grid--top">
            <button className={`sub-cat-btn ${!form.category.startsWith('once') ? 'active active--monthly' : ''}`}
              onClick={() => { if (form.category.startsWith('once')) set('category', 'monthly-auto'); }}>
              Monthly
            </button>
            <button className={`sub-cat-btn ${form.category.startsWith('once') ? 'active active--once' : ''}`}
              onClick={() => { if (!form.category.startsWith('once')) set('category', 'once-payment'); }}>
              One-Time
            </button>
          </div>

          {/* Monthly sub-choice: Automatic / Manual */}
          {!form.category.startsWith('once') && (
            <div className="sub-cat-grid sub-cat-grid--sub">
              <button className={`sub-cat-btn sub-cat-btn--sm ${form.category === 'monthly-auto' ? 'active active--auto' : ''}`}
                onClick={() => set('category', 'monthly-auto')}>
                Automatic
              </button>
              <button className={`sub-cat-btn sub-cat-btn--sm ${form.category === 'monthly-manual' ? 'active active--manual' : ''}`}
                onClick={() => set('category', 'monthly-manual')}>
                Manual
              </button>
            </div>
          )}

          {/* One-time sub-choice: Payment / Cancel */}
          {form.category.startsWith('once') && (
            <div className="sub-cat-grid sub-cat-grid--sub">
              <button className={`sub-cat-btn sub-cat-btn--sm ${form.category === 'once-payment' ? 'active active--manual' : ''}`}
                onClick={() => set('category', 'once-payment')}>
                Payment
              </button>
              <button className={`sub-cat-btn sub-cat-btn--sm ${form.category === 'once-cancel' ? 'active active--cancel' : ''}`}
                onClick={() => set('category', 'once-cancel')}>
                Cancel
              </button>
            </div>
          )}


          <div className="sub-field">
            <label className="sub-label">Description</label>
            <input className="sub-input" autoFocus
              placeholder={form.category === 'monthly-auto' ? 'Netflix, Spotify, iCloud...' : form.category === 'monthly-manual' ? 'Rent, electricity, accounting...' : 'Shopping, bills...'}
              value={form.name} onChange={e => set('name', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()} />
          </div>

          {form.category !== 'once-cancel' && (
            <div className="sub-two-col">
              <div className="sub-field">
                <label className="sub-label">{form.category.startsWith('once') ? 'Date' : 'Day of month'}</label>
                <input className="sub-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
              </div>
              <div className="sub-field">
                <label className="sub-label">Amount</label>
                <div className="sub-price-row">
                  <select className="sub-select" value={form.currency} onChange={e => set('currency', e.target.value)}>
                    <option>₺</option><option>$</option><option>€</option><option>£</option>
                  </select>
                  <input className="sub-input" placeholder="0.00" type="number" min="0" value={form.price}
                    onChange={e => set('price', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {form.category === 'once-cancel' && (
            <div className="sub-field">
              <label className="sub-label">Cancel By Date</label>
              <input className="sub-input" type="date" value={form.cancelBy} onChange={e => set('cancelBy', e.target.value)} />
            </div>
          )}

          {form.category !== 'once-cancel' && (
            <div className="sub-field">
              <label className="sub-label">Note <span className="sub-label-hint">(optional)</span></label>
              <input className="sub-input" placeholder="Additional info..." value={form.note} onChange={e => set('note', e.target.value)} />
            </div>
          )}
        </div>

        <div className="sub-modal-footer">
          {isEdit && <button className="sub-delete-modal-btn" onClick={() => { onDelete(form.id); onClose(); }}>Delete</button>}
          <div className="sub-modal-footer-right">
            <button className="sub-cancel-btn" onClick={onClose}>Cancel</button>
            <button className="sub-confirm-btn" onClick={handleSave} disabled={!form.name.trim() || (form.category !== 'once-cancel' && !form.date)}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Item({ item, onClick, onComplete, animIndex = 0 }) {
  const isMonthly = item.category === 'monthly-auto' || item.category === 'monthly-manual';
  const isOnce = item.category === 'once-payment' || item.category === 'once-cancel' || item.category === 'once';
  const dateForCalc = isMonthly ? getNextMonthly(item.date) : (item.date || item.cancelBy || '');
  const days = dateForCalc ? getDaysUntil(dateForCalc) : null;
  const isOverdue = !item.done && days !== null && days < 0;
  const urgency = item.done ? 'done' : (days !== null ? (days <= 3 ? 'urgent' : days <= 7 ? 'soon' : 'normal') : 'normal');
  const cancelDays = item.cancelBy ? getDaysUntil(item.cancelBy) : null;

  return (
    <div
      className={`sub-item sub-item--${urgency} sub-item--${item.category} ${item.done ? 'sub-item--done' : ''} ${isOverdue ? 'sub-item--overdue' : ''}`}
      style={{ animationDelay: `${animIndex * 0.22}s` }}
      onClick={onClick}
    >
      <div className="sub-item-left">
        <div className="sub-item-name-row">
          <span className="sub-item-name">{item.name}</span>
          {isOverdue && <span className="sub-cancel-badge sub-cancel-badge--urgent">overdue</span>}
          {cancelDays !== null && !isOverdue && (
            <span className={`sub-cancel-badge ${cancelDays <= 5 ? 'sub-cancel-badge--urgent' : ''}`}>
              ⚠ {cancelDays >= 0 ? `${cancelDays}d` : 'past'}
            </span>
          )}
        </div>
        <span className="sub-item-date">
          {item.done ? 'Done' : days === null ? '—' : days === 0 ? 'Today' : days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`}
          {item.note && <span className="sub-pay-note"> · {item.note}</span>}
        </span>
      </div>
      <div className="sub-item-right">
        {item.price > 0 && <span className="sub-item-price">{item.currency}{item.price.toFixed(2)}</span>}
        {isOnce && !item.done && (
          <button className="sub-complete-btn" title="Mark as done"
            onClick={e => { e.stopPropagation(); onComplete(item.id); }}>✓</button>
        )}
      </div>
    </div>
  );
}

export default function SubscriptionTracker() {
  const [items, setItems] = useLocalStorage(STORAGE_KEY, []);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  const save = (item) => {
    setItems(prev => {
      const exists = prev.find(x => x.id === item.id);
      return exists ? prev.map(x => x.id === item.id ? item : x) : [...prev, item];
    });
  };
  const remove = (id) => setItems(prev => prev.filter(x => x.id !== id));
  const complete = (id) => setItems(prev => prev.filter(x => x.id !== id));

  const sortByDays = (arr) => [...arr].sort((a, b) => {
    const isM = c => c === 'monthly-auto' || c === 'monthly-manual';
    const da = isM(a.category) ? getDaysUntil(getNextMonthly(a.date)) : getDaysUntil(a.date);
    const db = isM(b.category) ? getDaysUntil(getNextMonthly(b.date)) : getDaysUntil(b.date);
    return da - db;
  });

  const autoItems = sortByDays(items.filter(i => i.category === 'monthly-auto'));
  const manualItems = sortByDays(items.filter(i => i.category === 'monthly-manual'));
  const oncePayItems = sortByDays(items.filter(i => (i.category === 'once-payment' || i.category === 'once') && !i.done));
  const onceCancelItems = sortByDays(items.filter(i => i.category === 'once-cancel' && !i.done));

  const totalAuto = autoItems.reduce((s, i) => s + (i.currency === '₺' ? i.price : 0), 0);
  const totalManual = manualItems.reduce((s, i) => s + (i.currency === '₺' ? i.price : 0), 0);

  return (
    <div className="sub-tracker">
      <div className="sub-header">
        <span className="sub-header-title">Payments</span>
        <button className="sub-add-btn" onClick={() => setShowAdd(true)} title="Add">+</button>
      </div>

      <div className="sub-list">
        {items.length === 0 && (
          <div className="sub-empty">
            <div className="sub-empty-icon">—</div>
            <div>No entries yet</div>
            <div className="sub-empty-hint">Add with +</div>
          </div>
        )}

        {autoItems.length > 0 && (
          <div className="sub-section">
            <div className="sub-section-header">
              <span className="sub-section-title sub-section-title--auto">Monthly · Auto</span>
              {totalAuto > 0 && <span className="sub-section-total">₺{totalAuto.toFixed(0)}/mo</span>}
            </div>
            {autoItems.map((item, i) => <Item key={item.id} item={item} onClick={() => setEditing(item)} animIndex={i} />)}
          </div>
        )}

        {manualItems.length > 0 && (
          <div className="sub-section">
            <div className="sub-section-header">
              <span className="sub-section-title sub-section-title--manual">Monthly · Manual</span>
              {totalManual > 0 && <span className="sub-section-total">₺{totalManual.toFixed(0)}/mo</span>}
            </div>
            {manualItems.map((item, i) => <Item key={item.id} item={item} onClick={() => setEditing(item)} animIndex={autoItems.length + i} />)}
          </div>
        )}

        {oncePayItems.length > 0 && (
          <div className="sub-section">
            <div className="sub-section-header">
              <span className="sub-section-title sub-section-title--once">One-Time · Payment</span>
            </div>
            {oncePayItems.map((item, i) => <Item key={item.id} item={item} onClick={() => setEditing(item)} onComplete={complete} animIndex={autoItems.length + manualItems.length + i} />)}
          </div>
        )}

        {onceCancelItems.length > 0 && (
          <div className="sub-section">
            <div className="sub-section-header">
              <span className="sub-section-title sub-section-title--cancel">One-Time · Cancel</span>
            </div>
            {onceCancelItems.map((item, i) => <Item key={item.id} item={item} onClick={() => setEditing(item)} onComplete={complete} animIndex={autoItems.length + manualItems.length + oncePayItems.length + i} />)}
          </div>
        )}
      </div>

      {showAdd && <AddModal onSave={save} onDelete={remove} onClose={() => setShowAdd(false)} />}
      {editing && <AddModal initial={editing} onSave={save} onDelete={remove} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ─── Widget for upcoming payments ─────────────────────────────
export function SubscriptionWidget() {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  });

  useEffect(() => {
    const handler = (e) => {
      if (!e.key || e.key === STORAGE_KEY) {
        try { setItems(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []); } catch {}
      }
    };
    window.addEventListener('storage', handler);
    // also refresh once a minute for day-change (days until)
    const iv = setInterval(() => {
      try { setItems(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []); } catch {}
    }, 60000);
    return () => { window.removeEventListener('storage', handler); clearInterval(iv); };
  }, []);

  const upcoming = items.map(item => {
    const dateForCalc = item.category !== 'once' ? getNextMonthly(item.date) : item.date;
    return { ...item, days: getDaysUntil(dateForCalc) };
  }).filter(i => i.days >= 0 && i.days <= 14).sort((a, b) => a.days - b.days);

  const cancelAlerts = items
    .filter(i => i.cancelBy)
    .map(i => ({ ...i, cancelDays: getDaysUntil(i.cancelBy) }))
    .filter(i => i.cancelDays >= 0 && i.cancelDays <= 7)
    .sort((a, b) => a.cancelDays - b.cancelDays);

  if (upcoming.length === 0 && cancelAlerts.length === 0) return null;

  const icons = { 'monthly-auto': '⚡', 'monthly-manual': '✋', 'once': '◈' };

  return (
    <div className="sub-widget">
      <div className="sub-widget-title">Upcoming Payments</div>
      {cancelAlerts.map(item => (
        <div key={'c-' + item.id} className="sub-widget-item sub-widget-item--cancel">
          <span>⚠</span>
          <span className="sub-widget-name">Cancel {item.name}</span>
          <span className="sub-widget-days sub-widget-days--cancel">
            {item.cancelDays === 0 ? 'Today!' : `${item.cancelDays}d`}
          </span>
        </div>
      ))}
      {upcoming.map(item => {
        const urgency = item.days <= 3 ? 'urgent' : item.days <= 7 ? 'soon' : 'normal';
        return (
          <div key={item.id} className={`sub-widget-item sub-widget-item--${urgency}`}>
            <span>{icons[item.category]}</span>
            <span className="sub-widget-name">{item.name}</span>
            <span className="sub-widget-days">{item.days === 0 ? 'Today!' : `${item.days}d`}</span>
            {item.price > 0 && <span className="sub-widget-price">{item.currency}{item.price.toFixed(0)}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Full-screen popup version ────────────────────────────────
export function SubscriptionPopup({ onClose }) {
  return (
    <div className="sub-popup-overlay" onClick={onClose}>
      <div className="sub-popup" onClick={e => e.stopPropagation()}>
        <SubscriptionTracker />
      </div>
    </div>
  );
}
