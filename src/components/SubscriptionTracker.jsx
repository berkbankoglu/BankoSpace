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

const DEFAULT_FORM = {
  name: '', date: '', price: '', currency: '₺',
  recurring: true, autoCharge: false, cancelBy: ''
};

function SubModal({ initial, onSave, onClose, title }) {
  const [form, setForm] = useState(initial || DEFAULT_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name.trim() || !form.date) return;
    onSave({
      ...form,
      id: form.id || Date.now(),
      name: form.name.trim(),
      price: parseFloat(form.price) || 0,
    });
    onClose();
  };

  return (
    <div className="sub-modal-overlay" onClick={onClose}>
      <div className="sub-modal" onClick={e => e.stopPropagation()}>
        <div className="sub-modal-header">
          <span className="sub-modal-title">{title}</span>
          <button className="sub-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="sub-modal-body">
          <div className="sub-field">
            <label className="sub-label">Servis Adı</label>
            <input className="sub-input" placeholder="Netflix, Spotify..." value={form.name}
              onChange={e => set('name', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
          </div>
          <div className="sub-field">
            <label className="sub-label">Ödeme Tarihi</label>
            <input className="sub-input" type="date" value={form.date}
              onChange={e => set('date', e.target.value)} />
          </div>
          <div className="sub-field">
            <label className="sub-label">Fiyat</label>
            <div className="sub-price-row">
              <select className="sub-select" value={form.currency} onChange={e => set('currency', e.target.value)}>
                <option>₺</option><option>$</option><option>€</option><option>£</option>
              </select>
              <input className="sub-input" placeholder="0.00" type="number" value={form.price}
                onChange={e => set('price', e.target.value)} />
            </div>
          </div>

          {/* Aylık tekrar */}
          <label className="sub-recurring-label">
            <div className={`sub-toggle ${form.recurring ? 'on' : ''}`} onClick={() => set('recurring', !form.recurring)}>
              <div className="sub-toggle-knob" />
            </div>
            <span>Aylık tekrar</span>
          </label>

          {/* Otomatik ödeme */}
          <label className="sub-recurring-label">
            <div className={`sub-toggle sub-toggle--auto ${form.autoCharge ? 'on' : ''}`} onClick={() => set('autoCharge', !form.autoCharge)}>
              <div className="sub-toggle-knob" />
            </div>
            <span>Otomatik ödeme <span className="sub-label-hint">(karttan otomatik çekiliyor)</span></span>
          </label>

          {/* İptal tarihi */}
          <div className="sub-field">
            <label className="sub-label">
              İptal Son Tarihi <span className="sub-label-hint">(opsiyonel)</span>
            </label>
            <input className="sub-input" type="date" value={form.cancelBy}
              onChange={e => set('cancelBy', e.target.value)} />
            <span className="sub-field-hint">Bu tarihten önce iptal etmeyi unutma</span>
          </div>
        </div>
        <div className="sub-modal-footer">
          <button className="sub-cancel-btn" onClick={onClose}>İptal</button>
          <button className="sub-confirm-btn" onClick={handleSave} disabled={!form.name.trim() || !form.date}>Kaydet</button>
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
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
  }, [subs]);

  const addSub = (sub) => setSubs(prev => [...prev, sub]);
  const updateSub = (sub) => setSubs(prev => prev.map(s => s.id === sub.id ? sub : s));
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
        <button className="sub-add-btn" onClick={() => setShowAdd(true)} title="Ekle">+</button>
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
          const cancelDays = sub.cancelBy ? getDaysUntil(sub.cancelBy) : null;
          const cancelUrgent = cancelDays !== null && cancelDays <= 5;

          return (
            <div key={sub.id}
              className={`sub-item sub-item--${urgency} ${sub.autoCharge ? 'sub-item--auto' : ''}`}
              onClick={() => setEditing(sub)}
            >
              <div className="sub-item-dot" />
              <div className="sub-item-left">
                <div className="sub-item-name-row">
                  <span className="sub-item-name">{sub.name}</span>
                  {sub.autoCharge && <span className="sub-auto-badge" title="Otomatik ödeme">⚡</span>}
                  {sub.cancelBy && (
                    <span className={`sub-cancel-badge ${cancelUrgent ? 'sub-cancel-badge--urgent' : ''}`}
                      title={`${cancelDays !== null && cancelDays >= 0 ? cancelDays + 'g içinde' : 'süresi geçti'} iptal et`}>
                      ⚠ {cancelDays !== null && cancelDays >= 0 ? `${cancelDays}g` : 'geçti'}
                    </span>
                  )}
                </div>
                <span className="sub-item-date">
                  {days === 0 ? 'Bugün' : days < 0 ? `${Math.abs(days)}g önce` : `${days}g sonra`}
                  {sub.recurring && <span className="sub-recurring-badge">↻</span>}
                </span>
              </div>
              <div className="sub-item-right">
                {sub.price > 0 && (
                  <span className="sub-item-price">{sub.currency}{sub.price.toFixed(2)}</span>
                )}
                <button className="sub-delete-btn" onClick={e => { e.stopPropagation(); deleteSub(sub.id); }}>×</button>
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <SubModal title="Abonelik Ekle" onSave={addSub} onClose={() => setShowAdd(false)} />
      )}
      {editing && (
        <SubModal title="Düzenle" initial={editing} onSave={updateSub} onClose={() => setEditing(null)} />
      )}
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

  // Upcoming payments (14 days) + urgent cancel deadlines
  const upcoming = subs
    .map(sub => ({ ...sub, nextDate: getNextPayment(sub), days: getDaysUntil(getNextPayment(sub)) }))
    .filter(sub => sub.days >= 0 && sub.days <= 14)
    .sort((a, b) => a.days - b.days);

  const cancelAlerts = subs
    .filter(s => s.cancelBy)
    .map(s => ({ ...s, cancelDays: getDaysUntil(s.cancelBy) }))
    .filter(s => s.cancelDays >= 0 && s.cancelDays <= 7)
    .sort((a, b) => a.cancelDays - b.cancelDays);

  if (upcoming.length === 0 && cancelAlerts.length === 0) return null;

  return (
    <div className="sub-widget">
      <div className="sub-widget-title">Yaklaşan Ödemeler</div>
      {cancelAlerts.map(sub => (
        <div key={'cancel-' + sub.id} className="sub-widget-item sub-widget-item--cancel">
          <span className="sub-widget-cancel-icon">⚠</span>
          <span className="sub-widget-name">{sub.name} iptal et</span>
          <span className="sub-widget-days sub-widget-days--cancel">
            {sub.cancelDays === 0 ? 'Bugün!' : `${sub.cancelDays}g`}
          </span>
        </div>
      ))}
      {upcoming.map(sub => {
        const urgency = sub.days <= 3 ? 'urgent' : sub.days <= 7 ? 'soon' : 'normal';
        return (
          <div key={sub.id} className={`sub-widget-item sub-widget-item--${urgency}`}>
            {sub.autoCharge && <span className="sub-widget-auto-icon">⚡</span>}
            <span className="sub-widget-name">{sub.name}</span>
            <span className="sub-widget-days">{sub.days === 0 ? 'Bugün!' : `${sub.days}g`}</span>
            {sub.price > 0 && <span className="sub-widget-price">{sub.currency}{sub.price.toFixed(0)}</span>}
          </div>
        );
      })}
    </div>
  );
}
