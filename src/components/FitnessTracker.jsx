import { useState, useEffect } from 'react';
import './FitnessTracker.css';
import { pushKeyToSupabase } from '../supabase';

function today() { return new Date().toISOString().slice(0, 10); }

function calcBMR(p) {
  if (!p.weight || !p.height || !p.age) return 0;
  if (p.gender === 'male') return Math.round(10 * p.weight + 6.25 * p.height - 5 * p.age + 5);
  return Math.round(10 * p.weight + 6.25 * p.height - 5 * p.age - 161);
}

const ACTIVITY = [
  { key: 'sedentary', label: 'Hareketsiz (masa başı)',    mult: 1.2   },
  { key: 'light',     label: 'Hafif aktif (1-3 gün/hf)', mult: 1.375 },
  { key: 'moderate',  label: 'Orta aktif (3-5 gün/hf)',  mult: 1.55  },
  { key: 'active',    label: 'Aktif (6-7 gün/hf)',       mult: 1.725 },
  { key: 'very',      label: 'Çok aktif (2x antrenman)',  mult: 1.9   },
];

function calcTDEE(p) {
  const bmr = calcBMR(p);
  const act = ACTIVITY.find(a => a.key === p.activity) || ACTIVITY[1];
  return Math.round(bmr * act.mult);
}

function calcBodyFat(p) {
  const { weight, height, waist, neck, hip, gender } = p;
  if (!weight || !height || !waist || !neck) return null;
  if (gender === 'female' && !hip) return null;
  try {
    if (gender === 'male') {
      const v = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
      return Math.max(0, Math.round(v * 10) / 10);
    }
    const v = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.22100 * Math.log10(height)) - 450;
    return Math.max(0, Math.round(v * 10) / 10);
  } catch { return null; }
}

function calcBMI(w, h) {
  if (!w || !h) return null;
  return Math.round((w / Math.pow(h / 100, 2)) * 10) / 10;
}

function bmiInfo(bmi) {
  if (!bmi) return null;
  if (bmi < 18.5) return { text: 'Zayıf',        color: '#58a6ff' };
  if (bmi < 25)   return { text: 'Normal',        color: '#3fb950' };
  if (bmi < 30)   return { text: 'Fazla Kilolu',  color: '#d29922' };
  return               { text: 'Obez',            color: '#f85149' };
}

function load(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
  pushKeyToSupabase(key, val);
}

