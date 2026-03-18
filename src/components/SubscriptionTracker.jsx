import { useState, useEffect } from 'react';
import './SubscriptionTracker.css';

const SUB_KEY = 'subscriptions';
const PAY_KEY = 'payments';

function todayIST() {
  // Istanbul = UTC+3, always
  const now = new Date();
  const istOffset = 3 * 60;
  const localOffset = now.getTimezoneOffset();
  const diff = (istOffset + localOffset) * 60 * 1000;
  const ist = new Date(now.getTime() + diff);
  ist.setHours(0, 0, 0, 0);
  return ist;
}

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getDaysUntil(dateStr) {
  const today = todayIST();
  const target = parseLocalDate(dateStr);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function getNextPayment(sub) {
  const today = todayIST();
  let next = parseLocalDate(sub.date);
  if (sub.recurring) {
    while (next < today) next.setMonth(next.getMonth() + 1);
  }
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const d = String(next.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function useLocalStorage(key, def) {
  const [val, setVal] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(val)); }, [key, val]);
  return [val, setVal];
}

// ─── Sub Modal ────────────────────────────────────────────────
const SUB_DEFAULT = { name: '', date: '', price: '', currency: '₺', recurring: true, autoCharge: false, cancelBy: '' };

function SubModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || SUB_DEFAULT);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.name.trim() || !form.date) return;
    onSave({ ...form, id: form.id || Date.now(), name: form.name.trim(), price: parseFloat(form.price) || 0 });
    onClose();
  };
  return (
    <div className="sub-modal-overlay" onClick={onClose}>
      <div className="sub-modal" onClick={e => e.stopPropagation()}>
        <div className="sub-modal-header">
          <span className="sub-modal-title">{form.id ? 'Abonelik Düzenle' : 'Abonelik Ekle'}</span>
          <button className="sub-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="sub-modal-body">
          <div className="sub-field">
            <label className="sub-label">Servis Adı</label>
            <input className="sub-input" placeholder="Netflix, Spotify..." value={form.name}
              onChange={e => set('name', e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
          </div>
          <div className="sub-field">
            <label className="sub-label">Ödeme Tarihi</label>
            <input className="sub-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
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
          <label className="sub-recurring-label">
            <div className={`sub-toggle ${form.recurring ? 'on' : ''}`} onClick={() => set('recurring', !form.recurring)}>
              <div className="sub-toggle-knob" />
            </div>
            <span>Aylık tekrar</span>
          </label>
          <label className="sub-recurring-label">
            <div className={`sub-toggle sub-toggle--auto ${form.autoCharge ? 'on' : ''}`} onClick={() => set('autoCharge', !form.autoCharge)}>
              <div className="sub-toggle-knob" />
            </div>
            <span>Otomatik ödeme <span className="sub-label-hint">(karttan otomatik çekiliyor)</span></span>
          </label>
          <div className="sub-field">
            <label className="sub-label">İptal Son Tarihi <span className="sub-label-hint">(opsiyonel)</span></label>
            <input className="sub-input" type="date" value={form.cancelBy} onChange={e => set('cancelBy', e.target.value)} />
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

// ─── Payment Modal ────────────────────────────────────────────
const PAY_DEFAULT = { name: '', date: '', price: '', currency: '₺', type: 'manual', note: '' };
// type: 'manual' = manuel/nakit, 'card' = kredi kartı

function PayModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || PAY_DEFAULT);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.name.trim() || !form.date) return;
    onSave({ ...form, id: form.id || Date.now(), name: form.name.trim(), price: parseFloat(form.price) || 0 });
    onClose();
  };
  return (
    <div className="sub-modal-overlay" onClick={onClose}>
      <div className="sub-modal" onClick={e => e.stopPropagation()}>
        <div className="sub-modal-header">
          <span className="sub-modal-title">{form.id ? 'Ödeme Düzenle' : 'Ödeme Ekle'}</span>
          <button className="sub-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="sub-modal-body">
          <div className="sub-field">
            <label className="sub-label">Açıklama</label>
            <input className="sub-input" placeholder="Elektrik, kira, alışveriş..." value={form.name}
              onChange={e => set('name', e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
          </div>
          <div className="sub-field">
            <label className="sub-label">Ödeme Tarihi</label>
            <input className="sub-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
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
          <div className="sub-field">
            <label className="sub-label">Ödeme Tipi</label>
            <div className="sub-type-row">
              <button className={`sub-type-btn ${form.type === 'manual' ? 'active' : ''}`} onClick={() => set('type', 'manual')}>
                <span>✋</span> Manuel
              </button>
              <button className={`sub-type-btn ${form.type === 'card' ? 'active' : ''}`} onClick={() => set('type', 'card')}>
                <span>💳</span> Kredi Kartı
              </button>
            </div>
          </div>
          <div className="sub-field">
            <label className="sub-label">Not <span className="sub-label-hint">(opsiyonel)</span></label>
            <input className="sub-input" placeholder="Ek bilgi..." value={form.note}
              onChange={e => set('note', e.target.value)} />
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

// ─── Main Panel (used in dashboard right column) ──────────────
export default function SubscriptionTracker() {
  const [subs, setSubs] = useLocalStorage(SUB_KEY, []);
  const [pays, setPays] = useLocalStorage(PAY_KEY, []);
  const [tab, setTab] = useState('subs');
  const [showAddSub, setShowAddSub] = useState(false);
  const [showAddPay, setShowAddPay] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [editingPay, setEditingPay] = useState(null);

  const addSub = (s) => setSubs(p => [...p, s]);
  const updateSub = (s) => setSubs(p => p.map(x => x.id === s.id ? s : x));
  const deleteSub = (id) => setSubs(p => p.filter(x => x.id !== id));

  const addPay = (s) => setPays(p => [...p, s]);
  const updatePay = (s) => setPays(p => p.map(x => x.id === s.id ? s : x));
  const deletePay = (id) => setPays(p => p.filter(x => x.id !== id));

  const sortedSubs = [...subs].sort((a, b) =>
    getDaysUntil(getNextPayment(a)) - getDaysUntil(getNextPayment(b))
  );
  const sortedPays = [...pays].sort((a, b) => getDaysUntil(a.date) - getDaysUntil(b.date));

  const totalMonthly = subs.filter(s => s.recurring)
    .reduce((sum, s) => sum + (s.currency === '₺' ? s.price : 0), 0);

  return (
    <div className="sub-tracker">
      <div className="sub-header">
        <div className="sub-tabs">
          <button className={`sub-tab ${tab === 'subs' ? 'active' : ''}`} onClick={() => setTab('subs')}>
            Abonelikler
            {totalMonthly > 0 && tab !== 'subs' && <span className="sub-tab-badge">₺{totalMonthly.toFixed(0)}</span>}
          </button>
          <button className={`sub-tab ${tab === 'pays' ? 'active' : ''}`} onClick={() => setTab('pays')}>
            Ödemeler
            {pays.length > 0 && <span className="sub-tab-count">{pays.length}</span>}
          </button>
        </div>
        <button className="sub-add-btn" onClick={() => tab === 'subs' ? setShowAddSub(true) : setShowAddPay(true)} title="Ekle">+</button>
      </div>

      {tab === 'subs' && (
        <div className="sub-list">
          {totalMonthly > 0 && (
            <div className="sub-total-row">
              <span>Aylık toplam</span>
              <span className="sub-total-amount">₺{totalMonthly.toFixed(0)}</span>
            </div>
          )}
          {sortedSubs.length === 0 && (
            <div className="sub-empty"><div className="sub-empty-icon">◈</div><div>Abonelik yok</div><div className="sub-empty-hint">+ ile ekle</div></div>
          )}
          {sortedSubs.map(sub => {
            const days = getDaysUntil(getNextPayment(sub));
            const urgency = days <= 3 ? 'urgent' : days <= 7 ? 'soon' : 'normal';
            const cancelDays = sub.cancelBy ? getDaysUntil(sub.cancelBy) : null;
            return (
              <div key={sub.id} className={`sub-item sub-item--${urgency} ${sub.autoCharge ? 'sub-item--auto' : ''}`}
                onClick={() => setEditingSub(sub)}>
                <div className="sub-item-dot" />
                <div className="sub-item-left">
                  <div className="sub-item-name-row">
                    <span className="sub-item-name">{sub.name}</span>
                    {sub.autoCharge && <span className="sub-auto-badge" title="Otomatik">⚡</span>}
                    {sub.cancelBy && cancelDays !== null && (
                      <span className={`sub-cancel-badge ${cancelDays <= 5 ? 'sub-cancel-badge--urgent' : ''}`}>
                        ⚠ {cancelDays >= 0 ? `${cancelDays}g` : 'geçti'}
                      </span>
                    )}
                  </div>
                  <span className="sub-item-date">
                    {days === 0 ? 'Bugün' : days < 0 ? `${Math.abs(days)}g önce` : `${days}g sonra`}
                    {sub.recurring && <span className="sub-recurring-badge">↻</span>}
                  </span>
                </div>
                <div className="sub-item-right">
                  {sub.price > 0 && <span className="sub-item-price">{sub.currency}{sub.price.toFixed(2)}</span>}
                  <button className="sub-delete-btn" onClick={e => { e.stopPropagation(); deleteSub(sub.id); }}>×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'pays' && (
        <div className="sub-list">
          {sortedPays.length === 0 && (
            <div className="sub-empty"><div className="sub-empty-icon">💳</div><div>Ödeme yok</div><div className="sub-empty-hint">+ ile ekle</div></div>
          )}
          {sortedPays.map(pay => {
            const days = getDaysUntil(pay.date);
            const urgency = days <= 3 ? 'urgent' : days <= 7 ? 'soon' : 'normal';
            return (
              <div key={pay.id} className={`sub-item sub-item--${urgency} sub-item--pay-${pay.type}`}
                onClick={() => setEditingPay(pay)}>
                <div className="sub-item-dot" />
                <div className="sub-item-left">
                  <div className="sub-item-name-row">
                    <span className="sub-pay-type-icon">{pay.type === 'card' ? '💳' : '✋'}</span>
                    <span className="sub-item-name">{pay.name}</span>
                  </div>
                  <span className="sub-item-date">
                    {days === 0 ? 'Bugün' : days < 0 ? `${Math.abs(days)}g önce` : `${days}g sonra`}
                    {pay.note && <span className="sub-pay-note"> · {pay.note}</span>}
                  </span>
                </div>
                <div className="sub-item-right">
                  {pay.price > 0 && <span className="sub-item-price">{pay.currency}{pay.price.toFixed(2)}</span>}
                  <button className="sub-delete-btn" onClick={e => { e.stopPropagation(); deletePay(pay.id); }}>×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddSub && <SubModal onSave={addSub} onClose={() => setShowAddSub(false)} />}
      {showAddPay && <PayModal onSave={addPay} onClose={() => setShowAddPay(false)} />}
      {editingSub && <SubModal initial={editingSub} onSave={updateSub} onClose={() => setEditingSub(null)} />}
      {editingPay && <PayModal initial={editingPay} onSave={updatePay} onClose={() => setEditingPay(null)} />}
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

// ─── Widget for upcoming (dashboard top bar or elsewhere) ─────
export function SubscriptionWidget() {
  const [subs, setSubs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SUB_KEY)) || []; } catch { return []; }
  });
  const [pays, setPays] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PAY_KEY)) || []; } catch { return []; }
  });

  useEffect(() => {
    const interval = setInterval(() => {
      try {
        setSubs(JSON.parse(localStorage.getItem(SUB_KEY)) || []);
        setPays(JSON.parse(localStorage.getItem(PAY_KEY)) || []);
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const upcomingSubs = subs
    .map(s => ({ ...s, days: getDaysUntil(getNextPayment(s)), kind: 'sub' }))
    .filter(s => s.days >= 0 && s.days <= 14);

  const upcomingPays = pays
    .map(p => ({ ...p, days: getDaysUntil(p.date), kind: 'pay' }))
    .filter(p => p.days >= 0 && p.days <= 14);

  const cancelAlerts = subs
    .filter(s => s.cancelBy)
    .map(s => ({ ...s, cancelDays: getDaysUntil(s.cancelBy) }))
    .filter(s => s.cancelDays >= 0 && s.cancelDays <= 7)
    .sort((a, b) => a.cancelDays - b.cancelDays);

  const all = [...upcomingSubs, ...upcomingPays].sort((a, b) => a.days - b.days);

  if (all.length === 0 && cancelAlerts.length === 0) return null;

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
      {all.map(item => {
        const urgency = item.days <= 3 ? 'urgent' : item.days <= 7 ? 'soon' : 'normal';
        return (
          <div key={item.kind + item.id} className={`sub-widget-item sub-widget-item--${urgency}`}>
            <span className="sub-widget-type-icon">{item.kind === 'pay' ? (item.type === 'card' ? '💳' : '✋') : (item.autoCharge ? '⚡' : '◈')}</span>
            <span className="sub-widget-name">{item.name}</span>
            <span className="sub-widget-days">{item.days === 0 ? 'Bugün!' : `${item.days}g`}</span>
            {item.price > 0 && <span className="sub-widget-price">{item.currency}{item.price.toFixed(0)}</span>}
          </div>
        );
      })}
    </div>
  );
}
