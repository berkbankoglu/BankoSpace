import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { proxyFetch } from '../platform';
import './FitnessTracker.css';
import { pushKeyToSupabase } from '../supabase';
import { playClickSound, playAddSound, playDeleteSound } from '../utils/sounds';

function today() { return new Date().toISOString().slice(0, 10); }

// Deterministic per-name color (same name -> always the same color, e.g. every
// "Yumurta" entry matches) so the Menu list and day-log meal sections are
// visually scannable without needing a manual color picker per item.
const FT_ITEM_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
  '#a855f7', '#ec4899', '#14b8a6', '#f97316',
  '#667eea', '#06b6d4', '#84cc16', '#eab308',
];
function hashColorFor(name) {
  const str = String(name || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return FT_ITEM_COLORS[Math.abs(hash) % FT_ITEM_COLORS.length];
}

// Tauri invoke() rejections are often plain strings (Rust's Err(String)), not
// Error objects — `e.message` is then undefined and errors silently show as
// "Unknown". Handle every shape so the real cause is always visible.
function errMsg(e) {
  if (typeof e === 'string') return e;
  if (e?.message) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

function DatePicker({ value, onChange, minDate }) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => {
    const d = value ? new Date(value) : (minDate ? new Date(minDate) : new Date());
    return d.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const d = value ? new Date(value) : (minDate ? new Date(minDate) : new Date());
    return d.getMonth();
  });
  const ref = useRef(null);

  // Takvim açılınca: değer varsa ona git, yoksa minDate'e git
  function handleOpen() {
    const target = value ? new Date(value) : (minDate ? new Date(minDate) : new Date());
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());
    setOpen(o => !o);
  }

  useEffect(() => {
    function onClickOut(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClickOut);
    return () => document.removeEventListener('mousedown', onClickOut);
  }, []);

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  function buildGrid(y, m) {
    const first = new Date(y, m, 1);
    const startDow = (first.getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }

  function toISO(y, m, d) {
    return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); }
    else setViewMonth(m => m-1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); }
    else setViewMonth(m => m+1);
  }

  const cells = buildGrid(viewYear, viewMonth);
  const displayVal = value ? new Date(value).toLocaleDateString('en-US', { day:'numeric', month:'long', year:'numeric' }) : '—';

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div
        className="ft-input"
        style={{ cursor:'pointer', userSelect:'none', padding:'7px 10px', fontSize:13 }}
        onClick={handleOpen}
      >
        {displayVal}
      </div>
      {open && (
        <div style={{
          position:'absolute', zIndex:9999, top:'calc(100% + 4px)', left:0,
          background:'#161b22', border:'1px solid #30363d', borderRadius:8,
          padding:'12px', width:240, boxShadow:'0 8px 24px rgba(0,0,0,0.5)'
        }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <button onClick={prevMonth} style={{ background:'none', border:'none', color:'#8b949e', cursor:'pointer', fontSize:16 }}>‹</button>
            <span style={{ color:'var(--text-primary)', fontWeight:600, fontSize:13 }}>{MONTHS[viewMonth]} {viewYear}</span>
            <button onClick={nextMonth} style={{ background:'none', border:'none', color:'#8b949e', cursor:'pointer', fontSize:16 }}>›</button>
          </div>
          {/* Day headers */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:4 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign:'center', fontSize:11, color:'var(--text-muted)', fontWeight:600 }}>{d}</div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const iso = toISO(viewYear, viewMonth, day);
              const isSelected = iso === value;
              const isDisabled = minDate && iso < minDate;
              const isToday = iso === today();
              return (
                <div
                  key={i}
                  onClick={() => { if (!isDisabled) { onChange(iso); setOpen(false); } }}
                  style={{
                    textAlign:'center', padding:'5px 2px', borderRadius:4, fontSize:12,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    color: isDisabled ? '#f85149' : isSelected ? '#fff' : isToday ? 'var(--accent)' : 'var(--text-primary)',
                    fontWeight: isSelected || isToday ? 700 : 400,
                    opacity: isDisabled ? 0.7 : 1,
                    textDecoration: isDisabled ? 'line-through' : 'none',
                  }}
                >{day}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function calcBMR(p) {
  if (!p.weight || !p.height || !p.age) return 0;
  if (p.gender === 'male') return Math.round(10 * p.weight + 6.25 * p.height - 5 * p.age + 5);
  return Math.round(10 * p.weight + 6.25 * p.height - 5 * p.age - 161);
}

const ACTIVITY = [
  { key: 'sedentary', label: 'Sedentary (desk job)',         mult: 1.2   },
  { key: 'light',     label: 'Lightly active (1-3 days/wk)', mult: 1.375 },
  { key: 'moderate',  label: 'Moderately active (3-5 days/wk)', mult: 1.55  },
  { key: 'active',    label: 'Active (6-7 days/wk)',        mult: 1.725 },
  { key: 'very',      label: 'Very active (2x training)',   mult: 1.9   },
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

function calcLeanMass(weight, bodyFatPct) {
  if (!weight || bodyFatPct == null) return null;
  return Math.round(weight * (1 - bodyFatPct / 100) * 10) / 10;
}

// FFMI (Fat-Free Mass Index) — height-normalized versiyon
function calcFFMI(leanMassKg, heightCm) {
  if (!leanMassKg || !heightCm) return null;
  const hM = heightCm / 100;
  const v = leanMassKg / (hM * hM) + 6.1 * (1.8 - hM);
  return Math.round(v * 10) / 10;
}

function calcShoulderWaistRatio(shoulder, waist) {
  if (!shoulder || !waist) return null;
  return Math.round((shoulder / waist) * 100) / 100;
}

// Son ~30 günlük (yetersizse elimizdeki son 10 kayıt) kilo verisinden
// gerçek haftalık değişim hızı — günlük dalgalanmayı (su tutması vb.)
// filtrelemek için tek tük son iki nokta yerine bir aralık kullanır.
function calcWeeklyRate(entries) {
  if (!entries || entries.length < 2) return null;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const lastDate = new Date(sorted[sorted.length - 1].date);
  const cutoff = new Date(lastDate);
  cutoff.setDate(cutoff.getDate() - 30);
  let usable = sorted.filter(e => new Date(e.date) >= cutoff);
  if (usable.length < 2) usable = sorted.slice(-Math.min(sorted.length, 10));
  if (usable.length < 2) return null;
  const first = usable[0], last = usable[usable.length - 1];
  const days = (new Date(last.date) - new Date(first.date)) / 86400000;
  if (days < 1) return null;
  return Math.round(((last.value - first.value) / days) * 7 * 100) / 100;
}

// Mevcut haftalık hızla hedefe kaç gün kaldığı — hız hedefle aynı yönde
// ilerlemiyorsa (ör. kilo alıyor ama hedef kilo vermekse) anlamsız bir
// sayı göstermek yerine null döner.
function calcEtaDays(currentWeight, targetWeight, weeklyRate) {
  if (currentWeight == null || !targetWeight || weeklyRate == null) return null;
  const diff = targetWeight - currentWeight;
  if (Math.abs(diff) < 0.1) return 0;
  if (Math.abs(weeklyRate) < 0.05 || Math.sign(weeklyRate) !== Math.sign(diff)) return null;
  return Math.round((diff / weeklyRate) * 7);
}

// 'adet' bazlı bir yemeği (kcal/p/c/f per piece + perUnit gram) gram-bazlı
// eşdeğerine (per 100g) çevirir — böylece "gram gir" moduna geçildiğinde mevcut
// ratio=qty/100 hesaplaması hiç değişmeden doğru sonucu verir (köfte gibi
// adet yemeklerde gramaja göre kalori istendiğinde kullanılıyor).
function toGramBasis(food) {
  if (food.unit !== 'adet' || !food.perUnit) return food;
  const f = 100 / food.perUnit;
  return { ...food, unit: 'g', kcal: food.kcal * f, p: food.p * f, c: food.c * f, f: food.f * f };
}

function bmiInfo(bmi) {
  if (!bmi) return null;
  if (bmi < 18.5) return { text: 'Underweight', color: 'var(--accent)' };
  if (bmi < 25)   return { text: 'Normal',      color: '#3fb950' };
  if (bmi < 30)   return { text: 'Overweight',  color: '#e8e8e8' };
  return               { text: 'Obese',          color: '#f85149' };
}

function load(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
  pushKeyToSupabase(key, val);
}

// unit: 'g' → gram bazlı (kcal/makro per 100g)
// unit: 'adet', perUnit: N → 1 adet = N gram eşdeğeri (kcal/makro per adet)
const FOOD_DB = [
  { name: 'Chicken breast (grilled)', kcal: 165, p: 31,  c: 0,   f: 3.6, unit: 'g' },
  { name: 'Chicken thigh (grilled)', kcal: 209, p: 26,  c: 0,   f: 11,  unit: 'g' },
  { name: 'Chicken thigh (bone-in)', kcal: 215, p: 25,  c: 0,   f: 12,  unit: 'g' },
  { name: 'Chicken wing', kcal: 222, p: 22,  c: 0,   f: 14,  unit: 'g' },
  { name: 'Chicken breast (boiled)', kcal: 150, p: 28,  c: 0,   f: 3.2, unit: 'g' },
  { name: 'Chicken thigh (pan-fried)', kcal: 245, p: 24,  c: 0,   f: 16,  unit: 'g' },
  { name: 'Chicken liver', kcal: 167, p: 24,  c: 1,   f: 7,   unit: 'g' },
  { name: 'Turkey breast', kcal: 135, p: 30,  c: 0,   f: 1,   unit: 'g' },
  { name: 'Turkey thigh (grilled)', kcal: 218, p: 27,  c: 0,   f: 12,  unit: 'g' },
  { name: 'Ground beef (20% fat)', kcal: 254, p: 17,  c: 0,   f: 20,  unit: 'g' },
  { name: 'Ground beef (10% fat)', kcal: 196, p: 21,  c: 0,   f: 12,  unit: 'g' },
  { name: 'Beef tenderloin', kcal: 271, p: 26,  c: 0,   f: 18,  unit: 'g' },
  { name: 'Beef ribeye', kcal: 291, p: 24,  c: 0,   f: 21,  unit: 'g' },
  { name: 'Beef (pan-fried)', kcal: 280, p: 25,  c: 0,   f: 19,  unit: 'g' },
  { name: 'Beef leg (boiled)', kcal: 185, p: 27,  c: 0,   f: 8,   unit: 'g' },
  { name: 'Beef liver', kcal: 135, p: 21,  c: 4,   f: 4,   unit: 'g' },
  { name: 'Beef brisket (pan-fried)', kcal: 320, p: 22,  c: 0,   f: 25,  unit: 'g' },
  { name: 'Lamb chop', kcal: 294, p: 25,  c: 0,   f: 21,  unit: 'g' },
  { name: 'Lamb leg (grilled)', kcal: 258, p: 26,  c: 0,   f: 17,  unit: 'g' },
  { name: 'Lamb (pan-fried)', kcal: 310, p: 24,  c: 0,   f: 23,  unit: 'g' },
  { name: 'Lamb liver', kcal: 140, p: 20,  c: 3,   f: 5,   unit: 'g' },
  { name: 'Ground lamb', kcal: 268, p: 18,  c: 0,   f: 21,  unit: 'g' },
  { name: 'Sucuk (Turkish sausage)', kcal: 450, p: 16,  c: 1,   f: 42,  unit: 'g' },
  { name: 'Salami', kcal: 300, p: 14,  c: 2,   f: 26,  unit: 'g' },
  { name: 'Pastırma (cured beef)', kcal: 230, p: 32,  c: 1,   f: 11,  unit: 'g' },
  { name: 'Salmon (grilled)', kcal: 208, p: 20,  c: 0,   f: 13,  unit: 'g' },
  { name: 'Tuna (canned)', kcal: 116, p: 26,  c: 0,   f: 1,   unit: 'g' },
  { name: 'Anchovy', kcal: 131, p: 20,  c: 0,   f: 5,   unit: 'g' },
  { name: 'Sea bream', kcal: 128, p: 21,  c: 0,   f: 4,   unit: 'g' },
  { name: 'Sea bass', kcal: 124, p: 24,  c: 0,   f: 3,   unit: 'g' },
  { name: 'Shrimp', kcal: 99,  p: 24,  c: 0,   f: 0.3, unit: 'g' },
  { name: 'Egg', kcal: 78,  p: 6,   c: 0.6, f: 5,   unit: 'adet', perUnit: 60 },
  { name: 'Egg white', kcal: 17,  p: 4,   c: 0.2, f: 0,   unit: 'adet', perUnit: 30 },
  { name: 'Milk (3.2% fat)', kcal: 61,  p: 3.2, c: 4.8, f: 3.2, unit: 'g' },
  { name: 'Yogurt (3% fat)', kcal: 59,  p: 3.5, c: 4.7, f: 3,   unit: 'g' },
  { name: 'Yogurt (light)', kcal: 35,  p: 5,   c: 3.8, f: 0.2, unit: 'g' },
  { name: 'Kefir', kcal: 52,  p: 3.4, c: 4.7, f: 1.5, unit: 'g' },
  { name: 'Feta cheese (40% fat)', kcal: 264, p: 17,  c: 2,   f: 21,  unit: 'g' },
  { name: 'Kashar cheese', kcal: 386, p: 25,  c: 1,   f: 31,  unit: 'g' },
  { name: 'Lor cheese (ricotta-style)', kcal: 98,  p: 11,  c: 3,   f: 4,   unit: 'g' },
  { name: 'Labneh', kcal: 170, p: 10,  c: 4,   f: 13,  unit: 'g' },
  { name: 'Butter', kcal: 717, p: 0.9, c: 0.1, f: 81,  unit: 'g' },
  { name: 'White bread (slice)', kcal: 79,  p: 2.7, c: 15,  f: 1,   unit: 'adet', perUnit: 30 },
  { name: 'Whole wheat bread', kcal: 69,  p: 3.6, c: 11,  f: 1.1, unit: 'adet', perUnit: 30 },
  { name: 'Rice (cooked)', kcal: 130, p: 2.7, c: 28,  f: 0.3, unit: 'g' },
  { name: 'Pasta (cooked)', kcal: 131, p: 5,   c: 25,  f: 1.1, unit: 'g' },
  { name: 'Oats (dry)', kcal: 389, p: 17,  c: 66,  f: 7,   unit: 'g' },
  { name: 'Bulgur (cooked)', kcal: 83,  p: 3,   c: 19,  f: 0.2, unit: 'g' },
  { name: 'Lentils (cooked)', kcal: 116, p: 9,   c: 20,  f: 0.4, unit: 'g' },
  { name: 'Chickpeas (cooked)', kcal: 164, p: 9,   c: 27,  f: 2.6, unit: 'g' },
  { name: 'Beans (cooked)', kcal: 127, p: 8.7, c: 23,  f: 0.5, unit: 'g' },
  { name: 'Potato (boiled)', kcal: 87,  p: 1.9, c: 20,  f: 0.1, unit: 'g' },
  { name: 'French fries', kcal: 312, p: 3.4, c: 41,  f: 15,  unit: 'g' },
  { name: 'Corn (boiled)', kcal: 96,  p: 3.4, c: 21,  f: 1.5, unit: 'g' },
  { name: 'Tomato', kcal: 18,  p: 0.9, c: 3.9, f: 0.2, unit: 'adet', perUnit: 120 },
  { name: 'Cucumber', kcal: 15,  p: 0.7, c: 3.6, f: 0.1, unit: 'adet', perUnit: 200 },
  { name: 'Pepper (green)', kcal: 20,  p: 0.9, c: 4.6, f: 0.2, unit: 'adet', perUnit: 100 },
  { name: 'Spinach', kcal: 23,  p: 2.9, c: 3.6, f: 0.4, unit: 'g' },
  { name: 'Broccoli', kcal: 34,  p: 2.8, c: 7,   f: 0.4, unit: 'g' },
  { name: 'Carrot', kcal: 41,  p: 0.9, c: 10,  f: 0.2, unit: 'adet', perUnit: 80 },
  { name: 'Zucchini', kcal: 17,  p: 1.2, c: 3.1, f: 0.3, unit: 'adet', perUnit: 200 },
  { name: 'Eggplant', kcal: 25,  p: 1,   c: 5.9, f: 0.2, unit: 'adet', perUnit: 300 },
  { name: 'Onion', kcal: 40,  p: 1.1, c: 9.3, f: 0.1, unit: 'adet', perUnit: 100 },
  { name: 'Lettuce', kcal: 15,  p: 1.4, c: 2.9, f: 0.2, unit: 'g' },
  { name: 'Peas', kcal: 81,  p: 5.4, c: 14,  f: 0.4, unit: 'g' },
  { name: 'Avocado', kcal: 160, p: 2,   c: 9,   f: 15,  unit: 'adet', perUnit: 150 },
  { name: 'Apple', kcal: 52,  p: 0.3, c: 14,  f: 0.2, unit: 'adet', perUnit: 180 },
  { name: 'Banana', kcal: 89,  p: 1.1, c: 23,  f: 0.3, unit: 'adet', perUnit: 120 },
  { name: 'Orange', kcal: 47,  p: 0.9, c: 12,  f: 0.1, unit: 'adet', perUnit: 180 },
  { name: 'Grapes', kcal: 69,  p: 0.7, c: 18,  f: 0.2, unit: 'g' },
  { name: 'Strawberry', kcal: 32,  p: 0.7, c: 7.7, f: 0.3, unit: 'adet', perUnit: 12 },
  { name: 'Kiwi', kcal: 61,  p: 1.1, c: 15,  f: 0.5, unit: 'adet', perUnit: 75 },
  { name: 'Watermelon', kcal: 30,  p: 0.6, c: 7.6, f: 0.2, unit: 'g' },
  { name: 'Melon', kcal: 34,  p: 0.8, c: 8.2, f: 0.2, unit: 'g' },
  { name: 'Almond', kcal: 579, p: 21,  c: 22,  f: 50,  unit: 'adet', perUnit: 1.2 },
  { name: 'Walnut', kcal: 654, p: 15,  c: 14,  f: 65,  unit: 'adet', perUnit: 5 },
  { name: 'Pistachio', kcal: 562, p: 20,  c: 28,  f: 45,  unit: 'adet', perUnit: 0.7 },
  { name: 'Peanut butter', kcal: 588, p: 25,  c: 20,  f: 50,  unit: 'g' },
  { name: 'Olive oil', kcal: 884, p: 0,   c: 0,   f: 100, unit: 'g' },
  { name: 'Olive (black)', kcal: 115, p: 0.8, c: 6,   f: 11,  unit: 'adet', perUnit: 5 },
  { name: 'Ayran (yogurt drink)', kcal: 38,  p: 2,   c: 2.8, f: 2,   unit: 'g' },
  { name: 'Orange juice (fresh)', kcal: 45,  p: 0.7, c: 10,  f: 0.2, unit: 'g' },
  { name: 'Latte (milk coffee)', kcal: 54,  p: 2.4, c: 6,   f: 2.5, unit: 'g' },
  { name: 'Cola', kcal: 42,  p: 0,   c: 10.6,f: 0,   unit: 'g' },
  { name: 'Pizza (slice)', kcal: 266, p: 11,  c: 33,  f: 10,  unit: 'adet', perUnit: 100 },
  { name: 'Hamburger', kcal: 295, p: 17,  c: 24,  f: 14,  unit: 'adet', perUnit: 150 },
  { name: 'Döner (chicken wrap)', kcal: 218, p: 14,  c: 22,  f: 8,   unit: 'adet', perUnit: 250 },
  { name: 'Kebab (skewered)', kcal: 195, p: 20,  c: 0,   f: 12,  unit: 'g' },
  { name: 'Lahmacun (Turkish flatbread)', kcal: 230, p: 11,  c: 30,  f: 8,   unit: 'adet', perUnit: 120 },
  { name: 'Gözleme (cheese-filled flatbread)', kcal: 280, p: 10,  c: 35,  f: 12,  unit: 'adet', perUnit: 200 },
  { name: 'Börek (water pastry)', kcal: 258, p: 8,   c: 30,  f: 12,  unit: 'g' },
  { name: 'Simit (Turkish bread ring)', kcal: 285, p: 9,   c: 55,  f: 4,   unit: 'adet', perUnit: 120 },
  { name: 'Poğaça (plain pastry)', kcal: 310, p: 7,   c: 42,  f: 13,  unit: 'adet', perUnit: 80 },
  { name: 'Chocolate (milk)', kcal: 535, p: 8,   c: 59,  f: 30,  unit: 'g' },
  { name: 'Chocolate (dark)', kcal: 546, p: 5,   c: 60,  f: 31,  unit: 'g' },
  { name: 'Ice cream (vanilla)', kcal: 207, p: 3.5, c: 24,  f: 11,  unit: 'g' },
  { name: 'Baklava (slice)', kcal: 337, p: 4,   c: 40,  f: 18,  unit: 'adet', perUnit: 80 },
  { name: 'Chips (potato)', kcal: 536, p: 7,   c: 53,  f: 35,  unit: 'g' },
  { name: 'Dried fig', kcal: 249, p: 3.3, c: 64,  f: 0.9, unit: 'adet', perUnit: 20 },
  { name: 'Date (fruit)', kcal: 277, p: 1.8, c: 75,  f: 0.2, unit: 'adet', perUnit: 24 },
  { name: 'Protein powder (serving)', kcal: 120, p: 25,  c: 3,   f: 1.5, unit: 'adet', perUnit: 30 },
  { name: 'Oats (cooked)', kcal: 71,  p: 2.5, c: 12,  f: 1.4, unit: 'g' },
  { name: 'Sweet potato', kcal: 86,  p: 1.6, c: 20,  f: 0.1, unit: 'g' },
  { name: 'Garlic', kcal: 149, p: 6.4, c: 33,  f: 0.5, unit: 'adet', perUnit: 4 },
  { name: 'Carrot (small)', kcal: 18,  p: 0.3, c: 4.1, f: 0.1, unit: 'adet', perUnit: 50 },
  { name: 'Cucumber (small)', kcal: 15,  p: 0.7, c: 3.6, f: 0.1, unit: 'adet', perUnit: 100 },
  { name: 'Cherry tomato', kcal: 3,   p: 0.2, c: 0.5, f: 0,   unit: 'adet', perUnit: 17 },
  { name: 'Ribeye (raw)', kcal: 208, p: 20,  c: 0,   f: 14,  unit: 'g' },
  { name: 'Banana (small)', kcal: 71,  p: 0.9, c: 18,  f: 0.2, unit: 'adet', perUnit: 80 },
  { name: 'Uludağ Lemonade (sugar-free)', kcal: 4, p: 0,  c: 0.7, f: 0,  unit: 'g' },
  { name: 'Eti Form Lemon Biscuit (50g)', kcal: 223, p: 3.9, c: 35, f: 7, unit: 'adet', perUnit: 50 },

  // ── Meyveler ──
  { name: 'Plum', kcal: 20,  p: 0.5, c: 5,   f: 0.1, unit: 'adet', perUnit: 40 },
  { name: 'Pear', kcal: 57,  p: 0.4, c: 15,  f: 0.1, unit: 'adet', perUnit: 100 },
  { name: 'Fig (fresh)', kcal: 74,  p: 0.8, c: 19,  f: 0.3, unit: 'g' },
  { name: 'Peach', kcal: 38,  p: 0.9, c: 9,   f: 0.3, unit: 'adet', perUnit: 80 },
  { name: 'Apricot', kcal: 7,   p: 0.2, c: 1.7, f: 0.1, unit: 'adet', perUnit: 12 },
  { name: 'Cherry', kcal: 63,  p: 1.1, c: 16,  f: 0.2, unit: 'g' },
  { name: 'Sour cherry', kcal: 50,  p: 1.0, c: 12,  f: 0.3, unit: 'g' },
  { name: 'Pomegranate', kcal: 83,  p: 1.7, c: 19,  f: 1.2, unit: 'g' },
  { name: 'Persimmon', kcal: 96,  p: 0.8, c: 25,  f: 0.3, unit: 'adet', perUnit: 168 },
  { name: 'Loquat', kcal: 30,  p: 0.6, c: 7,   f: 0.2, unit: 'adet', perUnit: 70 },
  { name: 'Mulberry', kcal: 43,  p: 1.4, c: 9.8, f: 0.4, unit: 'g' },
  { name: 'Blackberry', kcal: 43,  p: 1.4, c: 10,  f: 0.5, unit: 'g' },
  { name: 'Raspberry', kcal: 52,  p: 1.2, c: 12,  f: 0.7, unit: 'g' },
  { name: 'Blueberry', kcal: 57,  p: 0.7, c: 14,  f: 0.3, unit: 'g' },
  { name: 'Tangerine', kcal: 47,  p: 0.7, c: 12,  f: 0.3, unit: 'adet', perUnit: 88 },
  { name: 'Grapefruit', kcal: 42,  p: 0.8, c: 11,  f: 0.1, unit: 'g' },
  { name: 'Lemon', kcal: 17,  p: 0.6, c: 5,   f: 0.3, unit: 'adet', perUnit: 58 },
  { name: 'Pineapple', kcal: 50,  p: 0.5, c: 13,  f: 0.1, unit: 'g' },
  { name: 'Mango', kcal: 60,  p: 0.8, c: 15,  f: 0.4, unit: 'g' },
  { name: 'Papaya', kcal: 43,  p: 0.6, c: 11,  f: 0.3, unit: 'g' },
  { name: 'Coconut', kcal: 354, p: 3.3, c: 15,  f: 35,  unit: 'g' },
  { name: 'Prune', kcal: 240, p: 2.3, c: 63,  f: 0.4, unit: 'g' },
  { name: 'Dried apricot', kcal: 241, p: 3.6, c: 62,  f: 0.5, unit: 'g' },

  // ── Kahvaltılık ──
  { name: 'Honey', kcal: 304, p: 0.3, c: 82,  f: 0,   unit: 'g' },
  { name: 'Jam', kcal: 280, p: 0.4, c: 70,  f: 0,   unit: 'g' },
  { name: 'Tahini', kcal: 595, p: 17,  c: 21,  f: 53,  unit: 'g' },
  { name: 'Pekmez (grape molasses)', kcal: 265, p: 0.5, c: 66,  f: 0.1, unit: 'g' },
  { name: 'Kaymak (clotted cream)', kcal: 263, p: 4,   c: 5,   f: 26,  unit: 'g' },
  { name: 'Menemen (portion)', kcal: 326, p: 17,  c: 4,   f: 27,  unit: 'adet', perUnit: 250 },
  { name: 'Eggs with sucuk', kcal: 446, p: 26,  c: 2,   f: 36,  unit: 'adet', perUnit: 250 },

  // ── Çorbalar ──
  { name: 'Lentil soup', kcal: 94,  p: 3.5, c: 11,  f: 4,   unit: 'g' },
  { name: 'Tarhana soup', kcal: 151, p: 2,   c: 11,  f: 8,   unit: 'g' },
  { name: 'Tomato soup', kcal: 62,  p: 1.5, c: 9,   f: 2,   unit: 'g' },
  { name: 'Yayla soup (yogurt & rice)', kcal: 68,  p: 3,   c: 7,   f: 3,   unit: 'g' },
  { name: 'Ezogelin soup (red lentil & bulgur)', kcal: 88,  p: 3.5, c: 12,  f: 3,   unit: 'g' },

  // ── Türk Yemekleri ──
  { name: 'İmam bayıldı (stuffed eggplant, portion)', kcal: 280, p: 3, c: 25,  f: 18,  unit: 'adet', perUnit: 200 },
  { name: 'Dolma (stuffed grape leaves)', kcal: 70,  p: 2.5, c: 8,   f: 3,   unit: 'adet', perUnit: 40 },
  { name: 'Sarma (stuffed grape leaves)', kcal: 70,  p: 2.5, c: 8,   f: 3,   unit: 'adet', perUnit: 40 },
  { name: 'Meatball (köfte)', kcal: 150, p: 12,  c: 3,   f: 9,   unit: 'adet', perUnit: 60, defaultUnit: 'g' },
  { name: 'White bean stew', kcal: 127, p: 8.7, c: 23,  f: 0.5, unit: 'g' },
  { name: 'Rice pilaf', kcal: 130, p: 2.7, c: 28,  f: 0.3, unit: 'g' },
  { name: 'Water börek (slice)', kcal: 200, p: 6,   c: 20,  f: 10,  unit: 'adet', perUnit: 80 },
  { name: 'Rolled börek (kol böreği)', kcal: 280, p: 5,   c: 22,  f: 18,  unit: 'adet', perUnit: 70 },
  { name: 'Spinach börek', kcal: 220, p: 6,   c: 24,  f: 11,  unit: 'g' },
  { name: 'Zucchini fritter', kcal: 180, p: 5,   c: 12,  f: 12,  unit: 'adet', perUnit: 80 },
  { name: 'Potato croquette', kcal: 145, p: 4,   c: 20,  f: 5,   unit: 'adet', perUnit: 70 },
  { name: 'Çiğ köfte (wrap)', kcal: 210, p: 4,   c: 38,  f: 4,   unit: 'adet', perUnit: 150 },
  { name: 'Mantı (Turkish dumplings, portion)', kcal: 320, p: 14,  c: 40,  f: 10,  unit: 'g' },
  { name: 'Türlü (mixed vegetable stew)', kcal: 90,  p: 2,   c: 12,  f: 4,   unit: 'g' },

  // ── Fındık & Kuruyemiş ──
  { name: 'Hazelnut', kcal: 628, p: 14,  c: 17,  f: 61,  unit: 'g' },
  { name: 'Cashew', kcal: 553, p: 18,  c: 30,  f: 44,  unit: 'g' },
  { name: 'Pine nut', kcal: 673, p: 14,  c: 13,  f: 68,  unit: 'g' },
  { name: 'Sunflower seeds', kcal: 584, p: 21,  c: 20,  f: 51,  unit: 'g' },
  { name: 'Pumpkin seeds', kcal: 559, p: 30,  c: 11,  f: 49,  unit: 'g' },
  { name: 'Roasted chickpeas (leblebi)', kcal: 364, p: 20,  c: 61,  f: 5,   unit: 'g' },
  { name: 'Popcorn', kcal: 375, p: 12,  c: 74,  f: 4.5, unit: 'g' },

  // ── İçecekler ──
  { name: 'Turkish coffee (plain)', kcal: 2,   p: 0.2, c: 0,   f: 0,   unit: 'adet', perUnit: 60 },
  { name: 'Tea (unsweetened)', kcal: 1,   p: 0,   c: 0.2, f: 0,   unit: 'adet', perUnit: 200 },
  { name: 'Salep', kcal: 102, p: 2.5, c: 20,  f: 1.5, unit: 'g' },
  { name: 'Boza (fermented millet drink)', kcal: 80,  p: 3,   c: 17,  f: 0.5, unit: 'g' },
];

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

const CHART_TABS = [
  { key: 'weight', label: 'Weight' },
  { key: 'calories', label: 'Calories' },
  { key: 'bodyfat', label: 'Body Fat' },
  { key: 'ffmi', label: 'FFMI' },
  { key: 'ratio', label: 'Shoulder / Waist' },
  { key: 'waist', label: 'Waist' },
  { key: 'neck', label: 'Neck' },
];

// Straight segments between points — deliberately NOT spline-smoothed.
// Catmull-Rom smoothing was tried first but overshoots into ugly loops on
// step-like data (body fat, waist, neck jump then hold flat for days), and
// it fights real spikes instead of showing them — a sharp polyline reads
// the data honestly, same as the reference charts this was matched against.
function straightPath(pts) {
  if (pts.length === 0) return '';
  return 'M' + pts.map(p => `${p[0]},${p[1]}`).join(' L');
}

// Shared line-chart renderer used by every metric chart (mini tile AND the
// fullscreen lightbox — same component, just a different size/zoom window).
// Mark specs follow the dataviz skill: 2px line, ≥8px markers with a 2px
// surface ring, ~15% area wash, hairline recessive gridlines, no more than a
// handful of x labels.
function ChartBody({
  sorted, color, unit, targetLine, pointColorFn, formatValue,
  height, dense, zoomable, zoomRange, onZoomChange,
}) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const containerRef = useRef(null);
  const [cW, setCW] = useState(220);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setCW(e.contentRect.width));
    ro.observe(containerRef.current);
    setCW(containerRef.current.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const n0 = sorted.length;
  const [zStart, zEnd] = zoomRange || [0, 1];

  // Native, non-passive wheel listener — React's onWheel is passive by
  // default, so e.preventDefault() inside it silently no-ops and the page
  // scrolls instead of the chart zooming.
  useEffect(() => {
    if (!zoomable || !containerRef.current) return;
    const el = containerRef.current;
    const onWheelNative = (e) => {
      e.preventDefault();
      const center = (zStart + zEnd) / 2;
      const curSpan = zEnd - zStart;
      const factor = e.deltaY < 0 ? 0.8 : 1.25;
      const newSpan = Math.min(1, Math.max(0.04, curSpan * factor));
      let ns = center - newSpan / 2;
      let ne = center + newSpan / 2;
      if (ns < 0) { ne -= ns; ns = 0; }
      if (ne > 1) { ns -= (ne - 1); ne = 1; }
      onZoomChange([Math.max(0, ns), Math.min(1, ne)]);
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, [zoomable, zStart, zEnd, onZoomChange]);

  const iStart = n0 > 1 ? Math.max(0, Math.round(zStart * (n0 - 1))) : 0;
  const iEnd = n0 > 1 ? Math.min(n0 - 1, Math.round(zEnd * (n0 - 1))) : n0 - 1;
  const view = n0 > 1 ? sorted.slice(iStart, Math.max(iStart + 1, iEnd + 1)) : sorted;

  const PAD = { top: 18, right: dense ? 14 : 20, bottom: 30, left: dense ? 46 : 54 };
  const H = height;
  const iW = Math.max(1, cW - PAD.left - PAD.right);
  const iH = H - PAD.top - PAD.bottom;

  const vals = view.map(e => e.value);
  const allVals = targetLine ? [...vals, targetLine.value] : vals;
  const span = Math.max(...allVals) - Math.min(...allVals);
  const padV = Math.max(span * 0.15, 0.5);
  const minV = Math.min(...allVals) - padV;
  const maxV = Math.max(...allVals) + padV;

  const n = view.length;
  const px = i => PAD.left + (n === 1 ? iW / 2 : (i / (n - 1)) * iW);
  const py = v => PAD.top + iH - ((v - minV) / (maxV - minV || 1)) * iH;

  const pts = view.map((e, i) => [px(i), py(e.value)]);
  const linePath = n > 1 ? straightPath(pts) : '';
  const areaPath = n > 1 ? `${linePath} L${px(n - 1)},${PAD.top + iH} L${px(0)},${PAD.top + iH} Z` : null;

  // Only the top/bottom of the range — no gridlines cutting across the plot.
  const yLabels = [
    { y: PAD.top + 2, label: formatValue(maxV - padV) },
    { y: PAD.top + iH, label: formatValue(minV + padV) },
  ];

  const xLabelIdxs = new Set([0, n - 1]);
  const step = Math.max(1, Math.floor(n / (dense ? 3 : 6)));
  for (let i = step; i < n - 1; i += step) xLabelIdxs.add(i);
  const xLabels = [...xLabelIdxs].sort((a, b) => a - b).map(i => ({ x: px(i), label: view[i].date.slice(5) }));

  const hovered = hoverIdx !== null ? view[hoverIdx] : null;
  const gradId = `sc-grad-${color.replace('#', '')}-${dense ? 'm' : 'f'}`;

  // Drag-to-pan — plain mousedown + document listeners, same pattern already
  // used elsewhere in this file (no passive-event issue for mouse events).
  const dragRef = useRef(null);
  const startPan = (e) => {
    if (!zoomable || e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, zStart, zEnd };
    const onMove = (me) => {
      if (!dragRef.current) return;
      const dxFrac = ((me.clientX - dragRef.current.startX) / iW) * (dragRef.current.zEnd - dragRef.current.zStart);
      let ns = dragRef.current.zStart - dxFrac;
      let ne = dragRef.current.zEnd - dxFrac;
      if (ns < 0) { ne -= ns; ns = 0; }
      if (ne > 1) { ns -= (ne - 1); ne = 1; }
      onZoomChange([Math.max(0, ns), Math.min(1, ne)]);
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', cursor: zoomable ? 'grab' : 'default' }}>
      <svg
        width={cW} height={H}
        style={{ display: 'block', overflow: 'visible', cursor: zoomable ? 'grab' : 'crosshair' }}
        onMouseMove={(e) => {
          if (n === 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = Math.min(1, Math.max(0, (e.clientX - rect.left - PAD.left) / iW));
          setHoverIdx(n > 1 ? Math.round(relX * (n - 1)) : 0);
        }}
        onMouseLeave={() => setHoverIdx(null)}
        onMouseDown={startPan}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* No gridlines cutting across the plot — just the range's edges. */}
        {yLabels.map((g, i) => (
          <text key={i} x={PAD.left - 8} y={g.y + (i === 0 ? 4 : 0)} textAnchor="end" fontSize={dense ? 12 : 13} fill="#6e7681">{g.label}</text>
        ))}

        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - 8} textAnchor="middle" fontSize={dense ? 12 : 13} fill="#8b949e">{l.label}</text>
        ))}

        {targetLine && (
          <g>
            <line x1={PAD.left} y1={py(targetLine.value)} x2={PAD.left + iW} y2={py(targetLine.value)}
              stroke={targetLine.color} strokeWidth="1.5" strokeDasharray="6 3" opacity="0.7" />
            <text x={PAD.left + 4} y={py(targetLine.value) - 6} fontSize={dense ? 11 : 12} fill={targetLine.color}>{targetLine.label}</text>
          </g>
        )}

        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
        {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}

        {/* Crosshair — the only thing that marks "in-between" points; keeps the
            line itself clean instead of a dot on every single day. */}
        {hoverIdx !== null && hoverIdx !== n - 1 && (
          <line x1={px(hoverIdx)} y1={PAD.top} x2={px(hoverIdx)} y2={PAD.top + iH} stroke="#4b5259" strokeWidth="1" strokeDasharray="3 3" />
        )}

        {/* Only the current value stays permanently marked. */}
        {n > 0 && (
          <circle
            cx={px(n - 1)} cy={py(view[n - 1].value)}
            r={hoverIdx === n - 1 ? 6.5 : 5}
            fill={pointColorFn ? pointColorFn(view[n - 1], true) : '#e8e8e8'}
            stroke="#0d1117" strokeWidth="2"
          />
        )}

        {/* The hovered point lights up on demand, wherever the pointer is. */}
        {hoverIdx !== null && hoverIdx !== n - 1 && (
          <circle
            cx={px(hoverIdx)} cy={py(view[hoverIdx].value)} r={6}
            fill={pointColorFn ? pointColorFn(view[hoverIdx], false) : color}
            stroke="#0d1117" strokeWidth="2"
          />
        )}
      </svg>

      {hovered && (
        <div style={{
          position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
          background: '#1c2128', border: '1px solid #444c56', borderRadius: 8,
          padding: '6px 14px', fontSize: 13, color: '#e6edf3', pointerEvents: 'none',
          whiteSpace: 'nowrap', zIndex: 10, boxShadow: '0 4px 12px #0006',
        }}>
          <b style={{ color: '#e8e8e8' }}>{formatValue(hovered.value)}</b>
          <span style={{ color: '#8b949e', marginLeft: 8 }}>{hovered.date}</span>
          {hovered.extra && <span style={{ color: '#8b949e', marginLeft: 8 }}>{hovered.extra}</span>}
        </div>
      )}
    </div>
  );
}

// Stateful wrapper: headline stat (current value + change vs previous — reads
// at a glance without hovering), an expand button that opens the same chart
// full-screen via a portal, and — only in that fullscreen view — scroll-to-
// zoom / drag-to-pan over the date range.
function SeriesChart({ entries, color = '#5c7cfa', unit = '', targetLine = null, pointColorFn = null, formatValue: fmtProp, title = '', emptyLabel = 'No records yet', height = 190 }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [zoomRange, setZoomRange] = useState([0, 1]);

  if (!entries || entries.length === 0) return <div className="ft-empty">{emptyLabel}</div>;

  const formatValue = fmtProp || ((v) => `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`);
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const delta = prev ? last.value - prev.value : null;

  const openFullscreen = () => { setZoomRange([0, 1]); setFullscreen(true); };
  const closeFullscreen = () => setFullscreen(false);

  return (
    <div className="sc-root">
      <div className="sc-headline">
        <span className="sc-value">{formatValue(last.value)}</span>
        {delta !== null && Math.abs(delta) > 0.001 && (
          <span className="sc-delta">{delta > 0 ? '▲' : '▼'} {formatValue(Math.abs(delta))} vs last</span>
        )}
        <button className="sc-expand-btn" title="Expand / zoom" onClick={openFullscreen}>⤢</button>
      </div>
      <ChartBody
        sorted={sorted} color={color} unit={unit} targetLine={targetLine}
        pointColorFn={pointColorFn} formatValue={formatValue}
        height={height} dense={height <= 220} zoomable={false} zoomRange={[0, 1]} onZoomChange={() => {}}
      />

      {fullscreen && createPortal(
        <div className="sc-lightbox-overlay" onClick={closeFullscreen}>
          <div className="sc-lightbox" onClick={e => e.stopPropagation()}>
            <div className="sc-lightbox-header">
              <span className="sc-lightbox-title">{title}</span>
              <span className="sc-lightbox-hint">Scroll to zoom · drag to pan</span>
              {(zoomRange[0] > 0.001 || zoomRange[1] < 0.999) && (
                <button className="sc-reset-btn" onClick={() => setZoomRange([0, 1])}>Reset zoom</button>
              )}
              <button className="sc-lightbox-close" onClick={closeFullscreen}>✕</button>
            </div>
            <div className="sc-lightbox-headline">
              <span className="sc-value sc-value-lg">{formatValue(last.value)}</span>
              {delta !== null && Math.abs(delta) > 0.001 && (
                <span className="sc-delta">{delta > 0 ? '▲' : '▼'} {formatValue(Math.abs(delta))} vs last</span>
              )}
            </div>
            <div className="sc-lightbox-chart">
              <ChartBody
                sorted={sorted} color={color} unit={unit} targetLine={targetLine}
                pointColorFn={pointColorFn} formatValue={formatValue}
                height={440} dense={false} zoomable zoomRange={zoomRange} onZoomChange={setZoomRange}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function WeightChart({ entries, targetWeight, profile, height }) {
  if (!entries || entries.length === 0) return null;
  const target = targetWeight ? parseFloat(targetWeight) : null;
  const withExtra = entries.map(e => {
    if (e.waist && e.neck && profile?.height) {
      const bf = calcBodyFat({ ...profile, weight: e.value, waist: e.waist, neck: e.neck });
      return { ...e, extra: bf != null ? `%${bf} fat` : null };
    }
    return e;
  });
  return (
    <SeriesChart
      entries={withExtra}
      color="#5c7cfa"
      title="Weight"
      formatValue={v => `${v.toFixed(1)} kg`}
      targetLine={target ? { value: target, label: `target ${target}kg`, color: '#3fb950' } : null}
      height={height}
    />
  );
}

// ── Genel amaçlı çizgi grafiği: yağ oranı / FFMI / omuz-bel oranı gibi
// weightLog'dan türetilen serileri çizmek için (WeightChart'ın hedef-çizgisi
// ve kilo-özel tooltip'i olmayan sade versiyonu) ──
function MetricChart({ entries, color = '#5c7cfa', unit = '', title = '', height }) {
  if (!entries || entries.length === 0) return null;
  return <SeriesChart entries={entries} color={color} unit={unit} title={title} height={height} />;
}

// ── Kalori Grafiği ──
function KaloriChart({ meals, goalKcal, height }) {
  // Son 30 günün kalori toplamlarını hesapla
  const entries = (() => {
    const result = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayMenus = meals[dateStr] || [];
      const kcal = dayMenus.reduce((s, m) => s + (m.kcal || 0), 0);
      if (kcal > 0) result.push({ date: dateStr, value: kcal });
    }
    return result;
  })();

  if (entries.length === 0) return <div className="ft-empty">No calorie records yet</div>;

  return (
    <SeriesChart
      entries={entries}
      color="#3fb950"
      title="Calories"
      formatValue={v => `${Math.round(v)} kcal`}
      targetLine={goalKcal ? { value: goalKcal, label: `target ${goalKcal} kcal`, color: '#5c7cfa' } : null}
      pointColorFn={(e, isLast) => (goalKcal && e.value > goalKcal) ? '#f85149' : (isLast ? '#e8e8e8' : '#3fb950')}
      height={height}
    />
  );
}

// ── Mini Takvim ──
function MiniCalendar({ meals, selectedDate, onSelect }) {
  const [viewYear, setViewYear] = useState(() => {
    const d = selectedDate ? new Date(selectedDate) : new Date();
    return d.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const d = selectedDate ? new Date(selectedDate) : new Date();
    return d.getMonth();
  });

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);
  const startOffset = (firstDay + 6) % 7; // Pazartesi=0

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const safeMeals = meals || {};

  return (
    <div className="ft-mini-cal">
      <div className="ft-mini-cal-header">
        <button className="ft-mini-cal-nav" onClick={prevMonth}>‹</button>
        <span className="ft-mini-cal-title">{monthNames[viewMonth]} {viewYear}</span>
        <button className="ft-mini-cal-nav" onClick={nextMonth}>›</button>
      </div>
      <div className="ft-mini-cal-grid">
        {dayNames.map(d => <div key={d} className="ft-mini-cal-dayname">{d}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          let kcal = 0;
          try {
            const raw = safeMeals[dateStr];
            const dayMenus = Array.isArray(raw) ? raw : [];
            kcal = dayMenus.reduce((s, m) => s + (Number(m?.kcal) || 0), 0);
          } catch { kcal = 0; }
          const hasMeals = kcal > 0;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          return (
            <div
              key={dateStr}
              className={[
                'ft-mini-cal-day',
                hasMeals ? 'ft-mini-cal-day--has' : '',
                isToday ? 'ft-mini-cal-day--today' : '',
                isSelected ? 'ft-mini-cal-day--selected' : '',
              ].filter(Boolean).join(' ')}
              title={hasMeals ? `${kcal} kcal` : ''}
              onClick={() => { try { onSelect(dateStr); } catch { /* ignore */ } }}
            >
              <span className="ft-mini-cal-day-num">{day}</span>
              {hasMeals && <span className="ft-mini-cal-day-dot" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const EMPTY_PROFILE = { gender: 'male', age: '', weight: '', height: '', waist: '', neck: '', hip: '', shoulder: '', activity: 'light' };
const EMPTY_GOAL    = { type: 'maintain', currentWeight: '', targetWeight: '', startDate: '', endDate: '' }; // type: cut | maintain | bulk

// Dikey resize hook (menü ↕ antrenman)
function useResizeV(initialPx, min, max, storageKey) {
  const stored = storageKey ? (() => { try { const v = localStorage.getItem(storageKey); return v ? Math.min(max, Math.max(min, Number(v))) : initialPx; } catch { return initialPx; } })() : initialPx;
  const [size, setSize] = useState(stored);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startSize = useRef(stored);

  const onMouseDown = (e) => {
    dragging.current = true;
    startY.current = e.clientY;
    startSize.current = size;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const next = Math.min(max, Math.max(min, startSize.current + (e.clientY - startY.current)));
      setSize(next);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (storageKey) {
        setSize(prev => { localStorage.setItem(storageKey, String(prev)); return prev; });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [min, max, storageKey]);

  return [size, onMouseDown];
}

// Resize handle hook
function useResize(initialPx, min, max, storageKey, inverted = false) {
  const stored = storageKey ? (() => { try { const v = localStorage.getItem(storageKey); return v ? Math.min(max, Math.max(min, Number(v))) : initialPx; } catch { return initialPx; } })() : initialPx;
  const [size, setSize] = useState(stored);
  const state = useRef({ dragging: false, startX: 0, startSize: stored, inverted });
  state.current.inverted = inverted;

  const onMouseDown = (e) => {
    state.current.dragging = true;
    state.current.startX = e.clientX;
    state.current.startSize = size;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!state.current.dragging) return;
      const raw = e.clientX - state.current.startX;
      const delta = state.current.inverted ? -raw : raw;
      const next = Math.min(max, Math.max(min, state.current.startSize + delta));
      setSize(next);
    };
    const onUp = () => {
      if (!state.current.dragging) return;
      state.current.dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (storageKey) {
        setSize(prev => { localStorage.setItem(storageKey, String(prev)); return prev; });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [min, max, storageKey]);

  return [size, onMouseDown];
}

export default function FitnessTracker({ view = 'overview' } = {}) {
  const [profile, setProfile]               = useState(() => load('ft_profile', EMPTY_PROFILE));
  const [goal, setGoal]                     = useState(() => load('ft_goal', EMPTY_GOAL));
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingGoal, setEditingGoal]       = useState(false);
  const [draft, setDraft]                   = useState(profile);
  const [goalDraft, setGoalDraft]           = useState(goal);
  const [heroMode, setHeroMode]             = useState('main'); // 'main' | 'karne' — üst istatistik şeridi



  // Grafikler: tek seferde tek grafik, üstteki sekmeden seçilir
  const [chartTabA, setChartTabA] = useState('weight');
  const [chartTabB, setChartTabB] = useState('calories');

  // Kilo takibi
  const [weightLog, setWeightLog]     = useState(() => load('ft_weight_log', []));
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [waistInput, setWaistInput]   = useState('');
  const [neckInput, setNeckInput]     = useState('');
  const [shoulderInput, setShoulderInput] = useState('');
  const [addDate, setAddDate]         = useState(today());
  const [editingIdx, setEditingIdx]   = useState(null);
  const [editDate, setEditDate]       = useState('');
  const [editVal, setEditVal]         = useState('');
  const [editWaist, setEditWaist]     = useState('');
  const [editNeck, setEditNeck]       = useState('');
  const [editShoulder, setEditShoulder] = useState('');

  // Menu presets ("hazır öğün"): reusable saved meals, date-independent, [ { id, name, items:[{...}] } ]
  // Storage key stays 'ft_menu_templates' (unchanged) so existing saved data isn't lost.
  const [menuPresets, setMenuPresets] = useState(() => load('ft_menu_templates', []));
  const [editingPresetId, setEditingPresetId] = useState(null);
  const [editingPresetName, setEditingPresetName] = useState('');
  const [expandedPresetId, setExpandedPresetId] = useState(null);

  // Günlük Log: { [date]: [ { id, name, items:[{id,name,qty,unit,kcal,p,c,f}], kcal,p,c,f } ] }
  const [meals, setMeals]             = useState(() => load('ft_meals', {}));
  const [mealDate, setMealDate]       = useState(today());
  const [selectedMenuIds, setSelectedMenuIds] = useState(() => {
    const m = load('ft_meals', {});
    return (m[today()] || []).map(menu => menu.id);
  });
  // menuOver artık DOM class ile yönetiliyor, React state yok
  const [newMenuName, setNewMenuName] = useState('');
  const [editingMenuId, setEditingMenuId] = useState(null);
  const [editingMenuName, setEditingMenuName] = useState('');
  const [copiedItem, setCopiedItem] = useState(null); // kopyalanan menu item
  const [copiedMenu, setCopiedMenu] = useState(null); // kopyalanan menü
  const mealsHistory = useRef([]);                    // undo stack
  const mealsRef = useRef(meals);                     // always-current meals for AI tools
  const mealDateRef = useRef(mealDate);

  // Antrenman planı: günler [ { id, name, exercises:[{id,name,label,sets,reps,isMax}] } ]
  const [workouts, setWorkouts] = useState(() => {
    const saved = load('ft_workouts', null);

    // Egzersiz objesini yeni formata normalize et
    function migrateEx(e) {
      if (Array.isArray(e.sets)) {
        // Eski: sets:[{reps,isMax}] → yeni: sets=count, reps, isMax
        const count = e.sets.length || 3;
        const firstSet = e.sets[0];
        return { id: e.id || Date.now(), name: e.name || 'Exercise', label: e.label || '',
          sets: count, reps: firstSet?.reps || 10, isMax: firstSet?.isMax || false };
      }
      return e; // zaten yeni format
    }

    // Eski flat array [ {id,name,sets:[...]} ] → günlere taşı
    if (saved && Array.isArray(saved) && saved.length > 0 && !saved[0]?.exercises) {
      return [{ id: Date.now(), name: 'Day 1', exercises: saved.map(migrateEx) }];
    }
    // Eski {date:[...]} format
    if (saved && !Array.isArray(saved)) {
      const allExs = Object.values(saved).flat();
      return allExs.length > 0 ? [{ id: Date.now(), name: 'Day 1', exercises: allExs.map(migrateEx) }] : [];
    }
    // Günlü format — egzersizleri yine de migrate et (eski sets array varsa)
    if (Array.isArray(saved)) {
      return saved.map(d => ({ ...d, exercises: (d.exercises || []).map(migrateEx) }));
    }
    return [];
  });
  const workoutsRef = useRef(workouts);               // always-current workouts for AI tools
  const [expandedDay, setExpandedDay] = useState(null);
  const [renamingDay, setRenamingDay] = useState(null);
  const [newExName, setNewExName] = useState('');
  const [newDayName, setNewDayName] = useState('');

  // Arama
  const [searchQ, setSearchQ] = useState('');
  const [foodQty, setFoodQty] = useState({});   // { [food.name]: qty string }
  const [foodUnitMode, setFoodUnitMode] = useState({}); // { [food.name]: 'adet' | 'g' } — adet yemekleri gram bazında da girilebilsin
  const [presetAddFoodQ, setPresetAddFoodQ] = useState(''); // Genişletilmiş preset'e yemek ekleme arama kutusu

  // Manuel kalori ekleme
  const [customFoodName, setCustomFoodName] = useState('');
  const [customFoodKcal, setCustomFoodKcal] = useState('');

  // AI'ın tahmin edip kaydettiği yemekler — FOOD_DB'ye ek, kalıcı ve yeniden kullanılabilir
  const [customFoods, setCustomFoods] = useState(() => load('ft_custom_foods', []));
  const customFoodsRef = useRef(customFoods);



  // Resize handles: panel dividers
  const [w0, onDown0] = useResize(500, 140, 500, 'ft_panel_w0_v5');
  const [w1, onDown1] = useResize(280, 160, 800, 'ft_panel_w1_v4', true);
  // Menü sidebar iç resize
  const [menuSideW, onMenuSideDown] = useResize(160, 70, 320, 'ft_panel_menu_side_v3');
  // Antrenman tab sidebar iç resize
  const [workoutSideW, onWorkoutSideDown] = useResize(170, 100, 320, 'ft_panel_workout_side_v1');
  // Weight ↕ AI dikey resize


  // ── AI Fitness Assistant state — multiple persisted, resumable chat threads ──
  const [aiThreads, setAiThreads] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ft_ai_threads'));
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch {}
    return [{ id: Date.now(), title: 'New chat', messages: [], updatedAt: Date.now() }];
  });
  const [activeThreadId, setActiveThreadId] = useState(() => {
    const saved = localStorage.getItem('ft_ai_active_thread');
    return saved ? Number(saved) : null;
  });
  const [showThreadList, setShowThreadList] = useState(false);
  const [aiFontScale, setAiFontScale] = useState(() => {
    const saved = parseFloat(localStorage.getItem('ft_ai_font_scale'));
    return saved >= 0.6 && saved <= 2.2 ? saved : 1;
  });
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiImages, setAiImages] = useState([]); // [{dataUrl, mediaType}]
  const aiBottomRef = useRef(null);
  const aiInputRef = useRef(null);
  const aiFileRef = useRef(null);

  const activeAiThread = aiThreads.find(t => t.id === activeThreadId) || aiThreads[0];
  const aiMessages = activeAiThread ? activeAiThread.messages : [];

  useEffect(() => { save('ft_ai_threads', aiThreads); }, [aiThreads]);
  useEffect(() => {
    if (!activeThreadId || !aiThreads.some(t => t.id === activeThreadId)) {
      setActiveThreadId(aiThreads[0]?.id ?? null);
    }
  }, [aiThreads, activeThreadId]);
  useEffect(() => { if (activeThreadId) localStorage.setItem('ft_ai_active_thread', String(activeThreadId)); }, [activeThreadId]);
  useEffect(() => { localStorage.setItem('ft_ai_font_scale', String(aiFontScale)); }, [aiFontScale]);

  // Drop-in replacement for the old setAiMessages(updater) — writes into the
  // active thread instead of a single flat array, so every thread keeps its
  // own history. Same call signature (function updater or plain array).
  function updateAiMessages(updater) {
    setAiThreads(prev => prev.map(t => {
      if (t.id !== activeThreadId) return t;
      const nextMessages = typeof updater === 'function' ? updater(t.messages) : updater;
      let title = t.title;
      if (title === 'New chat') {
        const firstUser = nextMessages.find(m => m.role === 'user');
        const raw = typeof firstUser?.content === 'string' ? firstUser.content.trim() : '';
        if (raw) title = raw.slice(0, 40);
      }
      return { ...t, messages: nextMessages, title, updatedAt: Date.now() };
    }));
  }

  function newAiThread() {
    const t = { id: Date.now(), title: 'New chat', messages: [], updatedAt: Date.now() };
    setAiThreads(prev => [t, ...prev]);
    setActiveThreadId(t.id);
    setShowThreadList(false);
  }

  function deleteAiThread(id) {
    setAiThreads(prev => {
      const next = prev.filter(t => t.id !== id);
      return next.length > 0 ? next : [{ id: Date.now(), title: 'New chat', messages: [], updatedAt: Date.now() }];
    });
  }

  function handleAiWheel(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setAiFontScale(s => Math.min(2.2, Math.max(0.6, +(s + (e.deltaY < 0 ? 0.08 : -0.08)).toFixed(2))));
  }

  useEffect(() => { aiBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiMessages]);

  useEffect(() => { save('ft_menu_templates', menuPresets); }, [menuPresets]);
  useEffect(() => { save('ft_profile',    profile);   }, [profile]);
  useEffect(() => { save('ft_goal',       goal);      }, [goal]);
  useEffect(() => { save('ft_weight_log', weightLog); }, [weightLog]);
  useEffect(() => {
    mealsRef.current = meals;
    mealDateRef.current = mealDate;
    save('ft_meals', meals);
    setSelectedMenuIds(prev => {
      const raw = meals[mealDate];
      const dayIds = Array.isArray(raw) ? raw.map(m => m?.id).filter(Boolean) : [];
      const added = dayIds.filter(id => !prev.includes(id));
      return added.length > 0 ? [...prev, ...added] : prev;
    });
  }, [meals, mealDate]);
  useEffect(() => { if (Array.isArray(workouts)) { workoutsRef.current = workouts; save('ft_workouts', workouts); } }, [workouts]);
  useEffect(() => { customFoodsRef.current = customFoods; save('ft_custom_foods', customFoods); }, [customFoods]);

  // meals'i history'ye kaydederek güncelle
  function updateMeals(updater) {
    setMeals(prev => {
      mealsHistory.current = [...mealsHistory.current.slice(-30), prev];
      return typeof updater === 'function' ? updater(prev) : updater;
    });
  }

  // Ctrl+Z / Ctrl+V kısayolları
  useEffect(() => {
    function onKey(e) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      // Ctrl+Z — undo
      if (e.key === 'z') {
        if (mealsHistory.current.length === 0) return;
        const prev = mealsHistory.current[mealsHistory.current.length - 1];
        mealsHistory.current = mealsHistory.current.slice(0, -1);
        setMeals(prev);
        return;
      }

      // Ctrl+V — item yapıştır
      if (e.key === 'v') {
        setCopiedItem(item => {
          if (!item) return item;
          setSelectedMenuIds(ids => {
            setMealDate(date => {
              updateMeals(prev => {
                const day = prev[date] || [];
                const targets = ids.length > 0 ? ids : (day[0] ? [day[0].id] : []);
                if (targets.length === 0) return prev;
                const newItem = { ...item, id: Date.now() + Math.random() };
                const newDay = day.map(m => {
                  if (!targets.includes(m.id)) return m;
                  const items = [...m.items, newItem];
                  return { ...m, items, kcal: Math.round(items.reduce((s,i)=>s+i.kcal,0)), p: Math.round(items.reduce((s,i)=>s+i.p,0)*10)/10, c: Math.round(items.reduce((s,i)=>s+i.c,0)*10)/10, f: Math.round(items.reduce((s,i)=>s+i.f,0)*10)/10 };
                });
                return { ...prev, [date]: newDay };
              });
              return date;
            });
            return ids;
          });
          return item;
        });
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const bmr      = calcBMR(profile);
  const tdee     = calcTDEE(profile);
  const bmi      = calcBMI(profile.weight, profile.height);
  const bmiData  = bmiInfo(bmi);
  const lastEntry  = weightLog.length > 0 ? weightLog[weightLog.length - 1] : null;
  const lastWeight = lastEntry ? lastEntry.value : (profile.weight || null);
  // Son log'da bel/boyun varsa onları kullan, yoksa profildekini
  const bodyFatProfile = {
    ...profile,
    weight: lastWeight || profile.weight,
    waist:  lastEntry?.waist  || profile.waist,
    neck:   lastEntry?.neck   || profile.neck,
  };
  const bodyFat  = calcBodyFat(bodyFatProfile);
  const hasProfile = profile.weight && profile.height && profile.age;

  // ── Vücut kompozisyonu (Grafikler sekmesi) ──
  const currentShoulder = lastEntry?.shoulder || profile.shoulder;
  const currentWaist    = lastEntry?.waist    || profile.waist;
  const leanMass          = calcLeanMass(lastWeight, bodyFat);
  const ffmi              = calcFFMI(leanMass, profile.height);
  const shoulderWaistRatio = calcShoulderWaistRatio(currentShoulder, currentWaist);

  // Zaman içindeki yağ oranı / FFMI / omuz-bel oranı — her weightLog girdisinden türetilir
  const bodyFatSeries = weightLog
    .filter(e => e.waist && e.neck && profile.height)
    .map(e => ({ date: e.date, value: calcBodyFat({ ...profile, weight: e.value, waist: e.waist, neck: e.neck }) }))
    .filter(e => e.value != null);

  const ffmiSeries = weightLog
    .filter(e => e.waist && e.neck && profile.height)
    .map(e => {
      const bf = calcBodyFat({ ...profile, weight: e.value, waist: e.waist, neck: e.neck });
      const lean = calcLeanMass(e.value, bf);
      return { date: e.date, value: calcFFMI(lean, profile.height) };
    })
    .filter(e => e.value != null);

  const ratioSeries = weightLog
    .filter(e => e.shoulder && e.waist)
    .map(e => ({ date: e.date, value: calcShoulderWaistRatio(e.shoulder, e.waist) }))
    .filter(e => e.value != null);

  const waistSeries = weightLog.filter(e => e.waist).map(e => ({ date: e.date, value: e.waist }));
  const neckSeries   = weightLog.filter(e => e.neck).map(e => ({ date: e.date, value: e.neck }));

  // Hedefe kalan gün tahmini — son ~30 günün gerçek gidişatına göre
  const weeklyRate = calcWeeklyRate(weightLog);
  const etaDays = goal.targetWeight ? calcEtaDays(lastWeight, parseFloat(goal.targetWeight), weeklyRate) : null;

  // İki tarih arası gün sayısı
  function daysBetween(s, e) {
    if (!s || !e) return null;
    const diff = Math.round((new Date(e) - new Date(s)) / 86400000);
    return diff > 0 ? diff : null;
  }

  // Kas kaybı olmadan minimum kalori
  // Kural: BMR'nin altına inme (organ fonksiyonu için mutlak minimum)
  // + yeterli protein metabolizması için LBM başına ~31 kcal/kg
  // Pratik: max(BMR, LBM×31, 1200) — en yüksek olan güvenli minimum
  function calcMinKcal() {
    if (!profile.weight || !bmr) return null;
    const bf = bodyFat != null ? bodyFat / 100 : null;
    const lbm = bf != null ? profile.weight * (1 - bf) : profile.weight * 0.8;
    const lbmBased = Math.round(lbm * 31); // ~31 kcal/kg LBM
    return Math.max(bmr, lbmBased, 1200);
  }
  const minKcal = calcMinKcal();

  // Hedef için minimum kaç gün gerekir (kas koruma limiti ile)
  function calcMinDays(curW, tgtW) {
    if (!tdee || !curW || !tgtW || curW <= tgtW) return null;
    const minC = minKcal || 1200;
    const maxDeficit = Math.min(tdee - minC, 1000); // günlük max açık
    if (maxDeficit <= 0) return null;
    const kgToLose = curW - tgtW;
    return Math.ceil((kgToLose * 7700) / maxDeficit);
  }

  // Günlük kalori hedefi
  function calcGoalKcal() {
    if (goal.customKcal && parseFloat(goal.customKcal) > 0) return parseFloat(goal.customKcal);
    if (!tdee) return null;
    if (goal.type === 'maintain') return tdee;
    if (goal.type === 'bulk') return tdee + 300;
    if (goal.type === 'cut') {
      const curW = parseFloat(goal.currentWeight || lastWeight || profile.weight);
      const tgtW = parseFloat(goal.targetWeight);
      const days = daysBetween(goal.startDate, goal.endDate);
      const minC = minKcal || 1200;
      if (curW && tgtW && days && curW > tgtW) {
        const kgToLose    = curW - tgtW;
        const kcalToLose  = kgToLose * 7700;
        const dailyDeficit = Math.round(kcalToLose / days);
        const safeDeficit  = Math.min(dailyDeficit, 1000);
        return Math.max(minC, tdee - safeDeficit);
      }
      return Math.max(minC, tdee - 500);
    }
    return tdee;
  }
  const goalKcal = calcGoalKcal();

  // Hedef özet bilgileri
  const goalInfo = (() => {
    if (!tdee || goal.type !== 'cut') return null;
    const curW = parseFloat(goal.currentWeight || lastWeight || profile.weight);
    const tgtW = parseFloat(goal.targetWeight);
    const days = daysBetween(goal.startDate, goal.endDate);
    if (!curW || !tgtW || !days || curW <= tgtW) return null;
    const kgToLose   = curW - tgtW;
    const deficit    = tdee - goalKcal;
    const actualDays = Math.round((kgToLose * 7700) / deficit);
    const weeklyLoss = Math.round((deficit * 7) / 7700 * 10) / 10;
    return { deficit, weeklyLoss, actualDays };
  })();

  const proteinTarget = profile.weight ? Math.round(profile.weight * 2) : null;

  // ── AI tool definitions ──
  const AI_TOOLS = [
    {
      name: 'get_fitness_data',
      description: 'Read the user\'s fitness data. Always call this first before answering questions about their data. Can return multiple sections at once.',
      input_schema: {
        type: 'object',
        properties: {
          include: {
            type: 'array',
            items: { type: 'string', enum: ['profile', 'goal', 'weight_log', 'meals', 'today_macros', 'food_database', 'workouts'] },
            description: 'Which data sections to return. Request all relevant sections in one call.',
          },
          meal_date: { type: 'string', description: 'Date for meals in YYYY-MM-DD format. Defaults to today.' },
        },
        required: ['include'],
      },
    },
    {
      name: 'add_weight_entry',
      description: 'Log a new weight measurement.',
      input_schema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date YYYY-MM-DD.' },
          weight_kg: { type: 'number' },
          waist_cm: { type: 'number' },
          neck_cm: { type: 'number' },
        },
        required: ['date', 'weight_kg'],
      },
    },
    {
      name: 'create_menu',
      description: 'Create a new meal (e.g. Breakfast, Lunch, Dinner) for a date.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' },
        },
        required: ['name'],
      },
    },
    {
      name: 'add_food_to_menu',
      description: 'Add food to an existing menu. First call get_fitness_data with food_database and meals to get menu IDs and available foods. If food_name is NOT in food_database, estimate its macros yourself from general nutrition knowledge (per 100g, or per piece for countable foods) and pass them via estimate_kcal/estimate_p/estimate_c/estimate_f/estimate_unit in this SAME call — do not ask the user for macros, just estimate confidently. Estimated foods are saved permanently for reuse.',
      input_schema: {
        type: 'object',
        properties: {
          menu_id: { type: 'number' },
          food_name: { type: 'string', description: 'Food name. Match an existing food_database entry if possible.' },
          quantity: { type: 'number', description: 'Grams, or piece count if unit is "adet".' },
          date: { type: 'string' },
          estimate_kcal: { type: 'number', description: 'Only when food_name is not found: estimated kcal per 100g (or per piece if estimate_unit is "adet").' },
          estimate_p: { type: 'number', description: 'Estimated protein (g) per 100g/piece.' },
          estimate_c: { type: 'number', description: 'Estimated carbs (g) per 100g/piece.' },
          estimate_f: { type: 'number', description: 'Estimated fat (g) per 100g/piece.' },
          estimate_unit: { type: 'string', enum: ['g', 'adet'], description: 'Basis for the estimate. Default "g".' },
        },
        required: ['menu_id', 'food_name', 'quantity'],
      },
    },
    {
      name: 'remove_food_from_menu',
      description: 'Remove a specific food item from a menu.',
      input_schema: {
        type: 'object',
        properties: {
          menu_id: { type: 'number' },
          item_id: { type: 'number' },
          date: { type: 'string' },
        },
        required: ['menu_id', 'item_id'],
      },
    },
    {
      name: 'remove_menu',
      description: 'Delete an entire meal/menu.',
      input_schema: {
        type: 'object',
        properties: {
          menu_id: { type: 'number' },
          date: { type: 'string' },
        },
        required: ['menu_id'],
      },
    },
    {
      name: 'update_goal',
      description: 'Update fitness goal settings.',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['cut', 'bulk', 'maintain'] },
          target_weight_kg: { type: 'number' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          daily_kcal: { type: 'number' },
        },
        required: [],
      },
    },
    {
      name: 'add_exercise',
      description: 'Add a new exercise to a workout day. Each exercise has a set count, rep count, and optional isMax flag. Use get_fitness_data with workouts first to see existing days and their IDs.',
      input_schema: {
        type: 'object',
        properties: {
          day_id: { type: 'number', description: 'ID of the workout day to add to. Get from get_fitness_data workouts.' },
          name: { type: 'string', description: 'Exercise name.' },
          sets: { type: 'number', description: 'Number of sets, e.g. 3.' },
          reps: { type: 'number', description: 'Reps per set, e.g. 10.' },
          is_max: { type: 'boolean', description: 'True if this is a max-rep exercise (no fixed rep count).' },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_exercise',
      description: 'Update an existing exercise (change sets, reps, name, or isMax). Use get_fitness_data with workouts to get exercise IDs.',
      input_schema: {
        type: 'object',
        properties: {
          day_id: { type: 'number', description: 'ID of the workout day.' },
          exercise_id: { type: 'number', description: 'ID of the exercise to update.' },
          name: { type: 'string' },
          sets: { type: 'number' },
          reps: { type: 'number' },
          is_max: { type: 'boolean' },
        },
        required: ['exercise_id'],
      },
    },
    {
      name: 'remove_exercise',
      description: 'Remove an exercise from a workout day.',
      input_schema: {
        type: 'object',
        properties: {
          exercise_id: { type: 'number', description: 'ID of the exercise to remove.' },
          day_id: { type: 'number', description: 'ID of the workout day (optional, auto-detected).' },
        },
        required: ['exercise_id'],
      },
    },
    {
      name: 'add_workout_day',
      description: 'Create a new workout day (e.g. "Push Day", "Chest Day", "Leg Day").',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the workout day.' },
        },
        required: ['name'],
      },
    },
    {
      name: 'remove_workout_day',
      description: 'Delete an entire workout day and all its exercises.',
      input_schema: {
        type: 'object',
        properties: {
          day_id: { type: 'number', description: 'ID of the day to remove.' },
        },
        required: ['day_id'],
      },
    },
  ];

  // ── AI tool executor ──
  const executeAiTool = (toolName, input) => {
    const mealsSnapshot = mealsRef.current;
    const date = input.date || today();
    switch (toolName) {
      case 'get_fitness_data': {
        const result = {};
        const inc = input.include || [];
        if (inc.includes('profile')) result.profile = profile;
        if (inc.includes('goal')) result.goal = goal;
        if (inc.includes('weight_log')) result.weight_log = weightLog;
        if (inc.includes('meals')) {
          const d = input.meal_date || today();
          result.meals = { date: d, menus: mealsSnapshot[d] || [] };
        }
        if (inc.includes('today_macros')) {
          const d = input.meal_date || today();
          const dayM = mealsSnapshot[d] || [];
          const totals = dayM.reduce((acc, m) => ({
            kcal: acc.kcal + m.kcal,
            p: acc.p + m.p,
            c: acc.c + m.c,
            f: acc.f + m.f,
          }), { kcal: 0, p: 0, c: 0, f: 0 });
          result.today_macros = { date: d, ...totals, tdee, bmr, goal_kcal: goalKcal };
        }
        if (inc.includes('food_database')) {
          result.food_database = [...FOOD_DB, ...customFoodsRef.current].map(f => ({ name: f.name, kcal: f.kcal, p: f.p, c: f.c, f: f.f, unit: f.unit }));
        }
        if (inc.includes('workouts')) {
          const snap = JSON.parse(localStorage.getItem('ft_workouts') || '[]');
          result.workouts = { days: Array.isArray(snap) ? snap : [] };
        }
        return result;
      }
      case 'add_weight_entry': {
        const entry = { date: input.date, value: input.weight_kg };
        if (input.waist_cm) entry.waist = input.waist_cm;
        if (input.neck_cm) entry.neck = input.neck_cm;
        setWeightLog(prev => [...prev.filter(e => e.date !== input.date), entry].sort((a, b) => a.date.localeCompare(b.date)));
        return { success: true, message: `Added weight ${input.weight_kg}kg for ${input.date}` };
      }
      case 'create_menu': {
        const d = input.date || today();
        const menu = { id: Date.now(), name: input.name, items: [], kcal: 0, p: 0, c: 0, f: 0 };
        updateMeals(prev => ({ ...prev, [d]: [...(prev[d] || []), menu] }));
        setSelectedMenuIds(prev => [...prev, menu.id]);
        if (d === mealDate) setMealDate(d);
        return { success: true, menu_id: menu.id, message: `Created menu "${input.name}" for ${d}` };
      }
      case 'add_food_to_menu': {
        const d = input.date || today();
        const allFoods = [...FOOD_DB, ...customFoodsRef.current];
        let food = allFoods.find(f => f.name.toLowerCase() === input.food_name.toLowerCase())
          || allFoods.find(f => f.name.toLowerCase().includes(input.food_name.toLowerCase()));
        let estimated = false;
        if (!food && input.estimate_kcal != null) {
          food = {
            name: input.food_name,
            kcal: Number(input.estimate_kcal) || 0,
            p: Number(input.estimate_p) || 0,
            c: Number(input.estimate_c) || 0,
            f: Number(input.estimate_f) || 0,
            unit: input.estimate_unit === 'adet' ? 'adet' : 'g',
          };
          estimated = true;
          setCustomFoods(prev => [...prev.filter(cf => cf.name.toLowerCase() !== food.name.toLowerCase()), food]);
        }
        if (!food) return { success: false, message: `Food "${input.food_name}" not found. Provide estimate_kcal/estimate_p/estimate_c/estimate_f to add it as a new estimated food.` };
        const qty = input.quantity;
        const ratio = food.unit === 'adet' ? qty : qty / 100;
        const item = {
          id: Date.now() + Math.random(),
          name: food.name, qty, unit: food.unit || 'g',
          baseKcal: food.kcal, baseP: food.p, baseC: food.c, baseF: food.f,
          kcal: Math.round(food.kcal * ratio),
          p: Math.round(food.p * ratio * 10) / 10,
          c: Math.round(food.c * ratio * 10) / 10,
          f: Math.round(food.f * ratio * 10) / 10,
        };
        updateMeals(prev => ({
          ...prev,
          [d]: (prev[d] || []).map(m => {
            if (m.id !== input.menu_id) return m;
            const items = [...m.items, item];
            return { ...m, items, kcal: Math.round(items.reduce((s,i)=>s+i.kcal,0)), p: Math.round(items.reduce((s,i)=>s+i.p,0)*10)/10, c: Math.round(items.reduce((s,i)=>s+i.c,0)*10)/10, f: Math.round(items.reduce((s,i)=>s+i.f,0)*10)/10 };
          }),
        }));
        return { success: true, message: `Added ${qty}${food.unit} ${food.name} to menu (${item.kcal} kcal)${estimated ? ' [AI-estimated macros, saved for reuse]' : ''}` };
      }
      case 'remove_food_from_menu': {
        const d = input.date || today();
        updateMeals(prev => ({
          ...prev,
          [d]: (prev[d] || []).map(m => {
            if (m.id !== input.menu_id) return m;
            const items = m.items.filter(i => i.id !== input.item_id);
            return { ...m, items, kcal: Math.round(items.reduce((s,i)=>s+i.kcal,0)), p: Math.round(items.reduce((s,i)=>s+i.p,0)*10)/10, c: Math.round(items.reduce((s,i)=>s+i.c,0)*10)/10, f: Math.round(items.reduce((s,i)=>s+i.f,0)*10)/10 };
          }),
        }));
        return { success: true, message: 'Food item removed.' };
      }
      case 'remove_menu': {
        const d = input.date || today();
        updateMeals(prev => ({ ...prev, [d]: (prev[d] || []).filter(m => m.id !== input.menu_id) }));
        setSelectedMenuIds(prev => prev.filter(id => id !== input.menu_id));
        return { success: true, message: 'Menu removed.' };
      }
      case 'update_goal': {
        setGoal(prev => ({
          ...prev,
          ...(input.type !== undefined && { type: input.type }),
          ...(input.target_weight_kg !== undefined && { targetWeight: String(input.target_weight_kg) }),
          ...(input.start_date !== undefined && { startDate: input.start_date }),
          ...(input.end_date !== undefined && { endDate: input.end_date }),
          // customKcal (not dailyKcal) is what calcGoalKcal() actually reads — this field
          // name previously mismatched, so AI-set daily calorie targets silently had no effect.
          ...(input.daily_kcal !== undefined && { customKcal: String(input.daily_kcal) }),
        }));
        return { success: true, message: 'Goal updated.' };
      }
      case 'add_exercise': {
        const dayId = input.day_id || workouts[0]?.id;
        if (!dayId) return { success: false, message: 'No workout day. Use add_workout_day first.' };
        const exId = addExercise(dayId, input.name || 'Exercise');
        const patch = {};
        if (input.sets != null) patch.sets = Number(input.sets);
        if (input.reps != null) patch.reps = Number(input.reps);
        if (input.is_max != null) patch.isMax = input.is_max;
        if (Object.keys(patch).length) updateExercise(dayId, exId, patch);
        // Return updated day so AI knows the new exercise_id for any follow-up update
        const updatedDay = workouts.find(d => d.id === dayId);
        return {
          success: true,
          exercise_id: exId,
          message: `Added "${input.name}" — ${input.sets || 3}×${input.is_max ? 'MAX' : (input.reps || 10)}.`,
          day_exercises: updatedDay?.exercises.map(e => ({ id: e.id, name: e.name })) || [],
        };
      }
      case 'update_exercise': {
        const currentWorkouts = workoutsRef.current;
        const dayId = input.day_id || currentWorkouts.find(d => d.exercises?.some(e => e.id === input.exercise_id))?.id;
        if (!dayId) return { success: false, message: `Exercise ${input.exercise_id} not found. Current IDs: ${JSON.stringify(currentWorkouts.map(d => ({ day_id: d.id, day: d.name, exercises: d.exercises.map(e => ({ id: e.id, name: e.name })) })))}` };
        const patch = {};
        if (input.name != null) patch.name = input.name;
        if (input.sets != null) patch.sets = Number(input.sets);
        if (input.reps != null) patch.reps = Number(input.reps);
        if (input.is_max != null) patch.isMax = input.is_max;
        updateExercise(dayId, input.exercise_id, patch);
        return { success: true, message: `Updated "${input.name || input.exercise_id}": ${input.sets}×${input.is_max ? 'MAX' : input.reps}.` };
      }
      case 'remove_exercise': {
        const dayId = input.day_id || workouts.find(d => d.exercises?.some(e => e.id === input.exercise_id))?.id;
        if (!dayId) return { success: false, message: 'Exercise not found.' };
        removeExercise(dayId, input.exercise_id);
        return { success: true, message: 'Exercise removed.' };
      }
      case 'add_workout_day': {
        const dayId = addDay(input.name);
        return { success: true, day_id: dayId, message: `Created workout day "${input.name}".` };
      }
      case 'remove_workout_day': {
        removeDay(input.day_id);
        return { success: true, message: `Removed workout day ${input.day_id}.` };
      }
      default:
        return { success: false, message: `Unknown tool: ${toolName}` };
    }
  };

  // ── görsel → base64 ──
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result); // data:image/...;base64,...
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleAiImageFiles(files) {
    const imgs = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const dataUrl = await fileToBase64(f);
      imgs.push({ dataUrl, mediaType: f.type });
    }
    if (imgs.length) setAiImages(prev => [...prev, ...imgs]);
  }

  function handleAiPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems = [...items].filter(it => it.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    const files = imageItems.map(it => it.getAsFile()).filter(Boolean);
    handleAiImageFiles(files);
  }

  // ── AI sendAiMessage — bmr/tdee tanımlandıktan sonra ──
  const sendAiMessage = async (text) => {
    const userMsg = (typeof text === 'string' ? text : aiInput).trim();
    if ((!userMsg && aiImages.length === 0) || aiLoading) return;
    const key = localStorage.getItem('anthropic_api_key');
    if (!key) { updateAiMessages(p => [...p, { role: 'assistant', content: 'API key required — Settings → AI.' }]); return; }

    // Görsel varsa multipart content block oluştur
    const pendingImages = [...aiImages];
    let userContent;
    if (pendingImages.length > 0) {
      userContent = [
        ...pendingImages.map(img => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.dataUrl.split(',')[1] },
        })),
        ...(userMsg ? [{ type: 'text', text: userMsg }] : [{ type: 'text', text: 'Analyze this image.' }]),
      ];
    } else {
      userContent = userMsg;
    }

    const displayMsg = { role: 'user', content: userMsg || '📷 Image sent', images: pendingImages };
    const newMessages = [...aiMessages, displayMsg];
    updateAiMessages(newMessages);
    setAiInput('');
    setAiImages([]);
    setAiLoading(true);

    // Workout snapshot — system prompt'a enjekte et, AI tool çağırmadan bilsin
    const workoutSnap = workouts.map(d => ({
      id: d.id,
      name: d.name,
      exercises: d.exercises.map(e => ({ id: e.id, name: e.name, sets: e.sets, reps: e.isMax ? 'MAX' : e.reps })),
    }));

    // Görsel sayısına göre system prompt hazırla — her seferinde güncel snapshot al
    function buildSystem() {
      const snap = workoutsRef.current.map(d => ({
        id: d.id, name: d.name,
        exercises: d.exercises.map(e => ({ id: e.id, name: e.name, sets: e.sets, reps: e.isMax ? 'MAX' : e.reps })),
      }));
      return `You are an expert fitness coach and sports nutritionist with direct write access to the user's app. Today: ${today()}.
USER: gender=${profile.gender||'?'}, age=${profile.age||'?'}, weight=${profile.weight||'?'}kg, height=${profile.height||'?'}cm, BMR=${bmr||'?'}, TDEE=${tdee||'?'}, minSafeCalories=${minKcal||'?'}, goal=${goal.type||'maintain'}${goal.targetWeight?` →${goal.targetWeight}kg`:''}

CURRENT WORKOUT PLAN (use these IDs):
${snap.length ? JSON.stringify(snap) : 'No workout days yet.'}

WORKOUT DATA STRUCTURE: Each exercise: {id, name, sets:number, reps:number, isMax:boolean}.

COACHING PRINCIPLES — ground every recommendation in these, not generic advice:

TRAINING
- Progressive overload: increase load, reps, or volume by roughly 2.5-10%/week depending on training age (novices progress faster than advanced trainees). Never suggest a jump bigger than ~10% in one week — that's when injury risk spikes.
- Periodize intelligently through the full arc, not just two speeds: stabilization/technique work (higher reps, light load, controlled tempo) for beginners or after a layoff → hypertrophy blocks (6-12 reps, moderate-high volume) → maximal strength blocks (1-6 reps, low volume, high load, longer rests) → power/peaking blocks (explosive, low volume) if the goal calls for it. Match the phase to the user's goal and training age, not a fixed template.
- Rest periods and tempo matter, not just sets/reps: shorter rests (~30-60s) suit hypertrophy/endurance work, longer rests (2-5min) suit strength/power work where full recovery between sets preserves output.
- Always account for warm-up: 1-2 light ramp-up sets before working sets on compound lifts, plus brief joint-specific mobility for whatever's being trained that day — don't jump straight to working weight.
- Favor compound, multi-joint movements as the backbone of any plan; add isolation/unilateral work to address weak points or imbalances.
- Use RPE (rate of perceived exertion, 1-10) or RIR (reps in reserve) to gauge intensity when the user's 1RM isn't known — don't assume they know their max.
- Suggest a deload (cut volume/intensity ~40-50%) every 4-6 weeks or when performance stalls, not just when injury is already present.
- Watch for overtraining signals in what the user reports (persistent fatigue, stalled or declining performance, poor sleep, elevated resting heart rate, joint pain, mood dip) and recommend rest or a deload instead of pushing through.
- Form and safety over ego: if the user reports pain (not normal muscle soreness) in a joint, stop recommending load increases there and tell them to see a doctor or physical therapist — that's outside your scope.

NUTRITION
- Anchor targets to the user's real TDEE above, not generic formulas. For fat loss: a moderate deficit of ~15-25% below TDEE (roughly 300-500 kcal/day) is sustainable and preserves muscle better than aggressive cuts; never recommend going below their minSafeCalories floor above — that number already accounts for BMR and lean body mass.
- For muscle gain: a modest surplus of ~10-20% above TDEE (roughly 200-300 kcal/day) limits fat gain while supporting growth.
- Protein: 1.6-2.2g per kg bodyweight/day, toward the higher end when the user is in a deficit or recomposing. Fat: at least ~0.5-1g/kg for hormonal health; fill the rest of the budget with carbs to fuel training. This matters more than chasing an exact carb/fat split.
- Judge progress by more than scale weight: when weight_log data is available (waist/neck measurements or body-fat trend), weigh that alongside the scale number — water/sodium/cycle fluctuations make single weigh-ins noisy, so favor multi-week trend over any one entry.
- Hydration and sleep are part of the plan, not an afterthought: mention them when relevant to recovery, performance, or a stalled goal, not just as a checklist line.
- Frame nutrition around adherence and whole foods, not rigid "clean eating" — the best plan is the one they'll actually follow. When estimating macros for a food (per tool rule below), use real nutrition data, not guesses.

COMMUNICATION & ACCOUNTABILITY
- Talk like a real coach texting a client, not a report generator: warm, personal, conversational sentences. Do NOT format replies as bullet points, numbered lists, headers, or bold labels unless the user is asking for something genuinely list-shaped (e.g. "write me a 4-week plan") or added more than ~4 things at once. A quick "Nice, bumped bench press to 4x8 — that's a solid jump from last week" beats a clinical checklist every time.
- Vary your phrasing, react to what the user actually said, and let a little personality through — you're chatting with someone, not filing a report.
- Base advice on the user's actual logged data, not boilerplate — see tool rule 7 below for how to pull it.
- Be honest, not just encouraging: if progress has stalled or an ask is unsustainable (extreme deficit, daily max-effort training, skipping recovery), say so like a coach leveling with you, not a warning label — then offer the better move.
- Reinforce consistency over intensity: a missed session or an off-plan meal isn't a failure worth dwelling on — redirect to the next actionable step. If the user hasn't logged weight or meals in a while, a brief nudge to log is fair game, but don't nag.
- If something is a medical question (persistent pain, a diagnosed condition, anything beyond normal training/nutrition guidance), say plainly that it's outside your scope and they should see a doctor — don't guess.

TOOL RULES — FOLLOW EXACTLY:
1. add_exercise: ALWAYS include sets, reps, is_max in the SAME call. Never add first then update.
   Example: add_exercise({day_id:123, name:"Bench Press", sets:4, reps:8, is_max:false})
2. When an image shows a workout list: process it COMPLETELY — add every single exercise shown, one add_exercise call per exercise. Do NOT stop partway through.
3. Do NOT call get_fitness_data for workouts — current plan is already above.
4. DO NOT ask for confirmation. Act immediately, confirm after.
5. Reply in the same language as the user, in plain conversational sentences — mention what you added the way a person would say it out loud, not as a formatted list (unless it's a genuinely long batch, e.g. a whole plan parsed from an image).
6. add_food_to_menu: if food_name isn't in food_database (check via get_fitness_data first), estimate its macros yourself from general nutrition knowledge (kcal/protein/carbs/fat per 100g, or per piece for countable foods) and pass estimate_kcal/estimate_p/estimate_c/estimate_f/estimate_unit in the SAME call. Never ask the user for macros — estimate confidently, mention it was an estimate in your reply.
7. Before giving nutrition or progress-related coaching advice (deficit/surplus sizing, "am I on track", trend questions) — unlike workouts — you don't already have weight/meal history above, so call get_fitness_data with include:['weight_log','today_macros'] (add 'meals' if you need more detail) FIRST, then base your answer on what it returns instead of assuming.
8. Be quick, not curt. Keep replies short (1-4 sentences) like a real text conversation — "short" means no filler and no restating the question, NOT clinical or robotic. Talk TO the user like a person who knows them, informed by the coaching principles above even when the reply itself is brief.`;
    }

    // Agentic loop helper — system + messages → {text, actionTaken}
    async function runAiLoop(sys, messages) {
      let loopMsgs = [...messages];
      let finalText = '';
      let actionTaken = false;
      for (let i = 0; i < 12; i++) {
        const body = JSON.stringify({
          model: 'claude-opus-5',
          max_tokens: 1024,
          system: sys,
          tools: AI_TOOLS,
          messages: loopMsgs,
          output_config: { effort: 'low' },
        });
        const result = await proxyFetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body,
        });
        const data = JSON.parse(result);
        if (data.error) throw new Error(data.error.message);
        if (data.stop_reason === 'end_turn') {
          finalText = data.content.find(b => b.type === 'text')?.text?.trim() || (actionTaken ? '✓ Done.' : '');
          break;
        }
        if (data.stop_reason === 'tool_use') {
          loopMsgs.push({ role: 'assistant', content: data.content });
          const toolResults = [];
          for (const block of data.content) {
            if (block.type !== 'tool_use') continue;
            const toolResult = executeAiTool(block.name, block.input);
            if (block.name !== 'get_fitness_data') actionTaken = true;
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(toolResult) });
          }
          loopMsgs.push({ role: 'user', content: toolResults });
          continue;
        }
        break;
      }
      return { text: finalText, actionTaken };
    }

    // Görsel varsa: Aşama 1 — parse (JSON), Aşama 2 — gün gün ekle
    async function parseWorkoutImages(images) {
      const imageBlocks = images.map(img => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.dataUrl.split(',')[1] },
      }));
      const parsePrompt = `These images contain a workout plan. Extract all the days and exercises exactly.

Respond ONLY in this JSON format, nothing else:
{
  "days": [
    {
      "name": "day name (e.g. Day 1, Push Day, Chest Day...)",
      "exercises": [
        { "name": "exercise name", "sets": 3, "reps": 10, "is_max": false }
      ]
    }
  ]
}

Rules:
- is_max: true if the exercise says "max" or "AMRAP" or the rep count is unclear, otherwise false
- sets and reps must always be numbers
- Add ALL days and ALL exercises shown in the image, don't skip any`;

      const body = JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 2048,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: parsePrompt }] }],
      });
      const result = await proxyFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body,
      });
      const data = JSON.parse(result);
      if (data.error) throw new Error(data.error.message);
      const raw = data.content.find(b => b.type === 'text')?.text || '';
      // JSON bloğunu çıkar
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Failed to parse image: ' + raw.slice(0, 200));
      return JSON.parse(match[0]);
    }

    try {
      if (pendingImages.length > 0) {
        // Aşama 1: Görselleri parse et
        const parsed = await parseWorkoutImages(pendingImages);
        const days = parsed.days || [];
        if (days.length === 0) throw new Error('No workout plan found in the image.');

        // Aşama 2: Tüm günleri tek seferde state'e ekle (setWorkouts batching sorunundan kaçın)
        const newDays = days.map(day => {
          const dayId = Date.now() + Math.floor(Math.random() * 1e6);
          const exercises = (day.exercises || []).map(ex => ({
            id: Date.now() + Math.floor(Math.random() * 1e6),
            name: (ex.name || 'Exercise').trim(),
            label: '',
            sets: Number(ex.sets) || 3,
            reps: Number(ex.reps) || 10,
            isMax: ex.is_max === true,
          }));
          return { id: dayId, name: (day.name || 'Day').trim(), exercises };
        });
        setWorkouts(prev => [...prev, ...newDays]);
        if (newDays.length > 0) setExpandedDay(newDays[newDays.length - 1].id);
        playAddSound();
        const results = newDays.map(d =>
          `**${d.name}**: ${d.exercises.map(e => `${e.name} ${e.sets}×${e.isMax ? 'MAX' : e.reps}`).join(', ')}`
        );
        updateAiMessages(p => [...p, { role: 'assistant', content: results.join('\n') }]);
        setAiLoading(false);
        setTimeout(() => aiInputRef.current?.focus(), 50);
        return;
      }

      // Saf metin — normal agentic flow
      const history = newMessages.slice(-6).map((m, idx) => {
        const isLast = idx === newMessages.slice(-6).length - 1;
        if (isLast && m.role === 'user') return { role: 'user', content: userContent };
        if (m.images?.length) return { role: m.role, content: m.content || '[image sent]' };
        return { role: m.role, content: m.content };
      });
      const { text, actionTaken } = await runAiLoop(buildSystem(), history);
      updateAiMessages(p => [...p, { role: 'assistant', content: text || (actionTaken ? '✓ Done.' : '...') }]);
    } catch (e) {
      updateAiMessages(p => [...p, { role: 'assistant', content: 'Error: ' + errMsg(e) }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => aiInputRef.current?.focus(), 50);
    }
  };

  const dayMenus = meals[mealDate] || [];

  // Arama sonuçları — boşken liste gösterme
  const searchResults = searchQ.trim()
    ? [...FOOD_DB, ...customFoods].filter(f => f.name.toLowerCase().includes(searchQ.toLowerCase()))
    : [];



  // Menüye yiyecek ekle (drop veya + butonu)
  function addFoodToMenu(menuId, food, qty) {
    playAddSound();
    const mid = Number(menuId);
    const ratio = food.unit === 'adet' ? qty : qty / 100;
    const item = {
      id:       Date.now() + Math.random(),
      name:     food.name,
      qty,
      unit:     food.unit || 'g',
      baseKcal: food.kcal,
      baseP:    food.p,
      baseC:    food.c,
      baseF:    food.f,
      kcal: Math.round(food.kcal * ratio),
      p:    Math.round(food.p * ratio * 10) / 10,
      c:    Math.round(food.c * ratio * 10) / 10,
      f:    Math.round(food.f * ratio * 10) / 10,
    };
    updateMeals(prev => {
      const day = prev[mealDate] || [];
      return {
        ...prev,
        [mealDate]: day.map(m => {
          if (m.id !== mid) return m;
          const items = [...m.items, item];
          return { ...m, items, kcal: Math.round(items.reduce((s,i)=>s+i.kcal,0)), p: Math.round(items.reduce((s,i)=>s+i.p,0)*10)/10, c: Math.round(items.reduce((s,i)=>s+i.c,0)*10)/10, f: Math.round(items.reduce((s,i)=>s+i.f,0)*10)/10 };
        }),
      };
    });
  }

  function updateMenuItemQty(menuId, itemId, newQty) {
    const qty = parseFloat(newQty);
    if (!qty || qty <= 0) return;
    updateMeals(prev => {
      const day = prev[mealDate] || [];
      return {
        ...prev,
        [mealDate]: day.map(m => {
          if (m.id !== menuId) return m;
          const items = m.items.map(i => {
            if (i.id !== itemId) return i;
            const ratio = i.unit === 'adet' ? qty : qty / 100;
            return { ...i, qty, kcal: Math.round(i.baseKcal*ratio), p: Math.round(i.baseP*ratio*10)/10, c: Math.round(i.baseC*ratio*10)/10, f: Math.round(i.baseF*ratio*10)/10 };
          });
          return { ...m, items, kcal: Math.round(items.reduce((s,i)=>s+i.kcal,0)), p: Math.round(items.reduce((s,i)=>s+i.p,0)*10)/10, c: Math.round(items.reduce((s,i)=>s+i.c,0)*10)/10, f: Math.round(items.reduce((s,i)=>s+i.f,0)*10)/10 };
        }),
      };
    });
  }

  function removeFoodFromMenu(menuId, itemId) {
    playDeleteSound();
    updateMeals(prev => {
      const day = prev[mealDate] || [];
      return {
        ...prev,
        [mealDate]: day.map(m => {
          if (m.id !== menuId) return m;
          const items = m.items.filter(i => i.id !== itemId);
          return { ...m, items, kcal: Math.round(items.reduce((s,i)=>s+i.kcal,0)), p: Math.round(items.reduce((s,i)=>s+i.p,0)*10)/10, c: Math.round(items.reduce((s,i)=>s+i.c,0)*10)/10, f: Math.round(items.reduce((s,i)=>s+i.f,0)*10)/10 };
        }),
      };
    });
  }

  function renameMenu(id, name) {
    const trimmed = name.trim() || 'Meal';
    updateMeals(prev => ({
      ...prev,
      [mealDate]: (prev[mealDate] || []).map(m => m.id === id ? { ...m, name: trimmed } : m),
    }));
    setEditingMenuId(null);
  }

  // ── Menu preset CRUD ("hazır öğün") ──
  // Presets can be captured wholesale from an already-logged meal (see "Save
  // as Menu" on a meal's header), or built up food-by-food via the search box
  // above the Menu list (addFoodToActivePreset).
  function createPresetFromMenu(menu) {
    if (!menu.items.length) return;
    playAddSound();
    const preset = {
      id: Date.now(),
      name: menu.name,
      items: menu.items.map(i => ({ ...i, id: Date.now() + Math.random() })),
    };
    setMenuPresets(prev => [...prev, preset]);
  }

  // Menu üstündeki arama kutusundan yemek eklerken hedef preset: genişletilmiş
  // (açık) preset varsa oraya, yoksa yeni bir preset oluşturup ona ekler.
  function addFoodToActivePreset(food, qty) {
    if (expandedPresetId != null) {
      addFoodToPreset(expandedPresetId, food, qty);
      return;
    }
    const newId = Date.now();
    setMenuPresets(prev => [...prev, { id: newId, name: 'New Menu', items: [] }]);
    setExpandedPresetId(newId);
    // Fonksiyonel updater'lar sırayla uygulanır, bu yüzden yukarıdaki preset
    // React state'ine eklendikten sonra bu güvenle çalışır (setTimeout gerekmez).
    addFoodToPreset(newId, food, qty);
  }

  function removePreset(id) {
    playDeleteSound();
    setMenuPresets(prev => prev.filter(t => t.id !== id));
  }

  function renamePreset(id, name) {
    setMenuPresets(prev => prev.map(t => t.id === id ? { ...t, name: name.trim() || t.name } : t));
    setEditingPresetId(null);
  }

  // Preset'i günlük log'a uygula (deep copy, yeni id'lerle) — "hazır olarak ekle"
  function applyPresetToDay(preset) {
    playAddSound();
    const newMenu = {
      ...preset,
      id: Date.now() + Math.random(),
      items: preset.items.map(i => ({ ...i, id: Date.now() + Math.random() })),
      kcal: preset.items.reduce((s, i) => s + i.kcal, 0),
      p: preset.items.reduce((s, i) => s + i.p, 0),
      c: preset.items.reduce((s, i) => s + i.c, 0),
      f: preset.items.reduce((s, i) => s + i.f, 0),
    };
    updateMeals(prev => ({ ...prev, [mealDate]: [...(prev[mealDate] || []), newMenu] }));
    setSelectedMenuIds(prev => [...prev, newMenu.id]);
  }

  // Bir preset'e (hazır öğüne) yeni yemek ekle/çıkar/miktar düzenle — genişletilmiş
  // preset görünümünde kullanılıyor, "yumurta ekleyebilmek" için.
  function addFoodToPreset(presetId, food, qty) {
    playAddSound();
    const ratio = food.unit === 'adet' ? qty : qty / 100;
    const item = {
      id: Date.now() + Math.random(),
      name: food.name, qty,
      unit: food.unit || 'g',
      baseKcal: food.kcal, baseP: food.p, baseC: food.c, baseF: food.f,
      kcal: Math.round(food.kcal * ratio),
      p: Math.round(food.p * ratio * 10) / 10,
      c: Math.round(food.c * ratio * 10) / 10,
      f: Math.round(food.f * ratio * 10) / 10,
    };
    setMenuPresets(prev => prev.map(t => t.id === presetId ? { ...t, items: [...t.items, item] } : t));
  }

  function removeFoodFromPreset(presetId, itemId) {
    playDeleteSound();
    setMenuPresets(prev => prev.map(t => t.id === presetId ? { ...t, items: t.items.filter(i => i.id !== itemId) } : t));
  }

  function updatePresetItemQty(presetId, itemId, newQty) {
    const qty = parseFloat(newQty);
    if (!qty || qty <= 0) return;
    setMenuPresets(prev => prev.map(t => {
      if (t.id !== presetId) return t;
      return { ...t, items: t.items.map(i => {
        if (i.id !== itemId) return i;
        const ratio = i.unit === 'adet' ? qty : qty / 100;
        return { ...i, qty, kcal: Math.round(i.baseKcal*ratio), p: Math.round(i.baseP*ratio*10)/10, c: Math.round(i.baseC*ratio*10)/10, f: Math.round(i.baseF*ratio*10)/10 };
      })};
    }));
  }

  // Kaloriyi doğrudan elle düzenle — gramdan bağımsız, tam custom (örn. gerçek
  // ürünün paketindeki değer veritabanındaki tahminden farklıysa).
  function updatePresetItemKcal(presetId, itemId, newKcal) {
    const kcal = Math.round(parseFloat(newKcal));
    if (!kcal || kcal < 0) return;
    setMenuPresets(prev => prev.map(t => {
      if (t.id !== presetId) return t;
      return { ...t, items: t.items.map(i => i.id === itemId ? { ...i, kcal } : i) };
    }));
  }

  function addCustomKcal() {
    const kcal = Math.round(parseFloat(customFoodKcal));
    if (!customFoodName.trim() || !kcal || kcal <= 0) return;
    playAddSound();
    const item = { id: Date.now()+Math.random(), name: customFoodName.trim(), qty: kcal, unit: 'kcal', baseKcal: kcal, baseP: 0, baseC: 0, baseF: 0, kcal, p: 0, c: 0, f: 0 };
    const existingId = selectedMenuIds[selectedMenuIds.length - 1] ?? dayMenus[0]?.id ?? null;
    if (existingId) {
      updateMeals(prev => ({
        ...prev,
        [mealDate]: (prev[mealDate] || []).map(m => {
          if (m.id !== existingId) return m;
          const items = [...m.items, item];
          return { ...m, items, kcal: items.reduce((s,i)=>s+i.kcal,0), p: 0, c: 0, f: 0 };
        })
      }));
    } else {
      const newMenu = { id: Date.now(), name: 'Meal', items: [item], kcal, p: 0, c: 0, f: 0 };
      updateMeals(prev => ({ ...prev, [mealDate]: [...(prev[mealDate]||[]), newMenu] }));
      setSelectedMenuIds([newMenu.id]);
    }
    setCustomFoodName(''); setCustomFoodKcal('');
  }

  function createMenu() {
    playAddSound();
    const name = newMenuName.trim() || 'Meal';
    const menu = { id: Date.now(), name, items: [], kcal: 0, p: 0, c: 0, f: 0 };
    updateMeals(prev => ({ ...prev, [mealDate]: [...(prev[mealDate] || []), menu] }));
    setSelectedMenuIds(prev => [...prev, menu.id]);
    setNewMenuName('');
  }

  function removeMenu(id) {
    playDeleteSound();
    updateMeals(prev => ({ ...prev, [mealDate]: (prev[mealDate] || []).filter(m => m.id !== id) }));
    setSelectedMenuIds(prev => prev.filter(i => i !== id));
  }

  function duplicateMenu(menu) {
    const newMenu = {
      ...menu,
      id: Date.now(),
      name: menu.name + ' (copy)',
      items: menu.items.map(i => ({ ...i, id: Date.now() + Math.random() })),
    };
    updateMeals(prev => ({ ...prev, [mealDate]: [...(prev[mealDate] || []), newMenu] }));
    setSelectedMenuIds(prev => [...prev, newMenu.id]);
  }

  // ── Antrenman CRUD ──
  function addDay(name) {
    playAddSound();
    const day = { id: Date.now(), name: name.trim() || `Day ${workouts.length + 1}`, exercises: [] };
    setWorkouts(prev => [...prev, day]);
    setExpandedDay(day.id);
    return day.id;
  }

  function removeDay(dayId) {
    playDeleteSound();
    setWorkouts(prev => prev.filter(d => d.id !== dayId));
    setExpandedDay(prev => prev === dayId ? null : prev);
  }

  function renamDay(dayId, name) {
    setWorkouts(prev => prev.map(d => d.id === dayId ? { ...d, name } : d));
  }

  function addExercise(dayId, name) {
    playAddSound();
    // ex: { id, name, label, sets: number, reps: number, isMax: boolean }
    const ex = { id: Date.now() + Math.floor(Math.random() * 1e6), name: name.trim() || 'Exercise', label: '', sets: 3, reps: 10, isMax: false };
    setWorkouts(prev => prev.map(d => d.id === dayId ? { ...d, exercises: [...d.exercises, ex] } : d));
    return ex.id;
  }

  function removeExercise(dayId, exId) {
    playDeleteSound();
    setWorkouts(prev => prev.map(d => d.id === dayId ? { ...d, exercises: d.exercises.filter(e => e.id !== exId) } : d));
  }

  function updateExercise(dayId, exId, patch) {
    setWorkouts(prev => prev.map(d => d.id === dayId
      ? { ...d, exercises: d.exercises.map(e => e.id === exId ? { ...e, ...patch } : e) }
      : d));
  }

  function updateExerciseLabel(dayId, exId, label) {
    updateExercise(dayId, exId, { label });
  }

  function saveProfile() {
    setProfile(draft);
    setEditingProfile(false);
  }

  function saveGoal() {
    setGoal(goalDraft);
    setEditingGoal(false);
  }

  function addWeight() {
    const v = parseFloat(weightInput);
    if (!v) return;
    playAddSound();
    const entry = { date: addDate, value: v };
    if (waistInput)    entry.waist    = parseFloat(waistInput);
    if (neckInput)      entry.neck    = parseFloat(neckInput);
    if (shoulderInput)  entry.shoulder = parseFloat(shoulderInput);
    setWeightLog(prev => [...prev.filter(e => e.date !== addDate), entry].sort((a, b) => a.date.localeCompare(b.date)));
    setWeightInput('');
    setWaistInput('');
    setNeckInput('');
    setShoulderInput('');
    setShowWeightForm(false);
    // Profilde de güncelle (yağ oranı hesabı için)
    const profileUpdate = { weight: v };
    if (entry.waist)    profileUpdate.waist    = entry.waist;
    if (entry.neck)      profileUpdate.neck    = entry.neck;
    if (entry.shoulder)  profileUpdate.shoulder = entry.shoulder;
    setProfile(p => ({ ...p, ...profileUpdate }));
    setDraft(p => ({ ...p, ...profileUpdate }));
  }

  function startEdit(i, entry) {
    setEditingIdx(i);
    setEditDate(entry.date);
    setEditVal(String(entry.value));
    setEditWaist(entry.waist ? String(entry.waist) : '');
    setEditNeck(entry.neck  ? String(entry.neck)  : '');
    setEditShoulder(entry.shoulder ? String(entry.shoulder) : '');
  }

  function saveEdit(originalDate) {
    const v = parseFloat(editVal);
    if (!v || !editDate) { setEditingIdx(null); return; }
    const entry = { date: editDate, value: v };
    if (editWaist)     entry.waist    = parseFloat(editWaist);
    if (editNeck)       entry.neck    = parseFloat(editNeck);
    if (editShoulder)   entry.shoulder = parseFloat(editShoulder);
    setWeightLog(prev => [...prev.filter(e => e.date !== originalDate), entry].sort((a, b) => a.date.localeCompare(b.date)));
    setEditingIdx(null);
  }

  function deleteEntry(date) { playDeleteSound(); setWeightLog(prev => prev.filter(e => e.date !== date)); setEditingIdx(null); }

  return (
    <div className="ft-root">
      <div className="ft-scroll">

        {/* ══ HERO ══ */}
        <div className="ft-hero">
          {heroMode === 'main' ? (
            <div className="ft-hero-stats">
              <div className="ft-hstat">
                <div className="ft-hstat-val" style={{ color: lastWeight && goal.targetWeight ? (lastWeight > goal.targetWeight ? '#e8e8e8' : '#3fb950') : '#e8e8e8' }}>{lastWeight ?? '—'}</div>
                <div className="ft-hstat-unit">kg</div>
                <div className="ft-hstat-label">Current Weight</div>
              </div>
              <div className="ft-hstat-sep" />
              <div className="ft-hstat">
                <div className="ft-hstat-val" style={{ color: bodyFat == null ? 'var(--text-muted)' : bodyFat > 25 ? '#e8e8e8' : bodyFat > 15 ? '#e8a838' : '#3fb950' }}>
                  {bodyFat != null ? `%${bodyFat}` : '—'}
                </div>
                <div className="ft-hstat-unit">fat</div>
                <div className="ft-hstat-label">Body Fat %</div>
              </div>
              <div className="ft-hstat-sep" />
              <div className="ft-hstat">
                <div className="ft-hstat-val" style={{ color: '#e8e8e8' }}>{hasProfile ? goalKcal : '—'}</div>
                <div className="ft-hstat-unit">kcal</div>
                <div className="ft-hstat-label">Daily Target</div>
              </div>
              {minKcal && <>
                <div className="ft-hstat-sep" />
                <div className="ft-hstat">
                  <div className="ft-hstat-val" style={{ color: '#f85149' }}>{minKcal}</div>
                  <div className="ft-hstat-unit">kcal</div>
                  <div className="ft-hstat-label">Min. (muscle prot.)</div>
                </div>
              </>}
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
                  <div className="ft-hstat-val" style={{ color: '#e8e8e8' }}>{tdee}</div>
                  <div className="ft-hstat-unit">kcal</div>
                  <div className="ft-hstat-label">TDEE</div>
                </div>
              </>}
            </div>
          ) : (
            <div className="ft-hero-stats">
              <div className="ft-hstat">
                <div className="ft-hstat-val" style={{ color: bodyFat == null ? 'var(--text-muted)' : bodyFat > 25 ? '#e8e8e8' : bodyFat > 15 ? '#e8a838' : '#3fb950' }}>
                  {bodyFat != null ? `%${bodyFat}` : '—'}
                </div>
                <div className="ft-hstat-unit">fat</div>
                <div className="ft-hstat-label">Body Fat %</div>
              </div>
              <div className="ft-hstat-sep" />
              <div className="ft-hstat">
                <div className="ft-hstat-val" style={{ color: '#e8e8e8' }}>{leanMass ?? '—'}</div>
                <div className="ft-hstat-unit">kg</div>
                <div className="ft-hstat-label">Lean Mass</div>
              </div>
              <div className="ft-hstat-sep" />
              <div className="ft-hstat">
                <div className="ft-hstat-val" style={{ color: '#e8e8e8' }}>{shoulderWaistRatio ?? '—'}</div>
                <div className="ft-hstat-unit">ratio</div>
                <div className="ft-hstat-label">Shoulder / Waist Ratio</div>
              </div>
              <div className="ft-hstat-sep" />
              <div className="ft-hstat">
                <div className="ft-hstat-val" style={{ color: '#e8e8e8' }}>{ffmi ?? '—'}</div>
                <div className="ft-hstat-unit">ffmi</div>
                <div className="ft-hstat-label">FFMI Index</div>
              </div>
            </div>
          )}
          <div className="ft-hero-actions">
            <button className={`ft-btn-ghost${heroMode === 'karne' ? ' ft-btn-ghost--active' : ''}`} onClick={() => setHeroMode(m => m === 'main' ? 'karne' : 'main')}>
              {heroMode === 'main' ? 'Composition' : 'General'}
            </button>
            <button className="ft-btn-ghost" onClick={() => { setGoalDraft(goal); setEditingGoal(true); }}>
              Goal
            </button>
            <button className="ft-btn-ghost" onClick={() => { setDraft(profile); setEditingProfile(true); }}>
              Profile
            </button>
          </div>
        </div>

        {/* ══ PROFİL POPUP ══ */}
        {editingProfile && (
          <div className="ft-popup-overlay" onClick={() => setEditingProfile(false)}>
            <div className="ft-popup" onClick={e => e.stopPropagation()}>
              <div className="ft-popup-header">
                <span className="ft-popup-title">Profile</span>
                <button className="ft-popup-close" onClick={() => setEditingProfile(false)}>✕</button>
              </div>
              <div className="ft-profile-grid">
                {[
                  { key: 'gender', label: 'Gender',      type: 'select', opts: [['male','Male'],['female','Female']] },
                  { key: 'age',    label: 'Age',          type: 'number', ph: '25' },
                  { key: 'height', label: 'Height (cm)',  type: 'number', ph: '175' },
                  { key: 'weight', label: 'Weight (kg)',  type: 'number', ph: '75' },
                  { key: 'waist',  label: 'Waist (cm)',   type: 'number', ph: '85' },
                  { key: 'neck',   label: 'Neck (cm)',    type: 'number', ph: '38' },
                  { key: 'shoulder', label: 'Shoulder (cm)', type: 'number', ph: '110' },
                  ...(draft.gender === 'female' ? [{ key: 'hip', label: 'Hip (cm)', type: 'number', ph: '95' }] : []),
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
                  Activity Level
                  <select className="ft-input" value={draft.activity} onChange={e => setDraft(p => ({ ...p, activity: e.target.value }))}>
                    {ACTIVITY.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="ft-popup-footer">
                <button className="ft-btn-ghost" onClick={() => setEditingProfile(false)}>Cancel</button>
                <button className="ft-btn-accent" onClick={saveProfile}>Save</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ HEDEF POPUP ══ */}
        {editingGoal && (
          <div className="ft-popup-overlay" onClick={() => setEditingGoal(false)}>
            <div className="ft-popup" onClick={e => e.stopPropagation()} style={{ width: 520 }}>
              <div className="ft-popup-header">
                <span className="ft-popup-title">Set Goal</span>
                <button className="ft-popup-close" onClick={() => setEditingGoal(false)}>✕</button>
              </div>

              {/* Hedef tipi seçimi */}
              <div className="ft-goal-type-row">
                {[
                  { key: 'cut',      label: 'Cut',      icon: '🔥', desc: 'Lose weight with calorie deficit' },
                  { key: 'maintain', label: 'Maintain', icon: '⚖️', desc: 'Maintain your weight' },
                  { key: 'bulk',     label: 'Bulk',     icon: '💪', desc: 'Gain muscle with calorie surplus' },
                ].map(t => (
                  <div
                    key={t.key}
                    className={`ft-goal-type-card${goalDraft.type === t.key ? ' ft-goal-type-active' : ''}`}
                    onClick={() => setGoalDraft(g => ({ ...g, type: t.key }))}
                  >
                    <span style={{ fontSize: 24 }}>{t.icon}</span>
                    <span className="ft-goal-type-label">{t.label}</span>
                    <span className="ft-goal-type-desc">{t.desc}</span>
                  </div>
                ))}
              </div>

              {/* Yağ yakma detayları */}
              {goalDraft.type === 'cut' && (() => {
                const curW = parseFloat(goalDraft.currentWeight || lastWeight || profile.weight);
                const tgtW = parseFloat(goalDraft.targetWeight);
                const minDays = calcMinDays(curW, tgtW);
                const start = goalDraft.startDate || today();
                const minEnd = minDays ? new Date(new Date(start).getTime() + minDays * 86400000).toISOString().slice(0,10) : null;
                return (
                <div className="ft-goal-details">
                  {/* 2x2 grid: kilo + tarih */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 12px', marginBottom:8 }}>
                    <label className="ft-label">
                      Current Weight (kg)
                      <input className="ft-input" type="number" step="0.5"
                        placeholder={String(lastWeight || profile.weight || '95')}
                        value={goalDraft.currentWeight}
                        onChange={e => setGoalDraft(g => ({ ...g, currentWeight: e.target.value }))} />
                    </label>
                    <label className="ft-label">
                      Target Weight (kg)
                      <input className="ft-input" type="number" step="0.5" placeholder="70"
                        value={goalDraft.targetWeight}
                        onChange={e => setGoalDraft(g => ({ ...g, targetWeight: e.target.value }))} />
                    </label>
                    <label className="ft-label">
                      Start
                      <DatePicker
                        value={goalDraft.startDate || today()}
                        onChange={v => setGoalDraft(g => ({ ...g, startDate: v }))}
                        minDate={today()}
                      />
                    </label>
                    <label className="ft-label">
                      End {minDays && <span style={{ fontSize:10, color:'#8b949e' }}>min. {minDays}d</span>}
                      <DatePicker
                        value={goalDraft.endDate}
                        onChange={v => setGoalDraft(g => ({ ...g, endDate: v }))}
                        minDate={minEnd || start}
                      />
                      {minEnd && !goalDraft.endDate && (
                        <button className="ft-btn-sm" style={{ marginTop:3, fontSize:10 }}
                          onClick={() => setGoalDraft(g => ({ ...g, endDate: minEnd }))}>
                          Select earliest date
                        </button>
                      )}
                    </label>
                  </div>

                  {/* Hızlı süre butonları */}
                  <div className="ft-goal-quick-days">
                    {[
                      { label: '1 Month',  days: 30  },
                      { label: '2 Months', days: 60  },
                      { label: '3 Months', days: 90  },
                      { label: '6 Months', days: 180 },
                      { label: '1 Year',   days: 365 },
                    ].map(q => {
                      const start = goalDraft.startDate || today();
                      const d = new Date(start); d.setDate(d.getDate() + q.days);
                      const val = d.toISOString().slice(0, 10);
                      const curW = parseFloat(goalDraft.currentWeight || lastWeight || profile.weight);
                      const tgtW = parseFloat(goalDraft.targetWeight);
                      const minDays = calcMinDays(curW, tgtW);
                      const disabled = minDays && q.days < minDays;
                      return (
                        <button
                          key={q.days}
                          className={`ft-goal-day-btn${goalDraft.endDate === val ? ' ft-goal-day-active' : ''}${disabled ? ' ft-goal-day-disabled' : ''}`}
                          disabled={!!disabled}
                          title={disabled ? `This goal requires at least ${minDays} days` : ''}
                          onClick={() => setGoalDraft(g => ({ ...g, endDate: val }))}
                        >{q.label}</button>
                      );
                    })}
                  </div>

                  {/* Canlı hesaplama önizlemesi */}
                  {(() => {
                    const curW = parseFloat(goalDraft.currentWeight || lastWeight || profile.weight);
                    const tgtW = parseFloat(goalDraft.targetWeight);
                    const start = goalDraft.startDate || today();
                    const days = daysBetween(start, goalDraft.endDate);
                    if (!curW || !tgtW || !days || !tdee || curW <= tgtW) return null;
                    const minC        = minKcal || 1200;
                    const minDays     = calcMinDays(curW, tgtW);
                    const tooShort    = minDays && days < minDays;
                    const effectiveDays = tooShort ? minDays : days;
                    const kgToLose    = curW - tgtW;
                    const kcalToLose  = kgToLose * 7700;
                    const rawDeficit  = Math.round(kcalToLose / effectiveDays);
                    const safeDeficit = Math.min(rawDeficit, 1000);
                    const daily       = Math.max(minC, tdee - safeDeficit);
                    const actualDeficit = tdee - daily;
                    const weeklyLoss  = Math.round((actualDeficit * 7) / 7700 * 100) / 100;
                    const endDateStr  = new Date(goalDraft.endDate).toLocaleDateString('en-US', { day:'numeric', month:'long', year:'numeric' });
                    return (
                      <div className="ft-goal-preview">
                        <div className="ft-goal-preview-row">
                          <span>Duration</span>
                          <b style={{ color: '#8b949e' }}>{effectiveDays} days ({endDateStr})</b>
                        </div>
                        <div className="ft-goal-preview-row">
                          <span>Weight to lose</span>
                          <b style={{ color: '#f85149' }}>{kgToLose.toFixed(1)} kg</b>
                        </div>
                        <div className="ft-goal-preview-row">
                          <span>Daily calorie target</span>
                          <b style={{ color: 'var(--accent)' }}>{daily} kcal</b>
                        </div>
                        <div className="ft-goal-preview-row">
                          <span>Min. calories (muscle prot.)</span>
                          <b style={{ color: '#f85149' }}>{minC} kcal</b>
                        </div>
                        <div className="ft-goal-preview-row">
                          <span>Daily deficit</span>
                          <b style={{ color: '#e8e8e8' }}>-{actualDeficit} kcal</b>
                        </div>
                        <div className="ft-goal-preview-row">
                          <span>Weekly estimated loss</span>
                          <b style={{ color: '#3fb950' }}>{weeklyLoss} kg/week</b>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                );
              })()}

              {goalDraft.type === 'bulk' && (
                <div className="ft-goal-details">
                  <div className="ft-goal-preview">
                    <div className="ft-goal-preview-row">
                      <span>TDEE</span>
                      <b style={{ color: '#8b949e' }}>{tdee || '—'} kcal</b>
                    </div>
                    <div className="ft-goal-preview-row">
                      <span>Daily calorie target</span>
                      <b style={{ color: 'var(--accent)' }}>{tdee ? tdee + 300 : '—'} kcal</b>
                    </div>
                    <div className="ft-goal-preview-row">
                      <span>Daily surplus</span>
                      <b style={{ color: '#3fb950' }}>+300 kcal</b>
                    </div>
                  </div>
                </div>
              )}

              {goalDraft.type === 'maintain' && (
                <div className="ft-goal-details">
                  <div className="ft-goal-preview">
                    <div className="ft-goal-preview-row">
                      <span>Daily calorie target</span>
                      <b style={{ color: 'var(--accent)' }}>{tdee || '—'} kcal</b>
                    </div>
                    <div className="ft-goal-preview-row">
                      <span>Strategy</span>
                      <b style={{ color: '#8b949e' }}>TDEE = Consumption</b>
                    </div>
                  </div>
                </div>
              )}

              {/* Custom kalori */}
              <div className="ft-goal-custom-kcal">
                <label className="ft-label" style={{ flex: 1 }}>
                  <span>Custom calorie target <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(leave blank for automatic)</span></span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                    <input
                      className="ft-input"
                      type="number"
                      min="800"
                      max="10000"
                      step="50"
                      placeholder={goalKcal ? `Auto: ${goalKcal} kcal` : 'kcal'}
                      value={goalDraft.customKcal || ''}
                      onChange={e => setGoalDraft(g => ({ ...g, customKcal: e.target.value }))}
                      style={{ flex: 1 }}
                    />
                    {goalDraft.customKcal && (
                      <button className="ft-btn-ghost" style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}
                        onClick={() => setGoalDraft(g => ({ ...g, customKcal: '' }))}>
                        Reset
                      </button>
                    )}
                  </div>
                </label>
              </div>

              <div className="ft-popup-footer">
                <button className="ft-btn-ghost" onClick={() => setEditingGoal(false)}>Cancel</button>
                <button className="ft-btn-accent" onClick={saveGoal}>Save</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ ANA LAYOUT: 4 panel + 3 resize handle ══ */}
        <div className="ft-main-layout">

          {view !== 'overview' ? null : (
          <>
          {/* ── Sol Kolon: AI (Kilo Takibi Grafikler sekmesine taşındı) ── */}
          <div className="ft-resizable-col" style={{ width: w0, gap: 0 }}>
            {/* ── AI Fitness Assistant ── */}
            <div className="ft-card ft-ai-box" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <div className="ft-card-header">
                <div className="ft-card-label">AI Fitness Assistant</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button className="ft-btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => setShowThreadList(s => !s)} title="Chat history">
                    🗂 {activeAiThread?.title || 'New chat'}
                  </button>
                  <button className="ft-btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={newAiThread} title="Start a new chat">+ New</button>
                  {aiMessages.length > 0 && (
                    <button className="ft-btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => updateAiMessages([])} title="Clear this chat's messages">Clear</button>
                  )}
                </div>
              </div>

              {showThreadList && (
                <div className="ft-ai-thread-list">
                  {[...aiThreads].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(t => (
                    <div
                      key={t.id}
                      className={`ft-ai-thread-item ${t.id === activeThreadId ? 'active' : ''}`}
                      onClick={() => { setActiveThreadId(t.id); setShowThreadList(false); }}
                    >
                      <span className="ft-ai-thread-item-title">{t.title || 'New chat'}</span>
                      <button
                        className="ft-ai-thread-item-delete"
                        title="Delete this chat"
                        onClick={e => { e.stopPropagation(); deleteAiThread(t.id); }}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="ft-ai-messages" onWheel={handleAiWheel} style={{ '--ft-ai-scale': aiFontScale }}>
                {aiMessages.map((m, i) => (
                  <div key={i} className={`ft-ai-msg ft-ai-msg--${m.role}`}>
                    <span className="ft-ai-msg-label">{m.role === 'user' ? 'You' : 'AI'}</span>
                    <div className="ft-ai-msg-body">
                      {m.images?.length > 0 && (
                        <div className="ft-ai-msg-images">
                          {m.images.map((img, ii) => (
                            <img key={ii} src={img.dataUrl} className="ft-ai-msg-img" alt="" />
                          ))}
                        </div>
                      )}
                      <span className="ft-ai-msg-text" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="ft-ai-msg ft-ai-msg--assistant">
                    <span className="ft-ai-msg-label">AI</span>
                    <span className="ft-ai-typing">●●●</span>
                  </div>
                )}
                <div ref={aiBottomRef} />
              </div>

              {/* Görsel önizleme */}
              {aiImages.length > 0 && (
                <div className="ft-ai-image-preview">
                  {aiImages.map((img, i) => (
                    <div key={i} className="ft-ai-image-thumb">
                      <img src={img.dataUrl} alt="" />
                      <button className="ft-ai-image-remove" onClick={() => setAiImages(prev => prev.filter((_, idx) => idx !== i))}>×</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="ft-ai-input-row">
                <input
                  type="file" accept="image/*" multiple ref={aiFileRef} style={{ display: 'none' }}
                  onChange={e => { handleAiImageFiles([...e.target.files]); e.target.value = ''; }}
                />
                <button
                  className="ft-ai-attach-btn"
                  onClick={() => aiFileRef.current?.click()}
                  title="Add image"
                  disabled={aiLoading}
                >📎</button>
                <input
                  ref={aiInputRef}
                  className="ft-input"
                  style={{ flex: 1, fontSize: 13 }}
                  placeholder="Ask a question or paste an image (Ctrl+V)..."
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); } }}
                  onPaste={handleAiPaste}
                  disabled={aiLoading}
                />
                <button className="ft-btn-accent" onClick={() => sendAiMessage()} disabled={aiLoading || (!aiInput.trim() && aiImages.length === 0)}>
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Handle 1: kilo | menü */}
          <div className="ft-resize-handle" onMouseDown={onDown0} />

          {/* ── Menü (Antrenman ayrı sekmeye taşındı — tam yükseklik) ── */}
          <div className="ft-resizable-col" style={{ flex: 1, minWidth: 160, gap: 0 }}>
            <div className="ft-card ft-log-card" style={{ flex: 1, overflow: 'hidden' }}>
              <div className="ft-card-header">
                <div className="ft-card-label">Menu</div>
                <span style={{ fontSize: 12, color: '#6e7681' }}>{mealDate}</span>
              </div>

              <div className="ft-log-body">

                {/* Sol: takvim + şablonlar + günlük log */}
                <div className="ft-menu-sidebar" style={{ width: menuSideW, minWidth: menuSideW }}>
                  {/* Mini Takvim */}
                  <MiniCalendar
                    meals={meals}
                    selectedDate={mealDate}
                    onSelect={d => {
                      setMealDate(d);
                      const raw = mealsRef.current[d];
                      setSelectedMenuIds(Array.isArray(raw) ? raw.map(m => m?.id).filter(Boolean) : []);
                    }}
                  />

                  {/* ── Menu (hazır öğünler) ── */}
                  <div className="ft-sidebar-section-label">Menu</div>

                  {/* Sağdaki "Search food" ile aynı mantık — ama eklenen yemek
                      bugünün log'una değil, açık olan (veya yeni oluşturulan)
                      Menu preset'ine gider. */}
                  <div style={{ margin: '0 4px 8px' }}>
                    <input
                      className="ft-input"
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: 15, padding: '7px 10px' }}
                      placeholder="Search food to add to menu..."
                      value={presetAddFoodQ}
                      onChange={e => setPresetAddFoodQ(e.target.value)}
                    />
                    {presetAddFoodQ.trim() && (() => {
                      const results = [...FOOD_DB, ...customFoods]
                        .filter(f => f.name.toLowerCase().includes(presetAddFoodQ.trim().toLowerCase()))
                        .slice(0, 8);
                      if (results.length === 0) {
                        return <div className="ft-empty" style={{ fontSize: 13, padding: '6px 0' }}>Not found</div>;
                      }
                      return (
                        <div style={{
                          marginTop: 6,
                          border: '1px solid var(--border-hover)',
                          borderRadius: 8,
                          background: 'var(--bg-surface)',
                          padding: '4px 8px',
                        }}>
                          {results.map((food, i) => {
                            // 'adet' yemeklerde (köfte gibi) gram-adet arasında geçiş —
                            // perUnit sayesinde gram girilince de doğru kalori hesaplanır.
                            const canGram = food.unit === 'adet' && food.perUnit;
                            const mode = canGram ? (foodUnitMode[food.name] || food.defaultUnit || 'adet') : (food.unit || 'g');
                            const effectiveFood = mode === 'g' && food.unit === 'adet' ? toGramBasis(food) : food;
                            const defaultQty = mode === 'adet' ? 1 : 100;
                            const qty = parseFloat(foodQty[food.name]) || defaultQty;
                            const ratio = effectiveFood.unit === 'adet' ? qty : qty / 100;
                            const previewKcal = Math.round(effectiveFood.kcal * ratio);
                            return (
                              <div key={i} style={{ padding: '8px 0', borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                  <span style={{ flex:1, fontSize:15, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{food.name}</span>
                                  <span style={{ color:'var(--text-secondary)', fontSize:15, fontWeight:600 }}>{previewKcal} kcal</span>
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:6, marginTop: 6 }}>
                                  {canGram && (
                                    <div style={{ display:'flex', border:'1px solid var(--border-hover)', borderRadius:4, overflow:'hidden', flexShrink:0 }}>
                                      <button
                                        style={{
                                          padding:'3px 8px', fontSize:12, border:'none', cursor:'pointer',
                                          background: mode === 'adet' ? 'var(--accent)' : 'transparent',
                                          color: mode === 'adet' ? '#fff' : 'var(--text-muted)',
                                        }}
                                        onClick={() => { setFoodUnitMode(prev => ({ ...prev, [food.name]: 'adet' })); setFoodQty(prev => ({ ...prev, [food.name]: '1' })); }}
                                      >pcs</button>
                                      <button
                                        style={{
                                          padding:'3px 8px', fontSize:12, border:'none', cursor:'pointer',
                                          background: mode === 'g' ? 'var(--accent)' : 'transparent',
                                          color: mode === 'g' ? '#fff' : 'var(--text-muted)',
                                        }}
                                        onClick={() => { setFoodUnitMode(prev => ({ ...prev, [food.name]: 'g' })); setFoodQty(prev => ({ ...prev, [food.name]: String(food.perUnit) })); }}
                                      >g</button>
                                    </div>
                                  )}
                                  <input
                                    className="ft-input"
                                    type="number" min="0.5"
                                    step={mode === 'adet' ? 1 : 10}
                                    value={foodQty[food.name] ?? defaultQty}
                                    style={{ width:62, textAlign:'center', padding:'3px 4px', fontSize:15 }}
                                    onChange={e => setFoodQty(prev => ({ ...prev, [food.name]: e.target.value }))}
                                  />
                                  <span style={{ color:'#8b949e', fontSize:15, minWidth: 20 }}>{mode === 'adet' ? 'pcs' : 'g'}</span>
                                  <button className="ft-btn-sm" style={{ padding: '3px 10px', fontSize: 14, marginLeft: 'auto' }}
                                    onClick={() => addFoodToActivePreset(effectiveFood, qty)}>+</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {menuPresets.length === 0 && (
                    <div className="ft-empty" style={{ fontSize: 13, padding: '4px 4px 8px' }}>
                      Log a meal, then "Save as Menu" to reuse it
                    </div>
                  )}
                  {menuPresets.map(preset => {
                    const isExpanded = expandedPresetId === preset.id;
                    const presetKcal = preset.items.reduce((s, i) => s + i.kcal, 0);
                    return (
                      <div key={preset.id} style={{ marginBottom: 6 }}>
                        {/* Preset başlık satırı */}
                        <div className="ft-menu-item"
                          style={{ '--item-color': hashColorFor(preset.name) }}
                          onClick={() => { setExpandedPresetId(isExpanded ? null : preset.id); setPresetAddFoodQ(''); }}>
                          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginRight: 2 }}>{isExpanded ? '▾' : '▸'}</div>
                          <div className="ft-menu-info">
                            {editingPresetId === preset.id ? (
                              <input className="ft-input" style={{ fontSize:14, padding:'3px 8px', width:'100%' }} autoFocus
                                value={editingPresetName}
                                onChange={e => setEditingPresetName(e.target.value)}
                                onBlur={() => renamePreset(preset.id, editingPresetName)}
                                onKeyDown={e => { if (e.key === 'Enter') renamePreset(preset.id, editingPresetName); if (e.key === 'Escape') setEditingPresetId(null); }}
                                onClick={e => e.stopPropagation()}
                              />
                            ) : (
                              <span className="ft-menu-name">{preset.name}</span>
                            )}
                            <span className="ft-menu-kcal">{presetKcal} kcal</span>
                          </div>
                          <button className="ft-del-btn" title="Rename" style={{ fontSize: 14 }}
                            onClick={e => { e.stopPropagation(); setEditingPresetId(preset.id); setEditingPresetName(preset.name); }}>✎</button>
                          <button className="ft-del-btn" title="Add to today" style={{ fontSize: 15 }}
                            onClick={e => { e.stopPropagation(); applyPresetToDay(preset); }}>▶</button>
                          <button className="ft-del-btn" style={{ fontSize: 15 }}
                            onClick={e => { e.stopPropagation(); removePreset(preset.id); }}>×</button>
                        </div>

                        {/* Expand: içindeki yemekler — gram VE kalori bağımsız olarak custom düzenlenebilir */}
                        {isExpanded && (
                          <div style={{ paddingLeft: 8, paddingRight: 4, paddingTop: 6, paddingBottom: 6 }} onClick={e => e.stopPropagation()}>
                            {preset.items.length === 0
                              ? <div className="ft-empty" style={{ fontSize: 13 }}>No food yet — search above to add</div>
                              : preset.items.map(item => (
                                <div key={item.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 0', borderBottom:'1px solid #21262d44', fontSize:15 }}>
                                  <span style={{ flex:1, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</span>
                                  <input
                                    className="ft-input"
                                    type="number" min="0.5"
                                    step={item.unit === 'adet' ? 1 : 10}
                                    value={item.qty}
                                    title="Amount (calories recalculate automatically when changed)"
                                    style={{ width:54, textAlign:'center', padding:'3px 4px', fontSize:15 }}
                                    onChange={e => updatePresetItemQty(preset.id, item.id, e.target.value)}
                                  />
                                  <span style={{ color:'#8b949e', fontSize:15 }}>{item.unit}</span>
                                  <input
                                    className="ft-input"
                                    type="number" min="0"
                                    value={item.kcal}
                                    title="Edit calories manually (independent of formula, custom)"
                                    style={{ width:58, textAlign:'center', padding:'3px 4px', fontSize:15 }}
                                    onChange={e => updatePresetItemKcal(preset.id, item.id, e.target.value)}
                                  />
                                  <span style={{ color:'#8b949e', fontSize:15 }}>kcal</span>
                                  <button className="ft-del-btn" style={{ fontSize:14 }}
                                    onClick={() => removeFoodFromPreset(preset.id, item.id)}>×</button>
                                </div>
                              ))
                            }
                          </div>
                        )}
                      </div>
                    );
                  })}

                </div>

                {/* İç resize handle */}
                <div className="ft-resize-handle ft-resize-handle-inner" onMouseDown={onMenuSideDown} />

                {/* Sağ: seçili menülerin içeriği — her menü ayrı drop zone */}
                <div className="ft-log-content">
                  {selectedMenuIds.length === 0 && (
                    <div className="ft-empty" style={{ marginTop: 24 }}>Select menu from left</div>
                  )}

                  {dayMenus.filter(m => selectedMenuIds.includes(m.id)).map(menu => {
                    const isOver = false; // DOM class ile yönetiliyor
                    const menuKcal = menu.items.reduce((s, i) => s + i.kcal, 0);
                    return (
                      <div key={menu.id} className="ft-menu-section" style={{ '--item-color': hashColorFor(menu.name) }}>
                        {/* Menü başlığı */}
                        <div className="ft-menu-section-header">
                          <span className="ft-menu-section-name">{menu.name}</span>
                          <span className="ft-menu-section-kcal">{menuKcal} kcal</span>
                          <button className="ft-del-btn" title="Save as Menu — reuse this meal later" style={{ marginLeft: 4, fontSize: 12 }}
                            onClick={() => createPresetFromMenu(menu)} disabled={menu.items.length === 0}>📌</button>
                          <button className="ft-del-btn" title="Delete menu" onClick={() => removeMenu(menu.id)}>×</button>
                        </div>

                        {/* Drop zone */}
                        <div className="ft-menu-dropzone">
                          {menu.items.length === 0 ? (
                            <div className="ft-menu-drop-hint">Select food from right and add with +</div>
                          ) : (
                            menu.items.map(item => {
                              const isCopied = copiedItem?.id === item.id;
                              return (
                              <div
                                key={item.id}
                                className="ft-menu-food-row"
                                style={isCopied ? { outline: '1.5px solid #58a6ff88', borderRadius: 4 } : {}}
                                title="Copy with Ctrl+C"
                                onClick={() => setCopiedItem(item)}
                              >
                                <span className="ft-list-name">{item.name}</span>
                                <input
                                  className="ft-input ft-qty-input"
                                  type="number"
                                  min="0.5"
                                  step={item.unit === 'adet' ? 1 : 10}
                                  value={item.qty}
                                  onChange={e => updateMenuItemQty(menu.id, item.id, e.target.value)}
                                  onClick={e => e.stopPropagation()}
                                />
                                <span className="ft-list-sub">{item.unit}</span>
                                <span style={{ color: '#e8e8e8', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>{item.kcal} kcal</span>
                                <button className="ft-del-btn" onClick={e => { e.stopPropagation(); removeFoodFromMenu(menu.id, item.id); }}>×</button>
                              </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Toplam — seçili tüm menüler */}
                  {selectedMenuIds.length > 0 && (() => {
                    const selMenus = dayMenus.filter(m => selectedMenuIds.includes(m.id));
                    const totalKcal = selMenus.reduce((s, m) => s + m.kcal, 0);
                    const totalP    = selMenus.reduce((s, m) => s + m.p, 0);
                    const totalC    = selMenus.reduce((s, m) => s + m.c, 0);
                    const totalF    = selMenus.reduce((s, m) => s + m.f, 0);
                    if (selMenus.length < 2 && selMenus[0]?.items.length === 0) return null;
                    return (
                      <div className="ft-log-summary" style={{ marginTop: 8 }}>
                        <span className="ft-log-kcal" style={{ color: '#e8e8e8' }}>
                          {totalKcal} kcal
                        </span>
                        <span className="ft-log-macros">
                          P <b style={{ color: '#f85149' }}>{Math.round(totalP)}g</b>
                          · C <b style={{ color: '#e8e8e8' }}>{Math.round(totalC)}g</b>
                          · F <b style={{ color: '#3fb950' }}>{Math.round(totalF)}g</b>
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

          </div>

          {/* Handle 2: menü | arama */}
          <div className="ft-resize-handle" onMouseDown={onDown1} />

          {/* ── Yiyecek Paneli ── */}
          <div className="ft-resizable-col" style={{ width: w1, minWidth: 160, flexShrink: 0 }}>
            <div className="ft-card ft-search-card" style={{ height: '100%', boxSizing: 'border-box', display:'flex', flexDirection:'column', paddingTop: 8 }}>

              <input
                className="ft-input"
                style={{ margin:'4px 8px', fontSize:13, padding:'7px 10px' }}
                placeholder="Search food..."
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
              />
              {/* Manuel kalori ekleme */}
              <div style={{ display:'flex', gap:4, margin:'0 8px 4px', alignItems:'center' }}>
                <input
                  className="ft-input"
                  style={{ flex:2, fontSize:12, padding:'5px 8px' }}
                  placeholder="Calorie name"
                  value={customFoodName}
                  onChange={e => setCustomFoodName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomKcal(); }}
                />
                <input
                  className="ft-input"
                  style={{ flex:1, fontSize:12, padding:'5px 8px', textAlign:'center' }}
                  placeholder="Amount"
                  type="number" min="1"
                  value={customFoodKcal}
                  onChange={e => setCustomFoodKcal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomKcal(); }}
                />
                <button className="ft-btn-sm" style={{ padding:'5px 8px', fontSize:12, whiteSpace:'nowrap' }}
                  onClick={addCustomKcal}
                >+</button>
              </div>

              <div className="ft-food-list" style={{ flex:1, overflowY:'auto' }}>
                {searchQ.trim() === '' ? (
                  <div className="ft-food-empty-hint">
                    <div style={{ fontSize:28, opacity:0.2 }}>🔍</div>
                    <div>Search to add to daily log</div>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="ft-food-empty-hint">
                    <div style={{ fontSize:28, opacity:0.2 }}>🤷</div>
                    <div>Not found</div>
                  </div>
                ) : searchResults.map((food, i) => {
                  // 'adet' yemeklerde (köfte gibi) gram-adet arasında geçiş —
                  // Menu arama kutusuyla aynı mantık (toGramBasis + foodUnitMode).
                  const canGram = food.unit === 'adet' && food.perUnit;
                  const mode = canGram ? (foodUnitMode[food.name] || food.defaultUnit || 'adet') : (food.unit || 'g');
                  const effectiveFood = mode === 'g' && food.unit === 'adet' ? toGramBasis(food) : food;
                  const defaultQty = mode === 'adet' ? 1 : 100;
                  const qty = parseFloat(foodQty[food.name]) || defaultQty;
                  const ratio = effectiveFood.unit === 'adet' ? qty : qty / 100;
                  return (
                    <div key={i} className="ft-food-item">
                      <div className="ft-food-info">
                        <span className="ft-food-name">{food.name}</span>
                        <span className="ft-food-kcal">{Math.round(effectiveFood.kcal * ratio)} kcal</span>
                      </div>
                      <div className="ft-food-macros">
                        <span style={{ color:'#f85149' }}>P {Math.round(effectiveFood.p * ratio * 10)/10}g</span>
                        <span style={{ color:'#e8e8e8' }}>C {Math.round(effectiveFood.c * ratio * 10)/10}g</span>
                        <span style={{ color:'#3fb950' }}>F {Math.round(effectiveFood.f * ratio * 10)/10}g</span>
                      </div>
                      <div className="ft-food-actions">
                        {canGram && (
                          <div style={{ display:'flex', border:'1px solid var(--border-hover)', borderRadius:4, overflow:'hidden', flexShrink:0 }}>
                            <button
                              style={{
                                padding:'5px 8px', fontSize:12, border:'none', cursor:'pointer',
                                background: mode === 'adet' ? 'var(--accent)' : 'transparent',
                                color: mode === 'adet' ? '#fff' : 'var(--text-muted)',
                              }}
                              onClick={() => { setFoodUnitMode(prev => ({ ...prev, [food.name]: 'adet' })); setFoodQty(prev => ({ ...prev, [food.name]: '1' })); }}
                            >pcs</button>
                            <button
                              style={{
                                padding:'5px 8px', fontSize:12, border:'none', cursor:'pointer',
                                background: mode === 'g' ? 'var(--accent)' : 'transparent',
                                color: mode === 'g' ? '#fff' : 'var(--text-muted)',
                              }}
                              onClick={() => { setFoodUnitMode(prev => ({ ...prev, [food.name]: 'g' })); setFoodQty(prev => ({ ...prev, [food.name]: String(food.perUnit) })); }}
                            >g</button>
                          </div>
                        )}
                        <input
                          className="ft-input ft-qty-input"
                          type="number" min="0.5"
                          step={mode === 'adet' ? 1 : 10}
                          value={foodQty[food.name] ?? defaultQty}
                          onChange={e => setFoodQty(prev => ({ ...prev, [food.name]: e.target.value }))}
                        />
                        <span className="ft-food-unit">{mode === 'adet' ? 'pcs' : 'g'}</span>
                        <button className="ft-btn-sm" onClick={() => {
                          // Her zaman doğrudan günlük log'a ekle — tek, sade akış
                          const existingId = selectedMenuIds[selectedMenuIds.length - 1] ?? dayMenus[0]?.id ?? null;
                          if (existingId) {
                            setSelectedMenuIds(prev => prev.includes(existingId) ? prev : [...prev, existingId]);
                            addFoodToMenu(existingId, effectiveFood, qty);
                          } else {
                            const ratio2 = effectiveFood.unit === 'adet' ? qty : qty / 100;
                            const item = { id: Date.now()+Math.random(), name:effectiveFood.name, qty, unit:effectiveFood.unit||'g', baseKcal:effectiveFood.kcal, baseP:effectiveFood.p, baseC:effectiveFood.c, baseF:effectiveFood.f, kcal:Math.round(effectiveFood.kcal*ratio2), p:Math.round(effectiveFood.p*ratio2*10)/10, c:Math.round(effectiveFood.c*ratio2*10)/10, f:Math.round(effectiveFood.f*ratio2*10)/10 };
                            const newMenu = { id: Date.now(), name: 'Meal', items: [item], kcal: item.kcal, p: item.p, c: item.c, f: item.f };
                            updateMeals(prev => ({ ...prev, [mealDate]: [...(prev[mealDate]||[]), newMenu] }));
                            setSelectedMenuIds([newMenu.id]);
                          }
                        }}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          </>
          )}

          {view !== 'workout' ? null : (
            <div className="ft-resizable-col" style={{ flex: 1, minWidth: 160 }}>
              {/* ── Antrenman Planı (tab'lar) — ayrı sekme ── */}
              {(() => {
                const activeDay = workouts.find(d => d.id === expandedDay) || workouts[0] || null;
                return (
                  <div className="ft-card ft-workout-card">
                    {/* Tab bar */}
                    <div className="ft-workout-tabs" style={{ width: workoutSideW, minWidth: workoutSideW }}>
                      {workouts.map(day => {
                        const isActive = activeDay?.id === day.id;
                        const isRenaming = renamingDay === day.id;
                        return (
                          <div
                            key={day.id}
                            className={`ft-workout-tab${isActive ? ' ft-workout-tab--active' : ''}`}
                            onClick={() => { setExpandedDay(day.id); setRenamingDay(null); }}
                          >
                            {isRenaming ? (
                              <input
                                className="ft-workout-tab-name ft-workout-tab-name--editing"
                                value={day.name}
                                autoFocus
                                onClick={e => e.stopPropagation()}
                                onChange={e => renamDay(day.id, e.target.value)}
                                onBlur={() => setRenamingDay(null)}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setRenamingDay(null); }}
                              />
                            ) : (
                              <span className="ft-workout-tab-name">{day.name}</span>
                            )}
                            {!isRenaming && (
                              <button
                                className="ft-workout-tab-edit"
                                title="Rename"
                                onClick={e => { e.stopPropagation(); setExpandedDay(day.id); setRenamingDay(day.id); }}
                              >✎</button>
                            )}
                            <button
                              className="ft-workout-tab-del"
                              title="Delete day"
                              onMouseDown={e => { e.stopPropagation(); e.preventDefault(); removeDay(day.id); }}
                            >×</button>
                          </div>
                        );
                      })}
                      <button className="ft-workout-tab-add" onClick={() => addDay(`Day ${workouts.length + 1}`)} title="Add day">+</button>
                    </div>

                    {/* Resize handle */}
                    <div className="ft-resize-handle ft-resize-handle-inner" onMouseDown={onWorkoutSideDown} />

                    {/* İçerik */}
                    <div className="ft-workout-content">
                      {workouts.length === 0 && <div className="ft-empty">Add a day with +</div>}
                      {activeDay && (
                        <>
                          <div className="ft-workout-ex-add-row">
                            <input
                              className="ft-input"
                              style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
                              placeholder="Exercise name..."
                              value={newExName}
                              onChange={e => setNewExName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && newExName.trim()) { addExercise(activeDay.id, newExName); setNewExName(''); } }}
                            />
                            <button className="ft-btn-sm" style={{ padding: '5px 10px' }} onClick={() => { if (newExName.trim()) { addExercise(activeDay.id, newExName); setNewExName(''); } }}>+</button>
                          </div>

                          {activeDay.exercises.length === 0
                            ? <div className="ft-empty">Add an exercise or ask the AI</div>
                            : (
                              <table className="ft-workout-table">
                                <thead>
                                  <tr>
                                    <th>Exercise</th>
                                    <th>Set</th>
                                    <th>×</th>
                                    <th>Reps</th>
                                    <th></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {activeDay.exercises.map(ex => (
                                    <tr key={ex.id} className="ft-workout-tr">
                                      <td className="ft-workout-td-name">{ex.name}</td>
                                      <td>
                                        <input
                                          className="ft-input ft-workout-num-input"
                                          type="number" min="1" max="20"
                                          value={ex.sets}
                                          onChange={e => updateExercise(activeDay.id, ex.id, { sets: Math.max(1, Number(e.target.value) || 1) })}
                                        />
                                      </td>
                                      <td className="ft-workout-td-x">×</td>
                                      <td>
                                        {ex.isMax
                                          ? <span className="ft-workout-max-badge">MAX</span>
                                          : <input
                                              className="ft-input ft-workout-num-input"
                                              type="number" min="1" max="100"
                                              value={ex.reps}
                                              onChange={e => updateExercise(activeDay.id, ex.id, { reps: Math.max(1, Number(e.target.value) || 1) })}
                                            />
                                        }
                                      </td>
                                      <td className="ft-workout-td-actions">
                                        <button
                                          className={`ft-workout-max-btn${ex.isMax ? ' active' : ''}`}
                                          onClick={() => updateExercise(activeDay.id, ex.id, { isMax: !ex.isMax })}
                                        >max</button>
                                        <button className="ft-del-btn" onClick={() => removeExercise(activeDay.id, ex.id)}>×</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )
                          }
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {view !== 'charts' ? null : (
            <div className="ft-resizable-col" style={{ flex: 1, minWidth: 160, gap: 12 }}>

              {/* ── Kilo + ölçüm takibi (Overview'den taşındı) — tüm grafikler aynı anda, sekme yok.
                   Karne istatistikleri artık üstteki HERO şeridinde ("Karne" butonu) ── */}
              <div className="ft-card" style={{ flex: 1, minHeight: 0, boxSizing: 'border-box', overflow: 'auto' }}>
                <div className="ft-card-header">
                  <div className="ft-card-label">Weight Tracking</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {lastWeight && goal.targetWeight && (
                      <span className="ft-badge">
                        {(lastWeight - parseFloat(goal.targetWeight)).toFixed(1)} kg remaining
                        {weeklyRate != null && ` · ${weeklyRate > 0 ? '+' : ''}${weeklyRate} kg/week`}
                        {etaDays != null && (etaDays === 0 ? ' · at goal' : ` · ~${etaDays} days`)}
                      </span>
                    )}
                    <button
                      className="ft-btn-sm"
                      style={{ padding: '3px 10px', fontSize: 16, lineHeight: 1 }}
                      onClick={() => {
                        setShowWeightForm(v => {
                          const next = !v;
                          if (next) {
                            // Formu son girilen değerlerle önden doldur — kullanıcı
                            // sadece değişeni düzeltsin, hepsini yeniden yazmasın.
                            setAddDate(today());
                            setWeightInput(lastEntry?.value != null ? String(lastEntry.value) : '');
                            const w = lastEntry?.waist    ?? profile.waist;
                            const n = lastEntry?.neck     ?? profile.neck;
                            const s = lastEntry?.shoulder ?? profile.shoulder;
                            setWaistInput(w ? String(w) : '');
                            setNeckInput(n ? String(n) : '');
                            setShoulderInput(s ? String(s) : '');
                          }
                          return next;
                        });
                      }}
                    >{showWeightForm ? '−' : '+'}</button>
                  </div>
                </div>

                {/* Giriş formu — sadece showWeightForm açıkken */}
                {showWeightForm && (
                  <div className="ft-weight-input-row">
                    <label className="ft-label ft-weight-date-label">Date
                      <input type="date" className="ft-input ft-date-sm" value={addDate} onChange={e => setAddDate(e.target.value)} />
                    </label>
                    <label className="ft-label">Weight (kg)
                      <input className="ft-input" type="number" step="0.1" placeholder="kg"
                        value={weightInput} onChange={e => setWeightInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addWeight(); }} />
                    </label>
                    <label className="ft-label">Waist (cm)
                      <input className="ft-input" type="number" step="0.5" placeholder="cm"
                        value={waistInput} onChange={e => setWaistInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addWeight(); }} />
                    </label>
                    <label className="ft-label">Neck (cm)
                      <input className="ft-input" type="number" step="0.5" placeholder="cm"
                        value={neckInput} onChange={e => setNeckInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addWeight(); }} />
                    </label>
                    <label className="ft-label">Shoulder (cm)
                      <input className="ft-input" type="number" step="0.5" placeholder="cm"
                        value={shoulderInput} onChange={e => setShoulderInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addWeight(); }} />
                    </label>
                    <button className="ft-btn-accent" onClick={addWeight}>Save</button>
                  </div>
                )}

                {/* Grafikler: iki panel yan yana, her biri kendi sekmesinden
                    bağımsız olarak hangi metriği göstereceğini seçer. */}
                <div className="ft-chart-panels">
                  {[
                    { tab: chartTabA, setTab: setChartTabA },
                    { tab: chartTabB, setTab: setChartTabB },
                  ].map((slot, slotIdx) => (
                    <div className="ft-chart-panel" key={slotIdx}>
                      <div className="ft-chart-tabs">
                        {CHART_TABS.map(t => (
                          <button
                            key={t.key}
                            className={`ft-chart-tab${slot.tab === t.key ? ' active' : ''}`}
                            onClick={() => slot.setTab(t.key)}
                          >{t.label}</button>
                        ))}
                      </div>

                      <div className="ft-chart-tile ft-chart-tile-single">
                        {slot.tab === 'weight' && (
                          weightLog.length === 0
                            ? <div className="ft-empty">No records yet</div>
                            : <div className="ft-chart-wrap">
                                <WeightChart entries={weightLog.slice(-60)} targetWeight={goal.targetWeight} profile={profile} height={280} />
                              </div>
                        )}
                        {slot.tab === 'calories' && (
                          <div className="ft-chart-wrap">
                            <KaloriChart meals={meals} goalKcal={goalKcal} height={280} />
                          </div>
                        )}
                        {slot.tab === 'bodyfat' && (
                          bodyFatSeries.length === 0
                            ? <div className="ft-empty">Shows once height + waist + neck are entered</div>
                            : <div className="ft-chart-wrap"><MetricChart entries={bodyFatSeries.slice(-60)} color="#e8a838" unit="%" title="Body Fat" height={280} /></div>
                        )}
                        {slot.tab === 'ffmi' && (
                          ffmiSeries.length === 0
                            ? <div className="ft-empty">Shows once height + waist + neck are entered</div>
                            : <div className="ft-chart-wrap"><MetricChart entries={ffmiSeries.slice(-60)} color="#58a6ff" unit="" title="FFMI" height={280} /></div>
                        )}
                        {slot.tab === 'ratio' && (
                          ratioSeries.length === 0
                            ? <div className="ft-empty">Shows once shoulder + waist are entered</div>
                            : <div className="ft-chart-wrap"><MetricChart entries={ratioSeries.slice(-60)} color="#3fb950" unit="" title="Shoulder / Waist" height={280} /></div>
                        )}
                        {slot.tab === 'waist' && (
                          waistSeries.length === 0
                            ? <div className="ft-empty">Shows once waist measurement is entered</div>
                            : <div className="ft-chart-wrap"><MetricChart entries={waistSeries.slice(-60)} color="#bc8cff" unit=" cm" title="Waist" height={280} /></div>
                        )}
                        {slot.tab === 'neck' && (
                          neckSeries.length === 0
                            ? <div className="ft-empty">Shows once neck measurement is entered</div>
                            : <div className="ft-chart-wrap"><MetricChart entries={neckSeries.slice(-60)} color="#ff7b72" unit=" cm" title="Neck" height={280} /></div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sütun başlıkları */}
                {weightLog.length > 0 && (
                  <div className="ft-wlog-header">
                    <span>Date</span>
                    <span>Weight</span>
                    <span>Fat %</span>
                    <span>Waist</span>
                    <span>Neck</span>
                    <span>Shoulder</span>
                    <span>FFMI</span>
                    <span>S/W</span>
                    <span></span>
                  </div>
                )}

                <div className="ft-weight-list">
                  {[...weightLog].reverse().slice(0, 10).map((e, i) => (
                    editingIdx === i ? (
                      <div key={i} className="ft-list-row ft-list-editing">
                        <input type="date" className="ft-input ft-edit-input" value={editDate} onChange={ev => setEditDate(ev.target.value)} />
                        <input type="number" step="0.1" className="ft-input ft-edit-input" placeholder="kg" value={editVal}
                          onChange={ev => setEditVal(ev.target.value)}
                          onKeyDown={ev => { if (ev.key === 'Enter') saveEdit(e.date); if (ev.key === 'Escape') setEditingIdx(null); }} />
                        <input type="number" step="0.5" className="ft-input ft-edit-input" placeholder="waist" value={editWaist}
                          onChange={ev => setEditWaist(ev.target.value)} />
                        <input type="number" step="0.5" className="ft-input ft-edit-input" placeholder="neck" value={editNeck}
                          onChange={ev => setEditNeck(ev.target.value)} />
                        <input type="number" step="0.5" className="ft-input ft-edit-input" placeholder="shoulder" value={editShoulder}
                          onChange={ev => setEditShoulder(ev.target.value)} />
                        <button className="ft-btn-accent ft-edit-save" onClick={() => saveEdit(e.date)}>✓</button>
                        <button className="ft-del-btn" onClick={() => deleteEntry(e.date)}>×</button>
                        <button className="ft-btn-ghost ft-edit-cancel" onClick={() => setEditingIdx(null)}>Cancel</button>
                      </div>
                    ) : (() => {
                      const canBf = e.waist && e.neck && profile.height;
                      const bf = canBf ? calcBodyFat({ ...profile, weight: e.value, waist: e.waist, neck: e.neck }) : null;
                      const lean = bf != null ? calcLeanMass(e.value, bf) : null;
                      const rowFfmi = lean != null ? calcFFMI(lean, profile.height) : null;
                      const rowRatio = e.shoulder && e.waist ? calcShoulderWaistRatio(e.shoulder, e.waist) : null;
                      return (
                        <div key={i} className="ft-wlog-row" onClick={() => startEdit(i, e)}>
                          <span className="ft-wlog-date">{e.date}</span>
                          <span className="ft-wlog-kg">{e.value} kg</span>
                          <span className="ft-wlog-fat">{bf != null ? `%${bf}` : <span style={{ color: 'var(--text-muted)' }}>—</span>}</span>
                          <span className="ft-wlog-fat">{e.waist ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</span>
                          <span className="ft-wlog-fat">{e.neck ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</span>
                          <span className="ft-wlog-fat">{e.shoulder ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</span>
                          <span className="ft-wlog-fat">{rowFfmi ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</span>
                          <span className="ft-wlog-fat">{rowRatio ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</span>
                          <span className="ft-list-edit-hint">✎</span>
                        </div>
                      );
                    })()
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}

