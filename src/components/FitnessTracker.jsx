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

const MEAL_TYPES    = ['Kahvaltı', 'Öğle', 'Akşam', 'Ara Öğün'];
const WORKOUT_TYPES = ['Koşu', 'Yürüyüş', 'Bisiklet', 'Yüzme', 'Ağırlık', 'HIIT', 'Yoga', 'Diğer'];

function RingChart({ value, target, color, size = 64 }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const pct = target ? Math.min(1, value / target) : 0;
  const dash = pct * circ;
  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#21262d" strokeWidth="5" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  );
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
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areapts} fill={`url(#sg-${color.replace('#','')})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function ProgressBar({ value, target, color }) {
  const pct = target ? Math.min(100, Math.round(value / target * 100)) : 0;
  const over = target && value > target;
  return (
    <div className="ft-bar-bg">
      <div className="ft-bar-fill" style={{ width: `${pct}%`, background: over ? '#f85149' : color }} />
    </div>
  );
}

const EMPTY_PROFILE = { gender: 'male', age: '', weight: '', height: '', waist: '', neck: '', hip: '', activity: 'light', goal: 'maintain', targetWeight: '' };

export default function FitnessTracker() {
  const [profile, setProfile]               = useState(() => load('ft_profile', EMPTY_PROFILE));
  const [editingProfile, setEditingProfile] = useState(false);
  const [draft, setDraft]                   = useState(profile);

  const [weightLog, setWeightLog]           = useState(() => load('ft_weight_log', []));
  const [weightInput, setWeightInput]       = useState('');

  const [meals, setMeals]                   = useState(() => load('ft_meals', {}));
  const [mealDate, setMealDate]             = useState(today());
  const [mealForm, setMealForm]             = useState({ type: 'Kahvaltı', name: '', kcal: '', protein: '', carb: '', fat: '' });
  const [showMealForm, setShowMealForm]     = useState(false);

  const [workouts, setWorkouts]             = useState(() => load('ft_workouts', {}));
  const [workoutDate, setWorkoutDate]       = useState(today());
  const [wkForm, setWkForm]                 = useState({ type: 'Ağırlık', duration: '', kcal: '', notes: '' });
  const [showWkForm, setShowWkForm]         = useState(false);

  const [measurements, setMeasurements]     = useState(() => load('ft_measurements', []));
  const [measForm, setMeasForm]             = useState({ waist: '', hip: '', chest: '', arm: '', thigh: '' });
  const [showMeasForm, setShowMeasForm]     = useState(false);

  useEffect(() => { save('ft_weight_log', weightLog); }, [weightLog]);
  useEffect(() => { save('ft_meals', meals); }, [meals]);
  useEffect(() => { save('ft_workouts', workouts); }, [workouts]);
  useEffect(() => { save('ft_measurements', measurements); }, [measurements]);

  const bmr          = calcBMR(profile);
  const tdee         = calcTDEE(profile);
  const bmi          = calcBMI(profile.weight, profile.height);
  const bmiData      = bmiInfo(bmi);
  const bodyFat      = calcBodyFat(profile);
  const goalKcal     = profile.goal === 'cut' ? tdee - 500 : profile.goal === 'bulk' ? tdee + 300 : tdee;
  const proteinTarget = profile.weight ? Math.round(profile.weight * 2) : null;
  const fatTarget     = goalKcal ? Math.round(goalKcal * 0.25 / 9) : null;
  const carbTarget    = (goalKcal && proteinTarget && fatTarget) ? Math.round((goalKcal - proteinTarget * 4 - fatTarget * 9) / 4) : null;

  const todayMeals    = meals[mealDate] || [];
  const todayKcal     = todayMeals.reduce((s, m) => s + (Number(m.kcal)    || 0), 0);
  const todayProtein  = todayMeals.reduce((s, m) => s + (Number(m.protein) || 0), 0);
  const todayCarb     = todayMeals.reduce((s, m) => s + (Number(m.carb)    || 0), 0);
  const todayFat      = todayMeals.reduce((s, m) => s + (Number(m.fat)     || 0), 0);
  const todayWorkouts = workouts[workoutDate] || [];
  const burnedKcal    = todayWorkouts.reduce((s, w) => s + (Number(w.kcal) || 0), 0);
  const lastWeight    = weightLog.length > 0 ? weightLog[weightLog.length - 1].value : (profile.weight || null);
  const hasProfile    = profile.weight && profile.height && profile.age;
  const goalLabel     = profile.goal === 'cut' ? 'Yağ Yakma' : profile.goal === 'bulk' ? 'Kas Kazanımı' : 'Kilo Koruma';

  function saveProfile() {
    setProfile(draft);
    save('ft_profile', draft);
    setEditingProfile(false);
  }

  function addWeight() {
    const v = parseFloat(weightInput);
    if (!v) return;
    setWeightLog(prev => [...prev.filter(e => e.date !== today()), { date: today(), value: v }].sort((a, b) => a.date.localeCompare(b.date)));
    setWeightInput('');
    setProfile(p => { const np = { ...p, weight: v }; save('ft_profile', np); return np; });
    setDraft(p => ({ ...p, weight: v }));
  }

  function addMeal() {
    if (!mealForm.name || !mealForm.kcal) return;
    setMeals(prev => ({ ...prev, [mealDate]: [...(prev[mealDate] || []), { id: Date.now(), ...mealForm }] }));
    setMealForm(f => ({ ...f, name: '', kcal: '', protein: '', carb: '', fat: '' }));
    setShowMealForm(false);
  }

  function addWorkout() {
    if (!wkForm.duration) return;
    setWorkouts(prev => ({ ...prev, [workoutDate]: [...(prev[workoutDate] || []), { id: Date.now(), ...wkForm }] }));
    setWkForm(f => ({ ...f, duration: '', kcal: '', notes: '' }));
    setShowWkForm(false);
  }

  function addMeasurement() {
    const entry = { date: today(), ...measForm };
    setMeasurements(prev => [...prev.filter(e => e.date !== today()), entry].sort((a, b) => a.date.localeCompare(b.date)));
    setMeasForm({ waist: '', hip: '', chest: '', arm: '', thigh: '' });
    setShowMeasForm(false);
  }

  return (
    <div className="ft-root">
      <div className="ft-scroll">

        {/* ═══════════════════════════════════════
            HERO BANDİ — üst özet panel
        ═══════════════════════════════════════ */}
        <div className="ft-hero">
          <div className="ft-hero-left">
            <div className="ft-hero-greeting">
              {hasProfile
                ? <>Merhaba! <span className="ft-hero-accent">{goalLabel}</span> modundasın.</>
                : 'Hoş geldin! Profil bilgilerini girmek için Profil kartını düzenle.'}
            </div>
            <div className="ft-hero-stats">
              <div className="ft-hs-item">
                <span className="ft-hs-val" style={{ color: '#5c7cfa' }}>{lastWeight ?? '—'}</span>
                <span className="ft-hs-label">kg</span>
              </div>
              <div className="ft-hs-sep" />
              <div className="ft-hs-item">
                <span className="ft-hs-val" style={{ color: '#f85149' }}>{todayKcal}</span>
                <span className="ft-hs-label">kcal yenildi</span>
              </div>
              <div className="ft-hs-sep" />
              <div className="ft-hs-item">
                <span className="ft-hs-val" style={{ color: '#3fb950' }}>{burnedKcal}</span>
                <span className="ft-hs-label">kcal yakıldı</span>
              </div>
              {bmi && <>
                <div className="ft-hs-sep" />
                <div className="ft-hs-item">
                  <span className="ft-hs-val" style={{ color: bmiData?.color }}>{bmi}</span>
                  <span className="ft-hs-label">BMI · {bmiData?.text}</span>
                </div>
              </>}
              {bodyFat != null && <>
                <div className="ft-hs-sep" />
                <div className="ft-hs-item">
                  <span className="ft-hs-val" style={{ color: '#d29922' }}>%{bodyFat}</span>
                  <span className="ft-hs-label">Yağ Oranı</span>
                </div>
              </>}
            </div>
          </div>

          {/* Profil edit (hero içinde küçük) */}
          <div className="ft-hero-right">
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

        {/* Profil edit formu (tam genişlik, sadece düzenlerken) */}
        {editingProfile && (
          <div className="ft-card ft-profile-edit-card">
            <div className="ft-card-label">Profil Bilgileri</div>
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

        {/* ═══════════════════════════════════════
            STATS KARTLARI (BMR / TDEE / Hedef / Makrolar)
        ═══════════════════════════════════════ */}
        {hasProfile && (
          <div className="ft-stat-strip">
            <div className="ft-sc">
              <div className="ft-sc-icon" style={{ color: '#8b949e' }}>⚡</div>
              <div className="ft-sc-val">{bmr}</div>
              <div className="ft-sc-label">BMR kcal</div>
            </div>
            <div className="ft-sc">
              <div className="ft-sc-icon" style={{ color: '#8b949e' }}>🔥</div>
              <div className="ft-sc-val">{tdee}</div>
              <div className="ft-sc-label">TDEE kcal</div>
            </div>
            <div className="ft-sc" style={{ borderColor: '#5c7cfa44' }}>
              <div className="ft-sc-icon" style={{ color: '#5c7cfa' }}>🎯</div>
              <div className="ft-sc-val" style={{ color: '#5c7cfa' }}>{goalKcal}</div>
              <div className="ft-sc-label">Hedef kcal</div>
            </div>
            {proteinTarget && <>
              <div className="ft-sc" style={{ borderColor: '#f8514944' }}>
                <div className="ft-sc-icon" style={{ color: '#f85149' }}>🥩</div>
                <div className="ft-sc-val" style={{ color: '#f85149' }}>{proteinTarget}g</div>
                <div className="ft-sc-label">Protein</div>
              </div>
              <div className="ft-sc" style={{ borderColor: '#d2992244' }}>
                <div className="ft-sc-icon" style={{ color: '#d29922' }}>🌾</div>
                <div className="ft-sc-val" style={{ color: '#d29922' }}>{carbTarget}g</div>
                <div className="ft-sc-label">Karb</div>
              </div>
              <div className="ft-sc" style={{ borderColor: '#3fb95044' }}>
                <div className="ft-sc-icon" style={{ color: '#3fb950' }}>🥑</div>
                <div className="ft-sc-val" style={{ color: '#3fb950' }}>{fatTarget}g</div>
                <div className="ft-sc-label">Yağ</div>
              </div>
            </>}
          </div>
        )}

        {/* ═══════════════════════════════════════
            ANA GRID — 2 kolon
        ═══════════════════════════════════════ */}
        <div className="ft-grid">

          {/* ── SOL KOLON ── */}
          <div className="ft-col">

            {/* KİLO TAKİBİ */}
            <div className="ft-card">
              <div className="ft-card-header">
                <div className="ft-card-label">Kilo Takibi</div>
                {lastWeight && profile.targetWeight &&
                  <span className="ft-badge">{(lastWeight - profile.targetWeight).toFixed(1)} kg kaldı</span>}
              </div>
              <div className="ft-weight-input-row">
                <input className="ft-input" type="number" step="0.1" placeholder="75.5 kg" value={weightInput}
                  onChange={e => setWeightInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addWeight(); }} />
                <button className="ft-btn-accent" onClick={addWeight}>Kaydet</button>
              </div>
              {weightLog.length > 0 && (
                <div className="ft-sparkline-wrap">
                  <MiniSparkline entries={weightLog.slice(-14)} color="#5c7cfa" height={52} />
                </div>
              )}
              {weightLog.length === 0 && <div className="ft-empty">Henüz kilo kaydı yok</div>}
              <div className="ft-weight-list">
                {[...weightLog].reverse().slice(0, 5).map((e, i) => (
                  <div key={i} className="ft-list-row">
                    <span className="ft-list-date">{e.date}</span>
                    <span className="ft-list-val">{e.value} kg</span>
                    {profile.targetWeight && <span className="ft-list-sub">{(e.value - profile.targetWeight).toFixed(1)} kg</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* ANTRENMAN */}
            <div className="ft-card">
              <div className="ft-card-header">
                <div className="ft-card-label">Antrenman</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="date" className="ft-input ft-date-sm" value={workoutDate} onChange={e => setWorkoutDate(e.target.value)} />
                  <button className="ft-btn-sm" onClick={() => setShowWkForm(s => !s)}>+ Ekle</button>
                </div>
              </div>

              {showWkForm && (
                <div className="ft-inline-form">
                  <select className="ft-input" value={wkForm.type} onChange={e => setWkForm(f => ({ ...f, type: e.target.value }))}>
                    {WORKOUT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <input className="ft-input" type="number" placeholder="Süre (dk)" value={wkForm.duration} onChange={e => setWkForm(f => ({ ...f, duration: e.target.value }))} />
                  <input className="ft-input" type="number" placeholder="kcal" value={wkForm.kcal} onChange={e => setWkForm(f => ({ ...f, kcal: e.target.value }))} />
                  <input className="ft-input" placeholder="Not (isteğe bağlı)" value={wkForm.notes} onChange={e => setWkForm(f => ({ ...f, notes: e.target.value }))} style={{ gridColumn: '1/-1' }} />
                  <button className="ft-btn-accent" onClick={addWorkout} style={{ gridColumn: '1/-1' }}>Ekle</button>
                </div>
              )}

              {!todayWorkouts.length && <div className="ft-empty">Bu gün için antrenman eklenmedi</div>}
              {todayWorkouts.map(w => (
                <div key={w.id} className="ft-list-row">
                  <span className="ft-list-accent" style={{ color: '#e6edf3', fontWeight: 600 }}>{w.type}</span>
                  <span className="ft-list-val" style={{ color: '#58a6ff' }}>{w.duration} dk</span>
                  {w.kcal ? <span className="ft-list-sub" style={{ color: '#3fb950' }}>-{w.kcal} kcal</span> : null}
                  {w.notes ? <span className="ft-list-sub" style={{ color: '#8b949e', flex: 1 }}>{w.notes}</span> : null}
                  <button className="ft-del-btn" onClick={() => setWorkouts(prev => ({ ...prev, [workoutDate]: prev[workoutDate].filter(x => x.id !== w.id) }))}>×</button>
                </div>
              ))}
              {todayWorkouts.length > 0 && (
                <div className="ft-summary-row">
                  <span>{todayWorkouts.reduce((s, w) => s + (Number(w.duration) || 0), 0)} dk</span>
                  <span style={{ color: '#3fb950' }}>{burnedKcal} kcal yakıldı</span>
                </div>
              )}
            </div>

          </div>

          {/* ── SAĞ KOLON ── */}
          <div className="ft-col">

            {/* BESLENME */}
            <div className="ft-card">
              <div className="ft-card-header">
                <div className="ft-card-label">Beslenme</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="date" className="ft-input ft-date-sm" value={mealDate} onChange={e => setMealDate(e.target.value)} />
                  <button className="ft-btn-sm" onClick={() => setShowMealForm(s => !s)}>+ Öğün</button>
                </div>
              </div>

              {/* Makro ring'leri */}
              <div className="ft-macro-rings">
                <div className="ft-ring-item">
                  <RingChart value={todayKcal} target={goalKcal} color="#5c7cfa" size={60} />
                  <div className="ft-ring-val">{todayKcal}</div>
                  <div className="ft-ring-label">kcal</div>
                </div>
                <div className="ft-ring-item">
                  <RingChart value={todayProtein} target={proteinTarget} color="#f85149" size={60} />
                  <div className="ft-ring-val">{todayProtein}g</div>
                  <div className="ft-ring-label">Protein</div>
                </div>
                <div className="ft-ring-item">
                  <RingChart value={todayCarb} target={carbTarget} color="#d29922" size={60} />
                  <div className="ft-ring-val">{todayCarb}g</div>
                  <div className="ft-ring-label">Karb</div>
                </div>
                <div className="ft-ring-item">
                  <RingChart value={todayFat} target={fatTarget} color="#3fb950" size={60} />
                  <div className="ft-ring-val">{todayFat}g</div>
                  <div className="ft-ring-label">Yağ</div>
                </div>
              </div>

              {/* Progress barlar */}
              <div className="ft-bars">
                {[
                  { label: 'Kalori',  val: todayKcal,   target: goalKcal,     color: '#5c7cfa' },
                  { label: 'Protein', val: todayProtein, target: proteinTarget, color: '#f85149' },
                  { label: 'Karb',    val: todayCarb,    target: carbTarget,    color: '#d29922' },
                  { label: 'Yağ',     val: todayFat,     target: fatTarget,     color: '#3fb950' },
                ].map(b => (
                  <div key={b.label} className="ft-bar-row">
                    <span className="ft-bar-label">{b.label}</span>
                    <ProgressBar value={b.val} target={b.target} color={b.color} />
                    <span className="ft-bar-nums">{b.val}{b.target ? `/${b.target}` : ''}</span>
                  </div>
                ))}
                {burnedKcal > 0 && (
                  <div className="ft-net-row">
                    Net: <strong>{todayKcal - burnedKcal} kcal</strong>
                    <span className="ft-hint"> (yenildi {todayKcal} · yakıldı {burnedKcal})</span>
                  </div>
                )}
              </div>

              {showMealForm && (
                <div className="ft-inline-form">
                  <select className="ft-input" value={mealForm.type} onChange={e => setMealForm(f => ({ ...f, type: e.target.value }))}>
                    {MEAL_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <input className="ft-input" placeholder="Yemek adı" value={mealForm.name} onChange={e => setMealForm(f => ({ ...f, name: e.target.value }))} style={{ gridColumn: 'span 2' }} />
                  <input className="ft-input" type="number" placeholder="kcal" value={mealForm.kcal} onChange={e => setMealForm(f => ({ ...f, kcal: e.target.value }))} />
                  <input className="ft-input" type="number" placeholder="Protein (g)" value={mealForm.protein} onChange={e => setMealForm(f => ({ ...f, protein: e.target.value }))} />
                  <input className="ft-input" type="number" placeholder="Karb (g)" value={mealForm.carb} onChange={e => setMealForm(f => ({ ...f, carb: e.target.value }))} />
                  <input className="ft-input" type="number" placeholder="Yağ (g)" value={mealForm.fat} onChange={e => setMealForm(f => ({ ...f, fat: e.target.value }))} />
                  <button className="ft-btn-accent" onClick={addMeal} style={{ gridColumn: '1/-1' }}>Ekle</button>
                </div>
              )}

              {!todayMeals.length && <div className="ft-empty">Bu gün için öğün eklenmedi</div>}
              {MEAL_TYPES.map(type => {
                const items = todayMeals.filter(m => m.type === type);
                if (!items.length) return null;
                return (
                  <div key={type} className="ft-meal-group">
                    <div className="ft-group-label">
                      {type}
                      <span className="ft-group-kcal">{items.reduce((s, m) => s + (Number(m.kcal) || 0), 0)} kcal</span>
                    </div>
                    {items.map(m => (
                      <div key={m.id} className="ft-list-row">
                        <span className="ft-list-name">{m.name}</span>
                        <span className="ft-list-val" style={{ color: '#5c7cfa' }}>{m.kcal} kcal</span>
                        {m.protein ? <span className="ft-tag ft-tag-p">P:{m.protein}g</span> : null}
                        {m.carb    ? <span className="ft-tag ft-tag-c">K:{m.carb}g</span>    : null}
                        {m.fat     ? <span className="ft-tag ft-tag-f">Y:{m.fat}g</span>     : null}
                        <button className="ft-del-btn" onClick={() => setMeals(prev => ({ ...prev, [mealDate]: prev[mealDate].filter(x => x.id !== m.id) }))}>×</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

          </div>
        </div>

        {/* ═══════════════════════════════════════
            ALT BANT — Vücut Ölçüleri (tam genişlik)
        ═══════════════════════════════════════ */}
        <div className="ft-card">
          <div className="ft-card-header">
            <div className="ft-card-label">Vücut Ölçüleri</div>
            <button className="ft-btn-sm" onClick={() => setShowMeasForm(s => !s)}>+ Bugün</button>
          </div>

          {showMeasForm && (
            <div className="ft-inline-form">
              {[['waist','Bel'],['hip','Kalça'],['chest','Göğüs'],['arm','Kol'],['thigh','Bacak']].map(([k, l]) => (
                <input key={k} className="ft-input" type="number" placeholder={`${l} cm`}
                  value={measForm[k]} onChange={e => setMeasForm(f => ({ ...f, [k]: e.target.value }))} />
              ))}
              <button className="ft-btn-accent" onClick={addMeasurement} style={{ gridColumn: '1/-1' }}>Kaydet</button>
            </div>
          )}

          <div className="ft-meas-table">
            {measurements.length === 0 && <div className="ft-empty">Henüz ölçüm eklenmedi</div>}
            {[...measurements].reverse().slice(0, 6).map((m, i) => (
              <div key={i} className="ft-list-row">
                <span className="ft-list-date">{m.date}</span>
                {m.waist ? <span className="ft-meas-chip">Bel {m.waist}cm</span>   : null}
                {m.hip   ? <span className="ft-meas-chip">Kalça {m.hip}cm</span>  : null}
                {m.chest ? <span className="ft-meas-chip">Göğüs {m.chest}cm</span> : null}
                {m.arm   ? <span className="ft-meas-chip">Kol {m.arm}cm</span>    : null}
                {m.thigh ? <span className="ft-meas-chip">Bacak {m.thigh}cm</span> : null}
              </div>
            ))}
          </div>

          {measurements.filter(m => m.waist).length >= 2 && (
            <div className="ft-sparkline-wrap" style={{ marginTop: 8 }}>
              <div className="ft-chart-label">Bel Ölçüsü Trendi</div>
              <MiniSparkline
                entries={measurements.filter(m => m.waist).map(m => ({ date: m.date, value: Number(m.waist) }))}
                color="#d29922" height={44} />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
