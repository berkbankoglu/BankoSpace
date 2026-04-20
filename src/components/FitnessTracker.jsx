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
  if (bmi < 30)   return { text: 'Fazla Kilolu',  color: '#d2a800' };
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

function ProgressBar({ value, target, color }) {
  const pct = target ? Math.min(100, Math.round(value / target * 100)) : 0;
  const over = target && value > target;
  return (
    <div className="ft-bar-bg">
      <div className="ft-bar-fill" style={{ width: `${pct}%`, background: over ? '#f85149' : color }} />
    </div>
  );
}

function MiniChart({ entries, target, unit = 'kg', color = '#5c7cfa' }) {
  if (!entries || entries.length < 2) return <div className="ft-chart-empty">Grafik için en az 2 kayıt gerekli</div>;
  const vals = entries.map(e => e.value);
  const min = Math.min(...vals) - 1;
  const max = Math.max(...vals) + 1;
  const W = 400, H = 90;
  const px = i => (i / (entries.length - 1)) * (W - 20) + 10;
  const py = v => H - 8 - ((v - min) / (max - min || 1)) * (H - 16);
  const pts = entries.map((e, i) => `${px(i)},${py(e.value)}`).join(' ');
  const targetY = target ? py(target) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ft-chart-svg" preserveAspectRatio="none">
      {targetY && <line x1="0" y1={targetY} x2={W} y2={targetY} stroke="#3fb95055" strokeWidth="1" strokeDasharray="4 3" />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {entries.map((e, i) => (
        <circle key={i} cx={px(i)} cy={py(e.value)} r="3" fill={color}>
          <title>{e.date}: {e.value} {unit}</title>
        </circle>
      ))}
    </svg>
  );
}

const EMPTY_PROFILE = { gender: 'male', age: '', weight: '', height: '', waist: '', neck: '', hip: '', activity: 'light', goal: 'maintain', targetWeight: '' };

