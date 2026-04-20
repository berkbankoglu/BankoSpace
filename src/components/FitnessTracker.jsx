import { useState, useEffect, useRef } from 'react';
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
  if (bmi < 18.5) return { text: 'Zayıf',       color: '#58a6ff' };
  if (bmi < 25)   return { text: 'Normal',       color: '#3fb950' };
  if (bmi < 30)   return { text: 'Fazla Kilolu', color: '#d29922' };
  return               { text: 'Obez',           color: '#f85149' };
}

function load(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
  pushKeyToSupabase(key, val);
}

const FOOD_DB = [
  { name: 'Tavuk göğsü (ızgara)', kcal: 165, p: 31,  c: 0,   f: 3.6 },
  { name: 'Tavuk but (ızgara)',    kcal: 209, p: 26,  c: 0,   f: 11  },
  { name: 'Dana kıyma (%20 yağ)', kcal: 254, p: 17,  c: 0,   f: 20  },
  { name: 'Dana bonfile',          kcal: 271, p: 26,  c: 0,   f: 18  },
  { name: 'Dana antrikot',         kcal: 291, p: 24,  c: 0,   f: 21  },
  { name: 'Kuzu pirzola',          kcal: 294, p: 25,  c: 0,   f: 21  },
  { name: 'Hindi göğsü',           kcal: 135, p: 30,  c: 0,   f: 1   },
  { name: 'Sucuk',                 kcal: 450, p: 16,  c: 1,   f: 42  },
  { name: 'Salam',                 kcal: 300, p: 14,  c: 2,   f: 26  },
  { name: 'Pastırma',              kcal: 230, p: 32,  c: 1,   f: 11  },
  { name: 'Somon (ızgara)',        kcal: 208, p: 20,  c: 0,   f: 13  },
  { name: 'Ton balığı (konserve)', kcal: 116, p: 26,  c: 0,   f: 1   },
  { name: 'Hamsi',                 kcal: 131, p: 20,  c: 0,   f: 5   },
  { name: 'Çipura',                kcal: 128, p: 21,  c: 0,   f: 4   },
  { name: 'Levrek',                kcal: 124, p: 24,  c: 0,   f: 3   },
  { name: 'Karides',               kcal: 99,  p: 24,  c: 0,   f: 0.3 },
  { name: 'Yumurta (1 adet ~60g)',kcal: 78,  p: 6,   c: 0.6, f: 5   },
  { name: 'Yumurta akı',           kcal: 17,  p: 4,   c: 0.2, f: 0   },
  { name: 'Süt (%3.2)',            kcal: 61,  p: 3.2, c: 4.8, f: 3.2 },
  { name: 'Yoğurt (%3)',           kcal: 59,  p: 3.5, c: 4.7, f: 3   },
  { name: 'Yoğurt (light)',        kcal: 35,  p: 5,   c: 3.8, f: 0.2 },
  { name: 'Kefir',                 kcal: 52,  p: 3.4, c: 4.7, f: 1.5 },
  { name: 'Beyaz peynir (%40)',    kcal: 264, p: 17,  c: 2,   f: 21  },
  { name: 'Kaşar peyniri',         kcal: 386, p: 25,  c: 1,   f: 31  },
  { name: 'Lor peyniri',           kcal: 98,  p: 11,  c: 3,   f: 4   },
  { name: 'Labne',                 kcal: 170, p: 10,  c: 4,   f: 13  },
  { name: 'Tereyağı',              kcal: 717, p: 0.9, c: 0.1, f: 81  },
  { name: 'Beyaz ekmek (dilim)',   kcal: 79,  p: 2.7, c: 15,  f: 1   },
  { name: 'Tam buğday ekmek',      kcal: 69,  p: 3.6, c: 11,  f: 1.1 },
  { name: 'Pirinç (pişmiş)',       kcal: 130, p: 2.7, c: 28,  f: 0.3 },
  { name: 'Makarna (pişmiş)',      kcal: 131, p: 5,   c: 25,  f: 1.1 },
  { name: 'Yulaf ezmesi (kuru)',   kcal: 389, p: 17,  c: 66,  f: 7   },
  { name: 'Bulgur (pişmiş)',       kcal: 83,  p: 3,   c: 19,  f: 0.2 },
  { name: 'Mercimek (pişmiş)',     kcal: 116, p: 9,   c: 20,  f: 0.4 },
  { name: 'Nohut (pişmiş)',        kcal: 164, p: 9,   c: 27,  f: 2.6 },
  { name: 'Fasulye (pişmiş)',      kcal: 127, p: 8.7, c: 23,  f: 0.5 },
  { name: 'Patates (haşlanmış)',   kcal: 87,  p: 1.9, c: 20,  f: 0.1 },
  { name: 'Patates kızartması',    kcal: 312, p: 3.4, c: 41,  f: 15  },
  { name: 'Mısır (haşlanmış)',     kcal: 96,  p: 3.4, c: 21,  f: 1.5 },
  { name: 'Domates',               kcal: 18,  p: 0.9, c: 3.9, f: 0.2 },
  { name: 'Salatalık',             kcal: 15,  p: 0.7, c: 3.6, f: 0.1 },
  { name: 'Biber (yeşil)',         kcal: 20,  p: 0.9, c: 4.6, f: 0.2 },
  { name: 'Ispanak',               kcal: 23,  p: 2.9, c: 3.6, f: 0.4 },
  { name: 'Brokoli',               kcal: 34,  p: 2.8, c: 7,   f: 0.4 },
  { name: 'Havuç',                 kcal: 41,  p: 0.9, c: 10,  f: 0.2 },
  { name: 'Kabak',                 kcal: 17,  p: 1.2, c: 3.1, f: 0.3 },
  { name: 'Patlıcan',              kcal: 25,  p: 1,   c: 5.9, f: 0.2 },
  { name: 'Soğan',                 kcal: 40,  p: 1.1, c: 9.3, f: 0.1 },
  { name: 'Marul',                 kcal: 15,  p: 1.4, c: 2.9, f: 0.2 },
  { name: 'Bezelye',               kcal: 81,  p: 5.4, c: 14,  f: 0.4 },
  { name: 'Avokado',               kcal: 160, p: 2,   c: 9,   f: 15  },
  { name: 'Elma',                  kcal: 52,  p: 0.3, c: 14,  f: 0.2 },
  { name: 'Muz',                   kcal: 89,  p: 1.1, c: 23,  f: 0.3 },
  { name: 'Portakal',              kcal: 47,  p: 0.9, c: 12,  f: 0.1 },
  { name: 'Üzüm',                  kcal: 69,  p: 0.7, c: 18,  f: 0.2 },
  { name: 'Çilek',                 kcal: 32,  p: 0.7, c: 7.7, f: 0.3 },
  { name: 'Kivi',                  kcal: 61,  p: 1.1, c: 15,  f: 0.5 },
  { name: 'Karpuz',                kcal: 30,  p: 0.6, c: 7.6, f: 0.2 },
  { name: 'Kavun',                 kcal: 34,  p: 0.8, c: 8.2, f: 0.2 },
  { name: 'Badem',                 kcal: 579, p: 21,  c: 22,  f: 50  },
  { name: 'Ceviz',                 kcal: 654, p: 15,  c: 14,  f: 65  },
  { name: 'Antep fıstığı',         kcal: 562, p: 20,  c: 28,  f: 45  },
  { name: 'Fıstık ezmesi',         kcal: 588, p: 25,  c: 20,  f: 50  },
  { name: 'Zeytinyağı',            kcal: 884, p: 0,   c: 0,   f: 100 },
  { name: 'Zeytin (siyah)',        kcal: 115, p: 0.8, c: 6,   f: 11  },
  { name: 'Ayran',                 kcal: 38,  p: 2,   c: 2.8, f: 2   },
  { name: 'Portakal suyu (taze)', kcal: 45,  p: 0.7, c: 10,  f: 0.2 },
  { name: 'Sütlü kahve (latte)',  kcal: 54,  p: 2.4, c: 6,   f: 2.5 },
  { name: 'Kola',                  kcal: 42,  p: 0,   c: 10.6,f: 0   },
  { name: 'Pizza (dilim)',         kcal: 266, p: 11,  c: 33,  f: 10  },
  { name: 'Hamburger',             kcal: 295, p: 17,  c: 24,  f: 14  },
  { name: 'Döner (tavuk dürüm)',  kcal: 218, p: 14,  c: 22,  f: 8   },
  { name: 'Kebap (şiş)',           kcal: 195, p: 20,  c: 0,   f: 12  },
  { name: 'Lahmacun',              kcal: 230, p: 11,  c: 30,  f: 8   },
  { name: 'Gözleme (peynirli)',    kcal: 280, p: 10,  c: 35,  f: 12  },
  { name: 'Börek (su böreği)',     kcal: 258, p: 8,   c: 30,  f: 12  },
  { name: 'Simit',                 kcal: 285, p: 9,   c: 55,  f: 4   },
  { name: 'Poğaça (sade)',         kcal: 310, p: 7,   c: 42,  f: 13  },
  { name: 'Çikolata (sütlü)',      kcal: 535, p: 8,   c: 59,  f: 30  },
  { name: 'Çikolata (bitter)',     kcal: 546, p: 5,   c: 60,  f: 31  },
  { name: 'Dondurma (vanilyalı)', kcal: 207, p: 3.5, c: 24,  f: 11  },
  { name: 'Baklava (dilim)',       kcal: 337, p: 4,   c: 40,  f: 18  },
  { name: 'Cips (patates)',        kcal: 536, p: 7,   c: 53,  f: 35  },
  { name: 'Kuru incir',            kcal: 249, p: 3.3, c: 64,  f: 0.9 },
  { name: 'Hurma',                 kcal: 277, p: 1.8, c: 75,  f: 0.2 },
  { name: 'Protein tozu (servis)', kcal: 120, p: 25,  c: 3,   f: 1.5 },
  { name: 'Yulaf ezmesi (pişmiş)',kcal: 71,  p: 2.5, c: 12,  f: 1.4 },
  { name: 'Tatlı patates',         kcal: 86,  p: 1.6, c: 20,  f: 0.1 },
  { name: 'Sarımsak',              kcal: 149, p: 6.4, c: 33,  f: 0.5 },
];