function MiniSparkline({ entries, color = '#5c7cfa', height = 50 }) {
  if (!entries || entries.length < 2) return null;
  const vals = entries.map(e => e.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const W = 200, H = height;
  const px = i => (i / (entries.length - 1)) * W;
  const py = v => H - 4 - ((v - min) / (max - min || 1)) * (H - 8);
  const pts = entries.map((e, i) => `${px(i)},${py(e.value)}`).join(' ');
  const areapts = `0,${H} ${pts} ${W},${H}`;
  const gradId = `sg${color.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areapts} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

const EMPTY_PROFILE = { gender: 'male', age: '', weight: '', height: '', waist: '', neck: '', hip: '', activity: 'light', goal: 'maintain', targetWeight: '' };

export default function FitnessTracker() {
  const [profile, setProfile]               = useState(() => load('ft_profile', EMPTY_PROFILE));
  const [editingProfile, setEditingProfile] = useState(false);
  const [draft, setDraft]                   = useState(profile);
  const [weightLog, setWeightLog]           = useState(() => load('ft_weight_log', []));
  const [weightInput, setWeightInput]       = useState('');
  const [addDate, setAddDate]               = useState(today());
  const [editingIdx, setEditingIdx]         = useState(null);  // index in reversed list
  const [editDate, setEditDate]             = useState('');
  const [editVal, setEditVal]               = useState('');

  useEffect(() => { save('ft_weight_log', weightLog); }, [weightLog]);

  const bmr       = calcBMR(profile);
  const tdee      = calcTDEE(profile);
  const bmi       = calcBMI(profile.weight, profile.height);
  const bmiData   = bmiInfo(bmi);
  const bodyFat   = calcBodyFat(profile);
  const goalKcal  = profile.goal === 'cut' ? tdee - 500 : profile.goal === 'bulk' ? tdee + 300 : tdee;
  const lastWeight = weightLog.length > 0 ? weightLog[weightLog.length - 1].value : (profile.weight || null);
  const hasProfile = profile.weight && profile.height && profile.age;

  function saveProfile() {
    setProfile(draft);
    save('ft_profile', draft);
    setEditingProfile(false);
  }

  function addWeight() {
    const v = parseFloat(weightInput);
    if (!v) return;
    setWeightLog(prev => [...prev.filter(e => e.date !== addDate), { date: addDate, value: v }].sort((a, b) => a.date.localeCompare(b.date)));
    setWeightInput('');
    // if it's today or the most recent date, update profile weight too
    setProfile(p => { const np = { ...p, weight: v }; save('ft_profile', np); return np; });
    setDraft(p => ({ ...p, weight: v }));
  }

  function startEdit(reversedIdx, entry) {
    setEditingIdx(reversedIdx);
    setEditDate(entry.date);
    setEditVal(String(entry.value));
  }

  function saveEdit(originalDate) {
    const v = parseFloat(editVal);
    if (!v || !editDate) { setEditingIdx(null); return; }
    setWeightLog(prev => {
      // remove old entry by original date, add new one with editDate
      const filtered = prev.filter(e => e.date !== originalDate);
      return [...filtered, { date: editDate, value: v }].sort((a, b) => a.date.localeCompare(b.date));
    });
    setEditingIdx(null);
  }

  function deleteEntry(date) {
    setWeightLog(prev => prev.filter(e => e.date !== date));
    setEditingIdx(null);
  }

  return (
    <div className="ft-root">
      <div className="ft-scroll">

        {/* ══════════════════════════════════════
            HERO PANEL — büyük stat gösterimi
        ══════════════════════════════════════ */}
        <div className="ft-hero">
          {/* Sol: büyük rakamlar */}
          <div className="ft-hero-stats">
            <div className="ft-hstat">
              <div className="ft-hstat-val" style={{ color: '#58a6ff' }}>
                {lastWeight ?? '—'}
              </div>
              <div className="ft-hstat-unit">kg</div>
              <div className="ft-hstat-label">Mevcut Kilo</div>
            </div>

            <div className="ft-hstat-sep" />

            <div className="ft-hstat">
              <div className="ft-hstat-val" style={{ color: bodyFat != null ? '#d29922' : '#484f58' }}>
                {bodyFat != null ? `%${bodyFat}` : '—'}
              </div>
              <div className="ft-hstat-unit">yağ</div>
              <div className="ft-hstat-label">Vücut Yağ Oranı</div>
            </div>

            <div className="ft-hstat-sep" />

            <div className="ft-hstat">
              <div className="ft-hstat-val" style={{ color: '#5c7cfa' }}>
                {hasProfile ? goalKcal : '—'}
              </div>
              <div className="ft-hstat-unit">kcal</div>
              <div className="ft-hstat-label">Günlük Hedef Kalori</div>
            </div>

            {bmi && <>
              <div className="ft-hstat-sep" />
              <div className="ft-hstat">
                <div className="ft-hstat-val" style={{ color: bmiData?.color }}>{bmi}</div>
                <div className="ft-hstat-unit">bmi</div>
                <div className="ft-hstat-label">{bmiData?.text}</div>
              </div>
            </>}

            {hasProfile && <>
              <div className="ft-hstat-sep" />
              <div className="ft-hstat">
                <div className="ft-hstat-val" style={{ color: '#8b949e' }}>{tdee}</div>
                <div className="ft-hstat-unit">kcal</div>
                <div className="ft-hstat-label">TDEE</div>
              </div>
            </>}
          </div>

          {/* Sağ: profil butonu */}
          <div className="ft-hero-actions">
            {!editingProfile
              ? <button className="ft-btn-ghost" onClick={() => { setDraft(profile); setEditingProfile(true); }}>
                  {hasProfile ? 'Profili Düzenle' : '+ Profil Oluştur'}
                </button>
              : <div style={{ display: 'flex', gap: 8 }}>
                  <button className="ft-btn-accent" onClick={saveProfile}>Kaydet</button>
                  <button className="ft-btn-ghost" onClick={() => setEditingProfile(false)}>İptal</button>
                </div>
            }
          </div>
        </div>

        {/* Profil edit formu */}
        {editingProfile && (
          <div className="ft-card">
            <div className="ft-card-label" style={{ marginBottom: 12 }}>Profil Bilgileri</div>
            <div className="ft-profile-grid">
              {[
                { key: 'gender',       label: 'Cinsiyet',   type: 'select', opts: [['male','Erkek'],['female','Kadın']] },
                { key: 'age',          label: 'Yaş',        type: 'number', ph: '25' },
                { key: 'height',       label: 'Boy (cm)',   type: 'number', ph: '175' },
                { key: 'weight',       label: 'Kilo (kg)',  type: 'number', ph: '75' },
                { key: 'targetWeight', label: 'Hedef (kg)', type: 'number', ph: '70' },
                { key: 'waist',        label: 'Bel (cm)',   type: 'number', ph: '85' },
                { key: 'neck',         label: 'Boyun (cm)', type: 'number', ph: '38' },
                ...(draft.gender === 'female' ? [{ key: 'hip', label: 'Kalça (cm)', type: 'number', ph: '95' }] : []),
              ].map(f => (
                <label key={f.key} className="ft-label">
                  {f.label}
                  {f.type === 'select'
                    ? <select className="ft-input" value={draft[f.key]} onChange={e => setDraft(p => ({ ...p, [f.key]: e.target.value }))}>
                        {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    : <input className="ft-input" type="number" placeholder={f.ph} value={draft[f.key]} onChange={e => setDraft(p => ({ ...p, [f.key]: e.target.value }))} />
                  }
                </label>
              ))}
              <label className="ft-label" style={{ gridColumn: '1/-1' }}>
                Aktivite
                <select className="ft-input" value={draft.activity} onChange={e => setDraft(p => ({ ...p, activity: e.target.value }))}>
                  {ACTIVITY.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </label>
              <label className="ft-label" style={{ gridColumn: '1/-1' }}>
                Hedef
                <select className="ft-input" value={draft.goal} onChange={e => setDraft(p => ({ ...p, goal: e.target.value }))}>
                  <option value="cut">Yağ Yakma (Kalori Açığı -500)</option>
                  <option value="maintain">Kilo Koruma</option>
                  <option value="bulk">Kas Kazanımı (+300)</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            ALT KISIM — kilo takibi (dar, solda)
        ══════════════════════════════════════ */}
        <div className="ft-bottom-row">
          <div className="ft-card ft-weight-card">
            <div className="ft-card-header">
              <div className="ft-card-label">Kilo Takibi</div>
              {lastWeight && profile.targetWeight &&
                <span className="ft-badge">{(lastWeight - profile.targetWeight).toFixed(1)} kg kaldı</span>}
            </div>

            <div className="ft-weight-input-row">
              <input type="date" className="ft-input ft-date-sm" value={addDate} onChange={e => setAddDate(e.target.value)} />
              <input className="ft-input" type="number" step="0.1" placeholder="75.5 kg"
                value={weightInput}
                onChange={e => setWeightInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addWeight(); }} />
              <button className="ft-btn-accent" onClick={addWeight}>Kaydet</button>
            </div>

            {weightLog.length >= 2 && (
              <div className="ft-sparkline-wrap">
                <MiniSparkline entries={weightLog.slice(-14)} color="#5c7cfa" height={56} />
              </div>
            )}

            {weightLog.length === 0 && <div className="ft-empty">Henüz kilo kaydı yok</div>}

            <div className="ft-weight-list">
              {[...weightLog].reverse().slice(0, 8).map((e, i) => (
                editingIdx === i ? (
                  <div key={i} className="ft-list-row ft-list-editing">
                    <input type="date" className="ft-input ft-edit-input" value={editDate} onChange={ev => setEditDate(ev.target.value)} />
                    <input type="number" step="0.1" className="ft-input ft-edit-input" value={editVal} onChange={ev => setEditVal(ev.target.value)}
                      onKeyDown={ev => { if (ev.key === 'Enter') saveEdit(e.date); if (ev.key === 'Escape') setEditingIdx(null); }} />
                    <button className="ft-btn-accent ft-edit-save" onClick={() => saveEdit(e.date)}>✓</button>
                    <button className="ft-del-btn" onClick={() => deleteEntry(e.date)} title="Sil">×</button>
                    <button className="ft-btn-ghost ft-edit-cancel" onClick={() => setEditingIdx(null)}>İptal</button>
                  </div>
                ) : (
                  <div key={i} className="ft-list-row ft-list-clickable" onClick={() => startEdit(i, e)} title="Düzenlemek için tıkla">
                    <span className="ft-list-date">{e.date}</span>
                    <span className="ft-list-val">{e.value} kg</span>
                    {profile.targetWeight && (
                      <span className="ft-list-sub">{(e.value - profile.targetWeight).toFixed(1)} kg</span>
                    )}
                    <span className="ft-list-edit-hint">✎</span>
                  </div>
                )
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