export default function FitnessTracker() {
  const [profile, setProfile]           = useState(() => load('ft_profile', EMPTY_PROFILE));
  const [editingProfile, setEditingProfile] = useState(false);
  const [draft, setDraft]               = useState(profile);

  const [weightLog, setWeightLog]       = useState(() => load('ft_weight_log', []));
  const [weightInput, setWeightInput]   = useState('');

  const [meals, setMeals]               = useState(() => load('ft_meals', {}));
  const [mealDate, setMealDate]         = useState(today());
  const [mealForm, setMealForm]         = useState({ type: 'Kahvaltı', name: '', kcal: '', protein: '', carb: '', fat: '' });
  const [showMealForm, setShowMealForm] = useState(false);

  const [workouts, setWorkouts]         = useState(() => load('ft_workouts', {}));
  const [workoutDate, setWorkoutDate]   = useState(today());
  const [wkForm, setWkForm]             = useState({ type: 'Ağırlık', duration: '', kcal: '', notes: '' });
  const [showWkForm, setShowWkForm]     = useState(false);

  const [measurements, setMeasurements] = useState(() => load('ft_measurements', []));
  const [measForm, setMeasForm]         = useState({ waist: '', hip: '', chest: '', arm: '', thigh: '' });
  const [showMeasForm, setShowMeasForm] = useState(false);

  useEffect(() => { save('ft_weight_log', weightLog); }, [weightLog]);
  useEffect(() => { save('ft_meals', meals); }, [meals]);
  useEffect(() => { save('ft_workouts', workouts); }, [workouts]);
  useEffect(() => { save('ft_measurements', measurements); }, [measurements]);

  // Computed
  const bmr       = calcBMR(profile);
  const tdee      = calcTDEE(profile);
  const bmi       = calcBMI(profile.weight, profile.height);
  const bmiData   = bmiInfo(bmi);
  const bodyFat   = calcBodyFat(profile);
  const goalKcal  = profile.goal === 'cut' ? tdee - 500 : profile.goal === 'bulk' ? tdee + 300 : tdee;
  const proteinTarget = profile.weight ? Math.round(profile.weight * 2) : null;
  const fatTarget     = goalKcal ? Math.round(goalKcal * 0.25 / 9) : null;
  const carbTarget    = (goalKcal && proteinTarget && fatTarget) ? Math.round((goalKcal - proteinTarget * 4 - fatTarget * 9) / 4) : null;

  const todayMeals   = meals[mealDate] || [];
  const todayKcal    = todayMeals.reduce((s, m) => s + (Number(m.kcal)     || 0), 0);
  const todayProtein = todayMeals.reduce((s, m) => s + (Number(m.protein)  || 0), 0);
  const todayCarb    = todayMeals.reduce((s, m) => s + (Number(m.carb)     || 0), 0);
  const todayFat     = todayMeals.reduce((s, m) => s + (Number(m.fat)      || 0), 0);
  const todayWorkouts = workouts[workoutDate] || [];
  const burnedKcal   = todayWorkouts.reduce((s, w) => s + (Number(w.kcal)  || 0), 0);
  const lastWeight   = weightLog.length > 0 ? weightLog[weightLog.length - 1].value : profile.weight;

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

  const hasProfile = profile.weight && profile.height && profile.age;

  return (
    <div className="ft-container">
      <div className="ft-scroll">

        {/* ── PROFİL ── */}
        <div className="ft-card">
          <div className="ft-card-header">
            <div className="ft-card-title">Profil</div>
            {!editingProfile
              ? <button className="ft-btn-ghost" onClick={() => { setDraft(profile); setEditingProfile(true); }}>Düzenle</button>
              : <div style={{ display: 'flex', gap: 8 }}>
                  <button className="ft-btn-primary" onClick={saveProfile}>Kaydet</button>
                  <button className="ft-btn-ghost" onClick={() => setEditingProfile(false)}>İptal</button>
                </div>
            }
          </div>

          {editingProfile ? (
            <div className="ft-profile-grid">
              {[
                { key: 'gender',       label: 'Cinsiyet',      type: 'select', opts: [['male','Erkek'],['female','Kadın']] },
                { key: 'age',          label: 'Yaş',           type: 'number', ph: '25' },
                { key: 'height',       label: 'Boy (cm)',      type: 'number', ph: '175' },
                { key: 'weight',       label: 'Kilo (kg)',     type: 'number', ph: '75' },
                { key: 'targetWeight', label: 'Hedef (kg)',    type: 'number', ph: '70' },
                { key: 'waist',        label: 'Bel (cm)',      type: 'number', ph: '85' },
                { key: 'neck',         label: 'Boyun (cm)',    type: 'number', ph: '38' },
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
                Aktivite Seviyesi
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
          ) : (
            <div className="ft-profile-view">
              {hasProfile ? (
                <div className="ft-profile-pills">
                  <span className="ft-pill">{profile.gender === 'male' ? 'Erkek' : 'Kadın'}</span>
                  <span className="ft-pill">{profile.age} yaş</span>
                  <span className="ft-pill">{profile.height} cm</span>
                  <span className="ft-pill">{profile.weight} kg</span>
                  {profile.targetWeight && <span className="ft-pill ft-pill-goal">Hedef: {profile.targetWeight} kg</span>}
                  <span className="ft-pill">{ACTIVITY.find(a => a.key === profile.activity)?.label}</span>
                  <span className="ft-pill">{profile.goal === 'cut' ? 'Yağ Yakma' : profile.goal === 'bulk' ? 'Kas Kazanımı' : 'Kilo Koruma'}</span>
                </div>
              ) : (
                <div className="ft-empty">Profil bilgilerini girmek için Düzenle'ye tıklayın</div>
              )}
            </div>
          )}
        </div>

        {/* ── İSTATİSTİKLER ── */}
        {hasProfile && (
          <div className="ft-stats-row">
            <div className="ft-stat-card"><div className="ft-stat-label">BMR</div><div className="ft-stat-value">{bmr}</div><div className="ft-stat-sub">kcal/gün</div></div>
            <div className="ft-stat-card"><div className="ft-stat-label">TDEE</div><div className="ft-stat-value">{tdee}</div><div className="ft-stat-sub">kcal/gün</div></div>
            <div className="ft-stat-card"><div className="ft-stat-label">Hedef Kalori</div><div className="ft-stat-value" style={{ color: '#5c7cfa' }}>{goalKcal}</div><div className="ft-stat-sub">{profile.goal === 'cut' ? '-500' : profile.goal === 'bulk' ? '+300' : 'Koruma'}</div></div>
            <div className="ft-stat-card"><div className="ft-stat-label">BMI</div><div className="ft-stat-value" style={{ color: bmiData?.color }}>{bmi}</div><div className="ft-stat-sub" style={{ color: bmiData?.color }}>{bmiData?.text}</div></div>
            {bodyFat != null && <div className="ft-stat-card"><div className="ft-stat-label">Yağ %</div><div className="ft-stat-value" style={{ color: '#d2a800' }}>%{bodyFat}</div><div className="ft-stat-sub">US Navy</div></div>}
          </div>
        )}

        {/* ── MAKRO HEDEFLERİ ── */}
        {proteinTarget && (
          <div className="ft-card">
            <div className="ft-card-title">Günlük Makro Hedefleri</div>
            <div className="ft-macros-row">
              <div className="ft-macro-item" style={{ '--mc': '#5c7cfa' }}><span className="ft-macro-val">{goalKcal}</span><span className="ft-macro-label">kcal</span></div>
              <div className="ft-macro-item" style={{ '--mc': '#f85149' }}><span className="ft-macro-val">{proteinTarget}g</span><span className="ft-macro-label">Protein</span></div>
              <div className="ft-macro-item" style={{ '--mc': '#d2a800' }}><span className="ft-macro-val">{carbTarget}g</span><span className="ft-macro-label">Karb</span></div>
              <div className="ft-macro-item" style={{ '--mc': '#3fb950' }}><span className="ft-macro-val">{fatTarget}g</span><span className="ft-macro-label">Yağ</span></div>
            </div>
          </div>
        )}

        {/* ── KİLO TAKİBİ ── */}
        <div className="ft-card">
          <div className="ft-card-title">Kilo Takibi</div>
          <div className="ft-row-inline" style={{ marginBottom: 12 }}>
            <input className="ft-input" type="number" step="0.1" placeholder="75.5 kg" value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addWeight(); }}
              style={{ width: 120 }} />
            <button className="ft-btn-primary" onClick={addWeight}>Kaydet</button>
            {lastWeight && <span className="ft-hint">Son: {lastWeight} kg{profile.targetWeight ? ` · ${(lastWeight - profile.targetWeight).toFixed(1)} kg kaldı` : ''}</span>}
          </div>
          <MiniChart entries={weightLog} target={Number(profile.targetWeight) || null} unit="kg" color="#5c7cfa" />
          {weightLog.length > 0 && (
            <div className="ft-weight-log">
              {[...weightLog].reverse().slice(0, 7).map((e, i) => (
                <div key={i} className="ft-weight-row">
                  <span>{e.date}</span>
                  <span>{e.value} kg</span>
                  {profile.targetWeight && <span className="ft-hint">{(e.value - profile.targetWeight).toFixed(1)} kg</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── BESLENME ── */}
        <div className="ft-card">
          <div className="ft-card-header">
            <div className="ft-card-title">Beslenme</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" className="ft-input ft-date-input" value={mealDate} onChange={e => setMealDate(e.target.value)} />
              <button className="ft-btn-primary" onClick={() => setShowMealForm(s => !s)}>+ Öğün</button>
            </div>
          </div>

          {/* Progress bars */}
          <div className="ft-nut-bars">
            <div className="ft-nut-bar-row">
              <span>Kalori</span>
              <ProgressBar value={todayKcal} target={goalKcal} color="#5c7cfa" />
              <span className="ft-nut-val">{todayKcal}{goalKcal ? `/${goalKcal}` : ''}</span>
            </div>
            <div className="ft-nut-bar-row">
              <span>Protein</span>
              <ProgressBar value={todayProtein} target={proteinTarget} color="#f85149" />
              <span className="ft-nut-val">{todayProtein}g{proteinTarget ? `/${proteinTarget}g` : ''}</span>
            </div>
            <div className="ft-nut-bar-row">
              <span>Karb</span>
              <ProgressBar value={todayCarb} target={carbTarget} color="#d2a800" />
              <span className="ft-nut-val">{todayCarb}g{carbTarget ? `/${carbTarget}g` : ''}</span>
            </div>
            <div className="ft-nut-bar-row">
              <span>Yağ</span>
              <ProgressBar value={todayFat} target={fatTarget} color="#3fb950" />
              <span className="ft-nut-val">{todayFat}g{fatTarget ? `/${fatTarget}g` : ''}</span>
            </div>
            {burnedKcal > 0 && <div className="ft-net-kcal">Net: {todayKcal - burnedKcal} kcal <span className="ft-hint">(yenilen {todayKcal} - yakılan {burnedKcal})</span></div>}
          </div>

          {showMealForm && (
            <div className="ft-form">
              <select className="ft-input" style={{ width: 110 }} value={mealForm.type} onChange={e => setMealForm(f => ({ ...f, type: e.target.value }))}>
                {MEAL_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <input className="ft-input" placeholder="Yemek adı" value={mealForm.name} onChange={e => setMealForm(f => ({ ...f, name: e.target.value }))} style={{ flex: 2 }} />
              <input className="ft-input" type="number" placeholder="kcal" value={mealForm.kcal} onChange={e => setMealForm(f => ({ ...f, kcal: e.target.value }))} style={{ width: 72 }} />
              <input className="ft-input" type="number" placeholder="P(g)" value={mealForm.protein} onChange={e => setMealForm(f => ({ ...f, protein: e.target.value }))} style={{ width: 64 }} />
              <input className="ft-input" type="number" placeholder="K(g)" value={mealForm.carb} onChange={e => setMealForm(f => ({ ...f, carb: e.target.value }))} style={{ width: 64 }} />
              <input className="ft-input" type="number" placeholder="Y(g)" value={mealForm.fat} onChange={e => setMealForm(f => ({ ...f, fat: e.target.value }))} style={{ width: 64 }} />
              <button className="ft-btn-primary" onClick={addMeal}>Ekle</button>
            </div>
          )}

          {MEAL_TYPES.map(type => {
            const items = todayMeals.filter(m => m.type === type);
            if (!items.length) return null;
            return (
              <div key={type} className="ft-meal-group">
                <div className="ft-meal-group-label">{type} — {items.reduce((s, m) => s + (Number(m.kcal) || 0), 0)} kcal</div>
                {items.map(m => (
                  <div key={m.id} className="ft-meal-row">
                    <span className="ft-meal-name">{m.name}</span>
                    <span className="ft-meal-kcal">{m.kcal} kcal</span>
                    {m.protein ? <span className="ft-macro-tag ft-p">P:{m.protein}g</span> : null}
                    {m.carb    ? <span className="ft-macro-tag ft-c">K:{m.carb}g</span>    : null}
                    {m.fat     ? <span className="ft-macro-tag ft-f">Y:{m.fat}g</span>     : null}
                    <button className="ft-del-btn" onClick={() => setMeals(prev => ({ ...prev, [mealDate]: prev[mealDate].filter(x => x.id !== m.id) }))}>×</button>
                  </div>
                ))}
              </div>
            );
          })}
          {!todayMeals.length && <div className="ft-empty">Henüz öğün eklenmedi</div>}
        </div>

        {/* ── ANTRENMAN ── */}
        <div className="ft-card">
          <div className="ft-card-header">
            <div className="ft-card-title">Antrenman</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" className="ft-input ft-date-input" value={workoutDate} onChange={e => setWorkoutDate(e.target.value)} />
              <button className="ft-btn-primary" onClick={() => setShowWkForm(s => !s)}>+ Ekle</button>
            </div>
          </div>

          {showWkForm && (
            <div className="ft-form">
              <select className="ft-input" style={{ width: 110 }} value={wkForm.type} onChange={e => setWkForm(f => ({ ...f, type: e.target.value }))}>
                {WORKOUT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <input className="ft-input" type="number" placeholder="Süre (dk)" value={wkForm.duration} onChange={e => setWkForm(f => ({ ...f, duration: e.target.value }))} style={{ width: 96 }} />
              <input className="ft-input" type="number" placeholder="Yakılan kcal" value={wkForm.kcal} onChange={e => setWkForm(f => ({ ...f, kcal: e.target.value }))} style={{ width: 100 }} />
              <input className="ft-input" placeholder="Not" value={wkForm.notes} onChange={e => setWkForm(f => ({ ...f, notes: e.target.value }))} style={{ flex: 1 }} />
              <button className="ft-btn-primary" onClick={addWorkout}>Ekle</button>
            </div>
          )}

          {!todayWorkouts.length && <div className="ft-empty">Henüz antrenman eklenmedi</div>}
          {todayWorkouts.map(w => (
            <div key={w.id} className="ft-workout-row">
              <span className="ft-wk-type">{w.type}</span>
              <span className="ft-wk-dur">{w.duration} dk</span>
              {w.kcal  ? <span className="ft-wk-kcal">-{w.kcal} kcal</span> : null}
              {w.notes ? <span className="ft-wk-notes">{w.notes}</span>    : null}
              <button className="ft-del-btn" onClick={() => setWorkouts(prev => ({ ...prev, [workoutDate]: prev[workoutDate].filter(x => x.id !== w.id) }))}>×</button>
            </div>
          ))}
          {todayWorkouts.length > 0 && (
            <div className="ft-wk-summary">
              Toplam: {todayWorkouts.reduce((s, w) => s + (Number(w.duration) || 0), 0)} dk · {burnedKcal} kcal yakıldı
            </div>
          )}
        </div>

        {/* ── VÜCUT ÖLÇÜLERİ ── */}
        <div className="ft-card">
          <div className="ft-card-header">
            <div className="ft-card-title">Vücut Ölçüleri</div>
            <button className="ft-btn-primary" onClick={() => setShowMeasForm(s => !s)}>+ Bugün</button>
          </div>

          {showMeasForm && (
            <div className="ft-form">
              {[['waist','Bel'],['hip','Kalça'],['chest','Göğüs'],['arm','Kol'],['thigh','Bacak']].map(([k,l]) => (
                <input key={k} className="ft-input" type="number" placeholder={`${l} cm`} style={{ width: 88 }}
                  value={measForm[k]} onChange={e => setMeasForm(f => ({ ...f, [k]: e.target.value }))} />
              ))}
              <button className="ft-btn-primary" onClick={addMeasurement}>Kaydet</button>
            </div>
          )}

          {measurements.length === 0 && <div className="ft-empty">Henüz ölçüm eklenmedi</div>}
          {[...measurements].reverse().slice(0, 8).map((m, i) => (
            <div key={i} className="ft-meas-row">
              <span className="ft-meas-date">{m.date}</span>
              {m.waist ? <span className="ft-meas-val">Bel: {m.waist}</span>   : null}
              {m.hip   ? <span className="ft-meas-val">Kalça: {m.hip}</span>   : null}
              {m.chest ? <span className="ft-meas-val">Göğüs: {m.chest}</span> : null}
              {m.arm   ? <span className="ft-meas-val">Kol: {m.arm}</span>     : null}
              {m.thigh ? <span className="ft-meas-val">Bacak: {m.thigh}</span> : null}
            </div>
          ))}

          {measurements.filter(m => m.waist).length >= 2 && (
            <div style={{ marginTop: 12 }}>
              <div className="ft-chart-label">Bel Ölçüsü</div>
              <MiniChart entries={measurements.filter(m => m.waist).map(m => ({ date: m.date, value: Number(m.waist) }))} unit="cm" color="#d2a800" />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