const MEAL_TYPES = ['Kahvaltı', 'Öğle', 'Akşam', 'Ara Öğün'];

function MiniSparkline({ entries, color = '#5c7cfa', height = 50 }) {
  if (!entries || entries.length < 2) return null;
  const vals = entries.map(e => e.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const W = 200, H = height;
  const px = i => (i / (entries.length - 1)) * W;
  const py = v => H - 4 - ((v - min) / (max - min || 1)) * (H - 8);
  const pts = entries.map((e, i) => `${px(i)},${py(e.value)}`).join(' ');
  const areapts = `0,${H} ${pts} ${W},${H}`;
  const gid = `sg${color.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areapts} fill={`url(#${gid})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

const EMPTY_PROFILE = { gender: 'male', age: '', weight: '', height: '', waist: '', neck: '', hip: '', activity: 'light', goal: 'maintain', targetWeight: '' };

export default function FitnessTracker() {
  const [profile, setProfile]               = useState(() => load('ft_profile', EMPTY_PROFILE));
  const [editingProfile, setEditingProfile] = useState(false);
  const [draft, setDraft]                   = useState(profile);

  // Kilo takibi
  const [weightLog, setWeightLog]   = useState(() => load('ft_weight_log', []));
  const [weightInput, setWeightInput] = useState('');
  const [addDate, setAddDate]         = useState(today());
  const [editingIdx, setEditingIdx]   = useState(null);
  const [editDate, setEditDate]       = useState('');
  const [editVal, setEditVal]         = useState('');

  // Öğün log
  const [meals, setMeals]     = useState(() => load('ft_meals', {}));
  const [mealDate, setMealDate] = useState(today());

  // Tabak (orta panel) — geçici, kaydedilmez
  const [plate, setPlate] = useState([]);  // { food, qty, id }
  const [plateOver, setPlateOver] = useState(false);

  // Sağ panel — arama
  const [searchQ, setSearchQ]   = useState('');
  const [dragQty, setDragQty]   = useState({});  // foodName -> qty string

  // Tabak öğün tipi seçimi
  const [plateMealType, setPlateMealType] = useState('Kahvaltı');

  useEffect(() => { save('ft_weight_log', weightLog); }, [weightLog]);
  useEffect(() => { save('ft_meals', meals); }, [meals]);

  const bmr      = calcBMR(profile);
  const tdee     = calcTDEE(profile);
  const bmi      = calcBMI(profile.weight, profile.height);
  const bmiData  = bmiInfo(bmi);
  const bodyFat  = calcBodyFat(profile);
  const goalKcal = profile.goal === 'cut' ? tdee - 500 : profile.goal === 'bulk' ? tdee + 300 : tdee;
  const proteinTarget = profile.weight ? Math.round(profile.weight * 2) : null;
  const fatTarget     = goalKcal ? Math.round(goalKcal * 0.25 / 9) : null;
  const carbTarget    = (goalKcal && proteinTarget && fatTarget)
    ? Math.round((goalKcal - proteinTarget * 4 - fatTarget * 9) / 4) : null;
  const lastWeight = weightLog.length > 0 ? weightLog[weightLog.length - 1].value : (profile.weight || null);
  const hasProfile = profile.weight && profile.height && profile.age;

  const todayMeals   = meals[mealDate] || [];
  const todayKcal    = todayMeals.reduce((s, m) => s + m.kcal, 0);
  const todayProtein = todayMeals.reduce((s, m) => s + m.p, 0);
  const todayCarb    = todayMeals.reduce((s, m) => s + m.c, 0);
  const todayFat     = todayMeals.reduce((s, m) => s + m.f, 0);

  // Tabak toplamları
  const plateKcal    = plate.reduce((s, i) => s + i.kcal, 0);
  const plateProtein = plate.reduce((s, i) => s + i.p, 0);
  const plateCarb    = plate.reduce((s, i) => s + i.c, 0);
  const plateFat     = plate.reduce((s, i) => s + i.f, 0);

  // Arama sonuçları
  const searchResults = searchQ.trim()
    ? FOOD_DB.filter(f => f.name.toLowerCase().includes(searchQ.toLowerCase()))
    : FOOD_DB;

  // Drag & Drop
  function onDragStart(e, food) {
    const qty = parseFloat(dragQty[food.name]) || 100;
    e.dataTransfer.setData('application/json', JSON.stringify({ food, qty }));
  }

  function onDrop(e) {
    e.preventDefault();
    setPlateOver(false);
    try {
      const { food, qty } = JSON.parse(e.dataTransfer.getData('application/json'));
      addToPlate(food, qty);
    } catch {}
  }

  function addToPlate(food, qty) {
    const ratio = qty / 100;
    setPlate(prev => [...prev, {
      id: Date.now() + Math.random(),
      name: food.name,
      qty,
      kcal: Math.round(food.kcal * ratio),
      p:    Math.round(food.p * ratio * 10) / 10,
      c:    Math.round(food.c * ratio * 10) / 10,
      f:    Math.round(food.f * ratio * 10) / 10,
    }]);
  }

  function removeFromPlate(id) {
    setPlate(prev => prev.filter(i => i.id !== id));
  }

  function addPlateToLog() {
    if (plate.length === 0) return;
    const entries = plate.map(i => ({ ...i, type: plateMealType, id: Date.now() + Math.random() }));
    setMeals(prev => ({ ...prev, [mealDate]: [...(prev[mealDate] || []), ...entries] }));
    setPlate([]);
  }

  function removeMealEntry(id) {
    setMeals(prev => ({ ...prev, [mealDate]: prev[mealDate].filter(m => m.id !== id) }));
  }

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
    setProfile(p => { const np = { ...p, weight: v }; save('ft_profile', np); return np; });
    setDraft(p => ({ ...p, weight: v }));
  }

  function startEdit(i, entry) { setEditingIdx(i); setEditDate(entry.date); setEditVal(String(entry.value)); }

  function saveEdit(originalDate) {
    const v = parseFloat(editVal);
    if (!v || !editDate) { setEditingIdx(null); return; }
    setWeightLog(prev => [...prev.filter(e => e.date !== originalDate), { date: editDate, value: v }].sort((a, b) => a.date.localeCompare(b.date)));
    setEditingIdx(null);
  }

  function deleteEntry(date) { setWeightLog(prev => prev.filter(e => e.date !== date)); setEditingIdx(null); }

  return (
    <div className="ft-root">
      <div className="ft-scroll">

        {/* ══ HERO ══ */}
        <div className="ft-hero">
          <div className="ft-hero-stats">
            <div className="ft-hstat">
              <div className="ft-hstat-val" style={{ color: '#58a6ff' }}>{lastWeight ?? '—'}</div>
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
              <div className="ft-hstat-val" style={{ color: '#5c7cfa' }}>{hasProfile ? goalKcal : '—'}</div>
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
          <div className="ft-hero-actions">
            <button className="ft-btn-ghost" onClick={() => { setDraft(profile); setEditingProfile(true); }}>
              {hasProfile ? 'Profili Düzenle' : '+ Profil Oluştur'}
            </button>
          </div>
        </div>

        {/* ══ PROFİL POPUP ══ */}
        {editingProfile && (
          <div className="ft-popup-overlay" onClick={() => setEditingProfile(false)}>
            <div className="ft-popup" onClick={e => e.stopPropagation()}>
              <div className="ft-popup-header">
                <span className="ft-popup-title">Profil Bilgileri</span>
                <button className="ft-popup-close" onClick={() => setEditingProfile(false)}>✕</button>
              </div>
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
              <div className="ft-popup-footer">
                <button className="ft-btn-ghost" onClick={() => setEditingProfile(false)}>İptal</button>
                <button className="ft-btn-accent" onClick={saveProfile}>Kaydet</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ 3 PANEL ══ */}
        <div className="ft-three-col">

          {/* ── SOL: Kilo Takibi + Öğün Log ── */}
          <div className="ft-panel ft-panel-left">

            {/* Kilo Takibi */}
            <div className="ft-card">
              <div className="ft-card-header">
                <div className="ft-card-label">Kilo Takibi</div>
                {lastWeight && profile.targetWeight &&
                  <span className="ft-badge">{(lastWeight - profile.targetWeight).toFixed(1)} kg kaldı</span>}
              </div>
              <div className="ft-weight-input-row">
                <input type="date" className="ft-input ft-date-sm" value={addDate} onChange={e => setAddDate(e.target.value)} />
                <input className="ft-input" type="number" step="0.1" placeholder="75.5"
                  value={weightInput} onChange={e => setWeightInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addWeight(); }} />
                <button className="ft-btn-accent" onClick={addWeight}>Kaydet</button>
              </div>
              {weightLog.length >= 2 && (
                <div className="ft-sparkline-wrap">
                  <MiniSparkline entries={weightLog.slice(-14)} color="#5c7cfa" height={48} />
                </div>
              )}
              {weightLog.length === 0 && <div className="ft-empty">Henüz kayıt yok</div>}
              <div className="ft-weight-list">
                {[...weightLog].reverse().slice(0, 6).map((e, i) => (
                  editingIdx === i ? (
                    <div key={i} className="ft-list-row ft-list-editing">
                      <input type="date" className="ft-input ft-edit-input" value={editDate} onChange={ev => setEditDate(ev.target.value)} />
                      <input type="number" step="0.1" className="ft-input ft-edit-input" value={editVal}
                        onChange={ev => setEditVal(ev.target.value)}
                        onKeyDown={ev => { if (ev.key === 'Enter') saveEdit(e.date); if (ev.key === 'Escape') setEditingIdx(null); }} />
                      <button className="ft-btn-accent ft-edit-save" onClick={() => saveEdit(e.date)}>✓</button>
                      <button className="ft-del-btn" onClick={() => deleteEntry(e.date)}>×</button>
                      <button className="ft-btn-ghost ft-edit-cancel" onClick={() => setEditingIdx(null)}>İptal</button>
                    </div>
                  ) : (
                    <div key={i} className="ft-list-row ft-list-clickable" onClick={() => startEdit(i, e)}>
                      <span className="ft-list-date">{e.date}</span>
                      <span className="ft-list-val">{e.value} kg</span>
                      {profile.targetWeight && <span className="ft-list-sub">{(e.value - profile.targetWeight).toFixed(1)} kg</span>}
                      <span className="ft-list-edit-hint">✎</span>
                    </div>
                  )
                ))}
              </div>
            </div>

            {/* Öğün Log */}
            <div className="ft-card ft-meal-log-card">
              <div className="ft-card-header">
                <div className="ft-card-label">Öğün Geçmişi</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="date" className="ft-input ft-date-sm" value={mealDate} onChange={e => setMealDate(e.target.value)} />
                </div>
              </div>
              {/* Günlük özet */}
              <div className="ft-log-summary">
                <span className="ft-log-kcal" style={{ color: todayKcal > goalKcal && goalKcal ? '#f85149' : '#5c7cfa' }}>
                  {todayKcal} kcal
                </span>
                <span className="ft-log-macros">
                  P <b style={{ color: '#f85149' }}>{todayProtein}g</b>
                  · K <b style={{ color: '#d29922' }}>{todayCarb}g</b>
                  · Y <b style={{ color: '#3fb950' }}>{todayFat}g</b>
                </span>
              </div>
              {/* Öğün grupları */}
              {MEAL_TYPES.map(type => {
                const items = todayMeals.filter(m => m.type === type);
                if (!items.length) return null;
                return (
                  <div key={type} className="ft-meal-group">
                    <div className="ft-group-label">
                      {type}
                      <span style={{ color: '#5c7cfa' }}>{items.reduce((s, m) => s + m.kcal, 0)} kcal</span>
                    </div>
                    {items.map(m => (
                      <div key={m.id} className="ft-list-row">
                        <span className="ft-list-name">{m.name}</span>
                        <span className="ft-list-sub">{m.qty}g</span>
                        <span className="ft-list-val" style={{ color: '#5c7cfa', marginLeft: 'auto' }}>{m.kcal}</span>
                        <button className="ft-del-btn" onClick={() => removeMealEntry(m.id)}>×</button>
                      </div>
                    ))}
                  </div>
                );
              })}
              {todayMeals.length === 0 && <div className="ft-empty">Henüz öğün eklenmedi</div>}
            </div>
          </div>

          {/* ── ORTA: Tabak ── */}
          <div className="ft-panel ft-panel-plate">
            <div className="ft-card ft-plate-card">
              <div className="ft-card-header">
                <div className="ft-card-label">Tabak</div>
                <select className="ft-input" style={{ width: 110 }} value={plateMealType} onChange={e => setPlateMealType(e.target.value)}>
                  {MEAL_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              {/* Drop zone */}
              <div
                className={`ft-plate-drop${plateOver ? ' ft-plate-over' : ''}`}
                onDragOver={e => { e.preventDefault(); setPlateOver(true); }}
                onDragLeave={() => setPlateOver(false)}
                onDrop={onDrop}
              >
                {plate.length === 0 ? (
                  <div className="ft-plate-hint">
                    <div className="ft-plate-icon">🍽️</div>
                    <div>Sağdan yiyecek sürükle</div>
                  </div>
                ) : (
                  <div className="ft-plate-items">
                    {plate.map(item => (
                      <div key={item.id} className="ft-plate-item">
                        <span className="ft-plate-name">{item.name}</span>
                        <span className="ft-plate-qty">{item.qty}g</span>
                        <span className="ft-plate-kcal">{item.kcal} kcal</span>
                        <button className="ft-del-btn" onClick={() => removeFromPlate(item.id)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tabak toplamları */}
              {plate.length > 0 && (
                <div className="ft-plate-totals">
                  <div className="ft-plate-total-kcal">{plateKcal} kcal</div>
                  <div className="ft-plate-macros">
                    <span style={{ color: '#f85149' }}>P {plateProtein}g</span>
                    <span style={{ color: '#d29922' }}>K {plateCarb}g</span>
                    <span style={{ color: '#3fb950' }}>Y {plateFat}g</span>
                  </div>
                  <button className="ft-btn-accent ft-plate-add-btn" onClick={addPlateToLog}>
                    Öğüne Ekle →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── SAĞ: Yiyecek Arama ── */}
          <div className="ft-panel ft-panel-search">
            <div className="ft-card ft-search-card">
              <div className="ft-card-header">
                <div className="ft-card-label">Yiyecek Ara</div>
              </div>
              <input
                className="ft-input"
                placeholder="Yiyecek adı..."
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                autoFocus
              />
              <div className="ft-food-list">
                {searchResults.map((food, i) => {
                  const qty = parseFloat(dragQty[food.name]) || 100;
                  const ratio = qty / 100;
                  return (
                    <div
                      key={i}
                      className="ft-food-item"
                      draggable
                      onDragStart={e => onDragStart(e, food)}
                    >
                      <div className="ft-food-info">
                        <span className="ft-food-name">{food.name}</span>
                        <span className="ft-food-kcal">{Math.round(food.kcal * ratio)} kcal</span>
                      </div>
                      <div className="ft-food-macros">
                        <span style={{ color: '#f85149' }}>P {Math.round(food.p * ratio * 10) / 10}g</span>
                        <span style={{ color: '#d29922' }}>K {Math.round(food.c * ratio * 10) / 10}g</span>
                        <span style={{ color: '#3fb950' }}>Y {Math.round(food.f * ratio * 10) / 10}g</span>
                      </div>
                      <div className="ft-food-actions">
                        <input
                          className="ft-input ft-qty-input"
                          type="number"
                          value={dragQty[food.name] ?? '100'}
                          onClick={e => e.stopPropagation()}
                          onChange={e => setDragQty(prev => ({ ...prev, [food.name]: e.target.value }))}
                          title="gram"
                        />
                        <span className="ft-food-unit">g</span>
                        <button
                          className="ft-btn-sm"
                          onClick={() => addToPlate(food, qty)}
                          title="Tabağa ekle"
                        >+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
