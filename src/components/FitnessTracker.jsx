import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './FitnessTracker.css';
import { pushKeyToSupabase } from '../supabase';
import { playClickSound, playAddSound, playDeleteSound } from '../utils/sounds';

function today() { return new Date().toISOString().slice(0, 10); }

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
  { name: 'Tavuk göğsü (ızgara)', kcal: 165, p: 31,  c: 0,   f: 3.6, unit: 'g' },
  { name: 'Tavuk but (ızgara)',    kcal: 209, p: 26,  c: 0,   f: 11,  unit: 'g' },
  { name: 'Tavuk but (kemikli)',   kcal: 215, p: 25,  c: 0,   f: 12,  unit: 'g' },
  { name: 'Tavuk kanat',           kcal: 222, p: 22,  c: 0,   f: 14,  unit: 'g' },
  { name: 'Tavuk göğsü (haşlama)',kcal: 150, p: 28,  c: 0,   f: 3.2, unit: 'g' },
  { name: 'Tavuk but (kavurma)',   kcal: 245, p: 24,  c: 0,   f: 16,  unit: 'g' },
  { name: 'Tavuk ciğeri',          kcal: 167, p: 24,  c: 1,   f: 7,   unit: 'g' },
  { name: 'Hindi göğsü',           kcal: 135, p: 30,  c: 0,   f: 1,   unit: 'g' },
  { name: 'Hindi but (ızgara)',    kcal: 218, p: 27,  c: 0,   f: 12,  unit: 'g' },
  { name: 'Dana kıyma (%20 yağ)', kcal: 254, p: 17,  c: 0,   f: 20,  unit: 'g' },
  { name: 'Dana kıyma (%10 yağ)', kcal: 196, p: 21,  c: 0,   f: 12,  unit: 'g' },
  { name: 'Dana bonfile',          kcal: 271, p: 26,  c: 0,   f: 18,  unit: 'g' },
  { name: 'Dana antrikot',         kcal: 291, p: 24,  c: 0,   f: 21,  unit: 'g' },
  { name: 'Dana kavurma',          kcal: 280, p: 25,  c: 0,   f: 19,  unit: 'g' },
  { name: 'Dana but (haşlama)',    kcal: 185, p: 27,  c: 0,   f: 8,   unit: 'g' },
  { name: 'Dana ciğer',            kcal: 135, p: 21,  c: 4,   f: 4,   unit: 'g' },
  { name: 'Dana döş (kavurma)',    kcal: 320, p: 22,  c: 0,   f: 25,  unit: 'g' },
  { name: 'Kuzu pirzola',          kcal: 294, p: 25,  c: 0,   f: 21,  unit: 'g' },
  { name: 'Kuzu but (ızgara)',     kcal: 258, p: 26,  c: 0,   f: 17,  unit: 'g' },
  { name: 'Kuzu kavurma',          kcal: 310, p: 24,  c: 0,   f: 23,  unit: 'g' },
  { name: 'Kuzu ciğer',            kcal: 140, p: 20,  c: 3,   f: 5,   unit: 'g' },
  { name: 'Kuzu kıyma',            kcal: 268, p: 18,  c: 0,   f: 21,  unit: 'g' },
  { name: 'Sucuk',                 kcal: 450, p: 16,  c: 1,   f: 42,  unit: 'g' },
  { name: 'Salam',                 kcal: 300, p: 14,  c: 2,   f: 26,  unit: 'g' },
  { name: 'Pastırma',              kcal: 230, p: 32,  c: 1,   f: 11,  unit: 'g' },
  { name: 'Somon (ızgara)',        kcal: 208, p: 20,  c: 0,   f: 13,  unit: 'g' },
  { name: 'Ton balığı (konserve)', kcal: 116, p: 26,  c: 0,   f: 1,   unit: 'g' },
  { name: 'Hamsi',                 kcal: 131, p: 20,  c: 0,   f: 5,   unit: 'g' },
  { name: 'Çipura',                kcal: 128, p: 21,  c: 0,   f: 4,   unit: 'g' },
  { name: 'Levrek',                kcal: 124, p: 24,  c: 0,   f: 3,   unit: 'g' },
  { name: 'Karides',               kcal: 99,  p: 24,  c: 0,   f: 0.3, unit: 'g' },
  { name: 'Yumurta',               kcal: 78,  p: 6,   c: 0.6, f: 5,   unit: 'adet', perUnit: 60 },
  { name: 'Yumurta akı',           kcal: 17,  p: 4,   c: 0.2, f: 0,   unit: 'adet', perUnit: 30 },
  { name: 'Süt (%3.2)',            kcal: 61,  p: 3.2, c: 4.8, f: 3.2, unit: 'g' },
  { name: 'Yoğurt (%3)',           kcal: 59,  p: 3.5, c: 4.7, f: 3,   unit: 'g' },
  { name: 'Yoğurt (light)',        kcal: 35,  p: 5,   c: 3.8, f: 0.2, unit: 'g' },
  { name: 'Kefir',                 kcal: 52,  p: 3.4, c: 4.7, f: 1.5, unit: 'g' },
  { name: 'Beyaz peynir (%40)',    kcal: 264, p: 17,  c: 2,   f: 21,  unit: 'g' },
  { name: 'Kaşar peyniri',         kcal: 386, p: 25,  c: 1,   f: 31,  unit: 'g' },
  { name: 'Lor peyniri',           kcal: 98,  p: 11,  c: 3,   f: 4,   unit: 'g' },
  { name: 'Labne',                 kcal: 170, p: 10,  c: 4,   f: 13,  unit: 'g' },
  { name: 'Tereyağı',              kcal: 717, p: 0.9, c: 0.1, f: 81,  unit: 'g' },
  { name: 'Beyaz ekmek (dilim)',   kcal: 79,  p: 2.7, c: 15,  f: 1,   unit: 'adet', perUnit: 30 },
  { name: 'Tam buğday ekmek',      kcal: 69,  p: 3.6, c: 11,  f: 1.1, unit: 'adet', perUnit: 30 },
  { name: 'Pirinç (pişmiş)',       kcal: 130, p: 2.7, c: 28,  f: 0.3, unit: 'g' },
  { name: 'Makarna (pişmiş)',      kcal: 131, p: 5,   c: 25,  f: 1.1, unit: 'g' },
  { name: 'Yulaf ezmesi (kuru)',   kcal: 389, p: 17,  c: 66,  f: 7,   unit: 'g' },
  { name: 'Bulgur (pişmiş)',       kcal: 83,  p: 3,   c: 19,  f: 0.2, unit: 'g' },
  { name: 'Mercimek (pişmiş)',     kcal: 116, p: 9,   c: 20,  f: 0.4, unit: 'g' },
  { name: 'Nohut (pişmiş)',        kcal: 164, p: 9,   c: 27,  f: 2.6, unit: 'g' },
  { name: 'Fasulye (pişmiş)',      kcal: 127, p: 8.7, c: 23,  f: 0.5, unit: 'g' },
  { name: 'Patates (haşlanmış)',   kcal: 87,  p: 1.9, c: 20,  f: 0.1, unit: 'g' },
  { name: 'Patates kızartması',    kcal: 312, p: 3.4, c: 41,  f: 15,  unit: 'g' },
  { name: 'Mısır (haşlanmış)',     kcal: 96,  p: 3.4, c: 21,  f: 1.5, unit: 'g' },
  { name: 'Domates',               kcal: 18,  p: 0.9, c: 3.9, f: 0.2, unit: 'adet', perUnit: 120 },
  { name: 'Salatalık',             kcal: 15,  p: 0.7, c: 3.6, f: 0.1, unit: 'adet', perUnit: 200 },
  { name: 'Biber (yeşil)',         kcal: 20,  p: 0.9, c: 4.6, f: 0.2, unit: 'adet', perUnit: 100 },
  { name: 'Ispanak',               kcal: 23,  p: 2.9, c: 3.6, f: 0.4, unit: 'g' },
  { name: 'Brokoli',               kcal: 34,  p: 2.8, c: 7,   f: 0.4, unit: 'g' },
  { name: 'Havuç',                 kcal: 41,  p: 0.9, c: 10,  f: 0.2, unit: 'adet', perUnit: 80 },
  { name: 'Kabak',                 kcal: 17,  p: 1.2, c: 3.1, f: 0.3, unit: 'adet', perUnit: 200 },
  { name: 'Patlıcan',              kcal: 25,  p: 1,   c: 5.9, f: 0.2, unit: 'adet', perUnit: 300 },
  { name: 'Soğan',                 kcal: 40,  p: 1.1, c: 9.3, f: 0.1, unit: 'adet', perUnit: 100 },
  { name: 'Marul',                 kcal: 15,  p: 1.4, c: 2.9, f: 0.2, unit: 'g' },
  { name: 'Bezelye',               kcal: 81,  p: 5.4, c: 14,  f: 0.4, unit: 'g' },
  { name: 'Avokado',               kcal: 160, p: 2,   c: 9,   f: 15,  unit: 'adet', perUnit: 150 },
  { name: 'Elma',                  kcal: 52,  p: 0.3, c: 14,  f: 0.2, unit: 'adet', perUnit: 180 },
  { name: 'Muz',                   kcal: 89,  p: 1.1, c: 23,  f: 0.3, unit: 'adet', perUnit: 120 },
  { name: 'Portakal',              kcal: 47,  p: 0.9, c: 12,  f: 0.1, unit: 'adet', perUnit: 180 },
  { name: 'Üzüm',                  kcal: 69,  p: 0.7, c: 18,  f: 0.2, unit: 'g' },
  { name: 'Çilek',                 kcal: 32,  p: 0.7, c: 7.7, f: 0.3, unit: 'adet', perUnit: 12 },
  { name: 'Kivi',                  kcal: 61,  p: 1.1, c: 15,  f: 0.5, unit: 'adet', perUnit: 75 },
  { name: 'Karpuz',                kcal: 30,  p: 0.6, c: 7.6, f: 0.2, unit: 'g' },
  { name: 'Kavun',                 kcal: 34,  p: 0.8, c: 8.2, f: 0.2, unit: 'g' },
  { name: 'Badem',                 kcal: 579, p: 21,  c: 22,  f: 50,  unit: 'adet', perUnit: 1.2 },
  { name: 'Ceviz',                 kcal: 654, p: 15,  c: 14,  f: 65,  unit: 'adet', perUnit: 5 },
  { name: 'Antep fıstığı',         kcal: 562, p: 20,  c: 28,  f: 45,  unit: 'adet', perUnit: 0.7 },
  { name: 'Fıstık ezmesi',         kcal: 588, p: 25,  c: 20,  f: 50,  unit: 'g' },
  { name: 'Zeytinyağı',            kcal: 884, p: 0,   c: 0,   f: 100, unit: 'g' },
  { name: 'Zeytin (siyah)',        kcal: 115, p: 0.8, c: 6,   f: 11,  unit: 'adet', perUnit: 5 },
  { name: 'Ayran',                 kcal: 38,  p: 2,   c: 2.8, f: 2,   unit: 'g' },
  { name: 'Portakal suyu (taze)',  kcal: 45,  p: 0.7, c: 10,  f: 0.2, unit: 'g' },
  { name: 'Sütlü kahve (latte)',   kcal: 54,  p: 2.4, c: 6,   f: 2.5, unit: 'g' },
  { name: 'Kola',                  kcal: 42,  p: 0,   c: 10.6,f: 0,   unit: 'g' },
  { name: 'Pizza (dilim)',         kcal: 266, p: 11,  c: 33,  f: 10,  unit: 'adet', perUnit: 100 },
  { name: 'Hamburger',             kcal: 295, p: 17,  c: 24,  f: 14,  unit: 'adet', perUnit: 150 },
  { name: 'Döner (tavuk dürüm)',   kcal: 218, p: 14,  c: 22,  f: 8,   unit: 'adet', perUnit: 250 },
  { name: 'Kebap (şiş)',           kcal: 195, p: 20,  c: 0,   f: 12,  unit: 'g' },
  { name: 'Lahmacun',              kcal: 230, p: 11,  c: 30,  f: 8,   unit: 'adet', perUnit: 120 },
  { name: 'Gözleme (peynirli)',    kcal: 280, p: 10,  c: 35,  f: 12,  unit: 'adet', perUnit: 200 },
  { name: 'Börek (su böreği)',     kcal: 258, p: 8,   c: 30,  f: 12,  unit: 'g' },
  { name: 'Simit',                 kcal: 285, p: 9,   c: 55,  f: 4,   unit: 'adet', perUnit: 120 },
  { name: 'Poğaça (sade)',         kcal: 310, p: 7,   c: 42,  f: 13,  unit: 'adet', perUnit: 80 },
  { name: 'Çikolata (sütlü)',      kcal: 535, p: 8,   c: 59,  f: 30,  unit: 'g' },
  { name: 'Çikolata (bitter)',     kcal: 546, p: 5,   c: 60,  f: 31,  unit: 'g' },
  { name: 'Dondurma (vanilyalı)',  kcal: 207, p: 3.5, c: 24,  f: 11,  unit: 'g' },
  { name: 'Baklava (dilim)',       kcal: 337, p: 4,   c: 40,  f: 18,  unit: 'adet', perUnit: 80 },
  { name: 'Cips (patates)',        kcal: 536, p: 7,   c: 53,  f: 35,  unit: 'g' },
  { name: 'Kuru incir',            kcal: 249, p: 3.3, c: 64,  f: 0.9, unit: 'adet', perUnit: 20 },
  { name: 'Hurma',                 kcal: 277, p: 1.8, c: 75,  f: 0.2, unit: 'adet', perUnit: 24 },
  { name: 'Protein tozu (servis)', kcal: 120, p: 25,  c: 3,   f: 1.5, unit: 'adet', perUnit: 30 },
  { name: 'Yulaf ezmesi (pişmiş)', kcal: 71,  p: 2.5, c: 12,  f: 1.4, unit: 'g' },
  { name: 'Tatlı patates',         kcal: 86,  p: 1.6, c: 20,  f: 0.1, unit: 'g' },
  { name: 'Sarımsak',              kcal: 149, p: 6.4, c: 33,  f: 0.5, unit: 'adet', perUnit: 4 },
  { name: 'Havuç (küçük)',         kcal: 18,  p: 0.3, c: 4.1, f: 0.1, unit: 'adet', perUnit: 50 },
  { name: 'Hıyar (küçük)',         kcal: 15,  p: 0.7, c: 3.6, f: 0.1, unit: 'adet', perUnit: 100 },
  { name: 'Cherry domates',        kcal: 3,   p: 0.2, c: 0.5, f: 0,   unit: 'adet', perUnit: 17 },
  { name: 'Antrikot (çiğ)',        kcal: 208, p: 20,  c: 0,   f: 14,  unit: 'g' },
  { name: 'Muz (küçük)',           kcal: 71,  p: 0.9, c: 18,  f: 0.2, unit: 'adet', perUnit: 80 },
  { name: 'Uludağ Limonata Şekersiz', kcal: 4, p: 0,  c: 0.7, f: 0,  unit: 'g' },
  { name: 'Eti Form Limon Bisküvi (50g)', kcal: 223, p: 3.9, c: 35, f: 7, unit: 'adet', perUnit: 50 },

  // ── Meyveler ──
  { name: 'Erik',                  kcal: 20,  p: 0.5, c: 5,   f: 0.1, unit: 'adet', perUnit: 40 },
  { name: 'Armut',                 kcal: 57,  p: 0.4, c: 15,  f: 0.1, unit: 'adet', perUnit: 100 },
  { name: 'İncir (taze)',          kcal: 74,  p: 0.8, c: 19,  f: 0.3, unit: 'g' },
  { name: 'Şeftali',               kcal: 38,  p: 0.9, c: 9,   f: 0.3, unit: 'adet', perUnit: 80 },
  { name: 'Kayısı',                kcal: 7,   p: 0.2, c: 1.7, f: 0.1, unit: 'adet', perUnit: 12 },
  { name: 'Kiraz',                 kcal: 63,  p: 1.1, c: 16,  f: 0.2, unit: 'g' },
  { name: 'Vişne',                 kcal: 50,  p: 1.0, c: 12,  f: 0.3, unit: 'g' },
  { name: 'Nar',                   kcal: 83,  p: 1.7, c: 19,  f: 1.2, unit: 'g' },
  { name: 'Trabzon hurması',       kcal: 96,  p: 0.8, c: 25,  f: 0.3, unit: 'adet', perUnit: 168 },
  { name: 'Malta eriği',           kcal: 30,  p: 0.6, c: 7,   f: 0.2, unit: 'adet', perUnit: 70 },
  { name: 'Dut',                   kcal: 43,  p: 1.4, c: 9.8, f: 0.4, unit: 'g' },
  { name: 'Böğürtlen',             kcal: 43,  p: 1.4, c: 10,  f: 0.5, unit: 'g' },
  { name: 'Ahududu',               kcal: 52,  p: 1.2, c: 12,  f: 0.7, unit: 'g' },
  { name: 'Yaban mersini',         kcal: 57,  p: 0.7, c: 14,  f: 0.3, unit: 'g' },
  { name: 'Mandalina',             kcal: 47,  p: 0.7, c: 12,  f: 0.3, unit: 'adet', perUnit: 88 },
  { name: 'Greyfurt',              kcal: 42,  p: 0.8, c: 11,  f: 0.1, unit: 'g' },
  { name: 'Limon',                 kcal: 17,  p: 0.6, c: 5,   f: 0.3, unit: 'adet', perUnit: 58 },
  { name: 'Ananas',                kcal: 50,  p: 0.5, c: 13,  f: 0.1, unit: 'g' },
  { name: 'Mango',                 kcal: 60,  p: 0.8, c: 15,  f: 0.4, unit: 'g' },
  { name: 'Papaya',                kcal: 43,  p: 0.6, c: 11,  f: 0.3, unit: 'g' },
  { name: 'Hindistan cevizi',      kcal: 354, p: 3.3, c: 15,  f: 35,  unit: 'g' },
  { name: 'Kuru erik',             kcal: 240, p: 2.3, c: 63,  f: 0.4, unit: 'g' },
  { name: 'Kuru kayısı',           kcal: 241, p: 3.6, c: 62,  f: 0.5, unit: 'g' },

  // ── Kahvaltılık ──
  { name: 'Bal',                   kcal: 304, p: 0.3, c: 82,  f: 0,   unit: 'g' },
  { name: 'Reçel',                 kcal: 280, p: 0.4, c: 70,  f: 0,   unit: 'g' },
  { name: 'Tahin',                 kcal: 595, p: 17,  c: 21,  f: 53,  unit: 'g' },
  { name: 'Pekmez',                kcal: 265, p: 0.5, c: 66,  f: 0.1, unit: 'g' },
  { name: 'Kaymak',                kcal: 263, p: 4,   c: 5,   f: 26,  unit: 'g' },
  { name: 'Menemen (porsiyon)',    kcal: 326, p: 17,  c: 4,   f: 27,  unit: 'adet', perUnit: 250 },
  { name: 'Sucuklu yumurta',       kcal: 446, p: 26,  c: 2,   f: 36,  unit: 'adet', perUnit: 250 },

  // ── Çorbalar ──
  { name: 'Mercimek çorbası',      kcal: 94,  p: 3.5, c: 11,  f: 4,   unit: 'g' },
  { name: 'Tarhana çorbası',       kcal: 151, p: 2,   c: 11,  f: 8,   unit: 'g' },
  { name: 'Domates çorbası',       kcal: 62,  p: 1.5, c: 9,   f: 2,   unit: 'g' },
  { name: 'Yayla çorbası',         kcal: 68,  p: 3,   c: 7,   f: 3,   unit: 'g' },
  { name: 'Ezogelin çorbası',      kcal: 88,  p: 3.5, c: 12,  f: 3,   unit: 'g' },

  // ── Türk Yemekleri ──
  { name: 'İmam bayıldı (porsiyon)', kcal: 280, p: 3, c: 25,  f: 18,  unit: 'adet', perUnit: 200 },
  { name: 'Dolma (yaprak)',         kcal: 70,  p: 2.5, c: 8,   f: 3,   unit: 'adet', perUnit: 40 },
  { name: 'Sarma',                 kcal: 70,  p: 2.5, c: 8,   f: 3,   unit: 'adet', perUnit: 40 },
  { name: 'Köfte',                 kcal: 150, p: 12,  c: 3,   f: 9,   unit: 'adet', perUnit: 60 },
  { name: 'Kuru fasulye',          kcal: 127, p: 8.7, c: 23,  f: 0.5, unit: 'g' },
  { name: 'Pilav (pirinç)',        kcal: 130, p: 2.7, c: 28,  f: 0.3, unit: 'g' },
  { name: 'Su böreği (dilim)',     kcal: 200, p: 6,   c: 20,  f: 10,  unit: 'adet', perUnit: 80 },
  { name: 'Kol böreği',            kcal: 280, p: 5,   c: 22,  f: 18,  unit: 'adet', perUnit: 70 },
  { name: 'Ispanaklı börek',       kcal: 220, p: 6,   c: 24,  f: 11,  unit: 'g' },
  { name: 'Mücver (kabak)',        kcal: 180, p: 5,   c: 12,  f: 12,  unit: 'adet', perUnit: 80 },
  { name: 'Patates köftesi',       kcal: 145, p: 4,   c: 20,  f: 5,   unit: 'adet', perUnit: 70 },
  { name: 'Çiğ köfte (dürüm)',    kcal: 210, p: 4,   c: 38,  f: 4,   unit: 'adet', perUnit: 150 },
  { name: 'Mantı (porsiyon)',      kcal: 320, p: 14,  c: 40,  f: 10,  unit: 'g' },
  { name: 'Türlü (sebze yemeği)', kcal: 90,  p: 2,   c: 12,  f: 4,   unit: 'g' },

  // ── Fındık & Kuruyemiş ──
  { name: 'Fındık',               kcal: 628, p: 14,  c: 17,  f: 61,  unit: 'g' },
  { name: 'Kaju',                  kcal: 553, p: 18,  c: 30,  f: 44,  unit: 'g' },
  { name: 'Çam fıstığı',          kcal: 673, p: 14,  c: 13,  f: 68,  unit: 'g' },
  { name: 'Ay çekirdeği',         kcal: 584, p: 21,  c: 20,  f: 51,  unit: 'g' },
  { name: 'Kabak çekirdeği',      kcal: 559, p: 30,  c: 11,  f: 49,  unit: 'g' },
  { name: 'Leblebi',               kcal: 364, p: 20,  c: 61,  f: 5,   unit: 'g' },
  { name: 'Mısır (patlamış)',      kcal: 375, p: 12,  c: 74,  f: 4.5, unit: 'g' },

  // ── İçecekler ──
  { name: 'Türk kahvesi (sade)',   kcal: 2,   p: 0.2, c: 0,   f: 0,   unit: 'adet', perUnit: 60 },
  { name: 'Çay (şekersiz)',        kcal: 1,   p: 0,   c: 0.2, f: 0,   unit: 'adet', perUnit: 200 },
  { name: 'Salep',                 kcal: 102, p: 2.5, c: 20,  f: 1.5, unit: 'g' },
  { name: 'Boza',                  kcal: 80,  p: 3,   c: 17,  f: 0.5, unit: 'g' },
];

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

function WeightChart({ entries, targetWeight, profile }) {
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

  if (!entries || entries.length === 0) return null;

  const PAD = { top: 20, right: 12, bottom: 32, left: 44 };
  const H = 180;
  const iW = Math.max(1, cW - PAD.left - PAD.right);
  const iH = H - PAD.top - PAD.bottom;

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const vals = sorted.map(e => e.value);
  const target = targetWeight ? parseFloat(targetWeight) : null;
  const allVals = target ? [...vals, target] : vals;
  const minV = Math.min(...allVals) - 1;
  const maxV = Math.max(...allVals) + 1;

  const n = sorted.length;
  const px = i => PAD.left + (n === 1 ? iW / 2 : (i / (n - 1)) * iW);
  const py = v => PAD.top + iH - ((v - minV) / (maxV - minV)) * iH;

  const pts = sorted.map((e, i) => `${px(i)},${py(e.value)}`).join(' ');
  const area = n > 1 ? `${px(0)},${PAD.top + iH} ${pts} ${px(n - 1)},${PAD.top + iH}` : null;

  const gridLines = Array.from({ length: 4 }, (_, i) => {
    const v = minV + ((maxV - minV) * i) / 3;
    return { y: py(v), label: v.toFixed(1) };
  });

  const xLabelIdxs = new Set([0, n - 1]);
  for (let i = Math.max(1, Math.floor(n / 4)); i < n - 1; i += Math.max(1, Math.floor(n / 4))) xLabelIdxs.add(i);
  const xLabels = [...xLabelIdxs].map(i => ({ x: px(i), label: sorted[i].date.slice(5) }));

  const hovered = hoverIdx !== null ? sorted[hoverIdx] : null;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <svg
        width={cW} height={H}
        style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="wc-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5c7cfa" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#5c7cfa" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y grid + labels */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={g.y} x2={PAD.left + iW} y2={g.y}
              stroke="#30363d" strokeWidth="1" />
            <text x={PAD.left - 6} y={g.y + 4} textAnchor="end"
              fontSize="12" fill="#8b949e" fontFamily="monospace">{g.label}</text>
          </g>
        ))}

        {/* X labels */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - 6} textAnchor="middle"
            fontSize="12" fill="#8b949e">{l.label}</text>
        ))}

        {/* Hedef çizgisi */}
        {target && (
          <g>
            <line x1={PAD.left} y1={py(target)} x2={PAD.left + iW} y2={py(target)}
              stroke="#3fb950" strokeWidth="1.5" strokeDasharray="6 3" />
            <text x={PAD.left + 4} y={py(target) - 5}
              fontSize="11" fill="#3fb950">target {target}kg</text>
          </g>
        )}

        {/* Alan dolgusu */}
        {area && <polygon points={area} fill="url(#wc-grad)" />}

        {/* Çizgi */}
        {n > 1 && (
          <polyline points={pts} fill="none" stroke="#5c7cfa" strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* Hover dikey çizgi */}
        {hoverIdx !== null && (
          <line x1={px(hoverIdx)} y1={PAD.top} x2={px(hoverIdx)} y2={PAD.top + iH}
            stroke="#8b949e" strokeWidth="1" strokeDasharray="3 2" />
        )}

        {/* Noktalar */}
        {sorted.map((e, i) => {
          const t = n === 1 ? 1 : i / (n - 1);
          const isLast = i === n - 1;
          const isHov = hoverIdx === i;
          const r2 = Math.round(110 - 53 * t);   // 110→57
          const g2 = Math.round(58  + 150 * t);   // 58→208
          const b2 = Math.round(158 + 82  * t);   // 158→240
          const color = isLast ? '#e8e8e8' : `rgb(${r2},${g2},${b2})`;
          return (
            <circle key={i}
              cx={px(i)} cy={py(e.value)}
              r={isHov ? 7 : isLast ? 6 : 4}
              fill={color} stroke="#0d1117" strokeWidth="2"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoverIdx(i)}
            />
          );
        })}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div style={{
          position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
          background: '#1c2128', border: '1px solid #444c56', borderRadius: 8,
          padding: '6px 14px', fontSize: 13, color: '#e6edf3', pointerEvents: 'none',
          whiteSpace: 'nowrap', zIndex: 10, boxShadow: '0 4px 12px #0006',
        }}>
          <b style={{ color: '#e8e8e8' }}>{hovered.value} kg</b>
          <span style={{ color: '#8b949e', marginLeft: 8 }}>{hovered.date}</span>
          {hovered.waist && hovered.neck && profile?.height && (
            <span style={{ color: '#e8e8e8', marginLeft: 8 }}>
              %{calcBodyFat({ ...profile, weight: hovered.value, waist: hovered.waist, neck: hovered.neck }) ?? '?'} fat
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Kalori Grafiği ──
function KaloriChart({ meals, goalKcal }) {
  const containerRef = useRef(null);
  const [cW, setCW] = useState(220);
  const [hoverIdx, setHoverIdx] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setCW(e.contentRect.width));
    ro.observe(containerRef.current);
    setCW(containerRef.current.offsetWidth);
    return () => ro.disconnect();
  }, []);

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

  const PAD = { top: 20, right: 12, bottom: 32, left: 48 };
  const H = 180;
  const iW = Math.max(1, cW - PAD.left - PAD.right);
  const iH = H - PAD.top - PAD.bottom;
  const n = entries.length;
  const vals = entries.map(e => e.value);
  const minV = Math.max(0, Math.min(...vals) - 200);
  const maxV = Math.max(...vals) + 200;
  const px = i => PAD.left + (n === 1 ? iW / 2 : (i / (n - 1)) * iW);
  const py = v => PAD.top + iH - ((v - minV) / (maxV - minV)) * iH;

  const pts = entries.map((e, i) => `${px(i)},${py(e.value)}`).join(' ');
  const area = n > 1 ? `${px(0)},${PAD.top + iH} ${pts} ${px(n - 1)},${PAD.top + iH}` : null;
  const gridLines = Array.from({ length: 4 }, (_, i) => {
    const v = minV + ((maxV - minV) * i) / 3;
    return { y: py(v), label: Math.round(v) };
  });
  const xLabelIdxs = new Set([0, n - 1]);
  for (let i = Math.max(1, Math.floor(n / 4)); i < n - 1; i += Math.max(1, Math.floor(n / 4))) xLabelIdxs.add(i);
  const xLabels = [...xLabelIdxs].map(i => ({ x: px(i), label: entries[i].date.slice(5) }));
  const hovered = hoverIdx !== null ? entries[hoverIdx] : null;
  const goalY = goalKcal ? py(goalKcal) : null;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <svg width={cW} height={H} style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHoverIdx(null)}>
        <defs>
          <linearGradient id="kc-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3fb950" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3fb950" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={g.y} x2={PAD.left + iW} y2={g.y} stroke="#30363d" strokeWidth="1" />
            <text x={PAD.left - 6} y={g.y + 4} textAnchor="end" fontSize="11" fill="#8b949e" fontFamily="monospace">{g.label}</text>
          </g>
        ))}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - 6} textAnchor="middle" fontSize="11" fill="#8b949e">{l.label}</text>
        ))}
        {goalY !== null && (
          <g>
            <line x1={PAD.left} y1={goalY} x2={PAD.left + iW} y2={goalY}
              stroke="#5c7cfa" strokeWidth="1.5" strokeDasharray="6 3" />
            <text x={PAD.left + 4} y={goalY - 5} fontSize="10" fill="#5c7cfa">target {goalKcal} kcal</text>
          </g>
        )}
        {area && <polygon points={area} fill="url(#kc-grad)" />}
        {n > 1 && <polyline points={pts} fill="none" stroke="#3fb950" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />}
        {hoverIdx !== null && (
          <line x1={px(hoverIdx)} y1={PAD.top} x2={px(hoverIdx)} y2={PAD.top + iH}
            stroke="#8b949e" strokeWidth="1" strokeDasharray="3 2" />
        )}
        {entries.map((e, i) => {
          const overGoal = goalKcal && e.value > goalKcal;
          const color = overGoal ? '#f85149' : '#3fb950';
          return (
            <circle key={i} cx={px(i)} cy={py(e.value)} r={hoverIdx === i ? 7 : 4}
              fill={color} stroke="#0d1117" strokeWidth="2" style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoverIdx(i)} />
          );
        })}
      </svg>
      {hovered && (
        <div style={{
          position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
          background: '#1c2128', border: '1px solid #444c56', borderRadius: 8,
          padding: '6px 14px', fontSize: 13, color: '#e6edf3', pointerEvents: 'none',
          whiteSpace: 'nowrap', zIndex: 10, boxShadow: '0 4px 12px #0006',
        }}>
          <b style={{ color: goalKcal && hovered.value > goalKcal ? '#f85149' : '#3fb950' }}>{hovered.value} kcal</b>
          <span style={{ color: '#8b949e', marginLeft: 8 }}>{hovered.date}</span>
          {goalKcal && <span style={{ color: '#8b949e', marginLeft: 8 }}>
            {hovered.value > goalKcal ? `+${hovered.value - goalKcal}` : `-${goalKcal - hovered.value}`} from target
          </span>}
        </div>
      )}
    </div>
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

const EMPTY_PROFILE = { gender: 'male', age: '', weight: '', height: '', waist: '', neck: '', hip: '', activity: 'light' };
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
function useResize(initialPx, min, max, storageKey) {
  const stored = storageKey ? (() => { try { const v = localStorage.getItem(storageKey); return v ? Math.min(max, Math.max(min, Number(v))) : initialPx; } catch { return initialPx; } })() : initialPx;
  const [size, setSize] = useState(stored);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startSize = useRef(stored);

  const onMouseDown = (e) => {
    dragging.current = true;
    startX.current = e.clientX;
    startSize.current = size;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const next = Math.min(max, Math.max(min, startSize.current + (e.clientX - startX.current)));
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

export default function FitnessTracker() {
  const [profile, setProfile]               = useState(() => load('ft_profile', EMPTY_PROFILE));
  const [goal, setGoal]                     = useState(() => load('ft_goal', EMPTY_GOAL));
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingGoal, setEditingGoal]       = useState(false);
  const [draft, setDraft]                   = useState(profile);
  const [goalDraft, setGoalDraft]           = useState(goal);

  // Kilo takibi
  const [weightLog, setWeightLog]     = useState(() => load('ft_weight_log', []));
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [chartTab, setChartTab]       = useState('weight');
  const [weightInput, setWeightInput] = useState('');
  const [waistInput, setWaistInput]   = useState('');
  const [neckInput, setNeckInput]     = useState('');
  const [addDate, setAddDate]         = useState(today());
  const [editingIdx, setEditingIdx]   = useState(null);
  const [editDate, setEditDate]       = useState('');
  const [editVal, setEditVal]         = useState('');
  const [editWaist, setEditWaist]     = useState('');
  const [editNeck, setEditNeck]       = useState('');

  // Templates: date-independent, [ { id, name, items:[{...}] } ]
  const [menuTemplates, setMenuTemplates] = useState(() => load('ft_menu_templates', []));
  const [newTplName, setNewTplName]       = useState('');
  const [editingTplId, setEditingTplId]   = useState(null);
  const [editingTplName, setEditingTplName] = useState('');
  const [expandedTplId, setExpandedTplId] = useState(null);
  // Yiyecek paneli modu: 'template' | 'log'
  const [foodPanelMode, setFoodPanelMode] = useState('log');
  // Hangi şablon seçili (yiyecek panelinde eklenecek hedef)
  const [targetTplId, setTargetTplId]     = useState(null);

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

  // Antrenman: { [date]: [ { id, name, sets:[{id,reps,weight}] } ] }
  const [workouts, setWorkouts] = useState(() => load('ft_workouts', {}));
  const [workoutDate, setWorkoutDate] = useState(today());
  const [newExName, setNewExName] = useState('');

  // Arama
  const [searchQ, setSearchQ] = useState('');
  const [foodQty, setFoodQty] = useState({});   // { [food.name]: qty string }

  // Manuel kalori ekleme
  const [customFoodName, setCustomFoodName] = useState('');
  const [customFoodKcal, setCustomFoodKcal] = useState('');



  // Resize handles: panel dividers
  const [w0, onDown0] = useResize(500, 140, 500, 'ft_panel_w0_v5');
  const [w1, onDown1] = useResize(280, 160, 800, 'ft_panel_w1_v4');
  // Menü sidebar iç resize
  const [menuSideW, onMenuSideDown] = useResize(160, 70, 320, 'ft_panel_menu_side_v3');
  // Menü ↕ Antrenman dikey resize
  const [menuH, onMenuVDown] = useResizeV(460, 120, 900, 'ft_panel_menu_h_v3');

  // ── AI Fitness Assistant state ──
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const aiBottomRef = useRef(null);
  const aiInputRef = useRef(null);

  useEffect(() => { aiBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiMessages]);

  useEffect(() => { save('ft_menu_templates', menuTemplates); }, [menuTemplates]);
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
  useEffect(() => { save('ft_workouts', workouts); }, [workouts]);

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
      description: 'Read the user\'s fitness data: weight log, today\'s meals, profile, goal, and macro summary for any date.',
      input_schema: {
        type: 'object',
        properties: {
          include: {
            type: 'array',
            items: { type: 'string', enum: ['profile', 'goal', 'weight_log', 'meals', 'today_macros', 'food_database', 'workouts'] },
            description: 'Which data sections to return.',
          },
          meal_date: { type: 'string', description: 'Date for meals in YYYY-MM-DD format. Defaults to today.' },
        },
        required: ['include'],
      },
    },
    {
      name: 'add_weight_entry',
      description: 'Add a weight measurement to the log.',
      input_schema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
          weight_kg: { type: 'number', description: 'Weight in kilograms.' },
          waist_cm: { type: 'number', description: 'Waist circumference in cm (optional).' },
          neck_cm: { type: 'number', description: 'Neck circumference in cm (optional).' },
        },
        required: ['date', 'weight_kg'],
      },
    },
    {
      name: 'create_menu',
      description: 'Create a new meal/menu for a given date.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Menu name, e.g. "Breakfast", "Lunch".' },
          date: { type: 'string', description: 'Date in YYYY-MM-DD format. Defaults to today.' },
        },
        required: ['name'],
      },
    },
    {
      name: 'add_food_to_menu',
      description: 'Add a food item from the database to an existing menu. Use get_fitness_data with food_database to find available foods and get menu IDs.',
      input_schema: {
        type: 'object',
        properties: {
          menu_id: { type: 'number', description: 'The numeric ID of the menu to add food to.' },
          food_name: { type: 'string', description: 'Exact food name from the database.' },
          quantity: { type: 'number', description: 'Amount in grams or pieces depending on the food unit.' },
          date: { type: 'string', description: 'Date the menu belongs to, YYYY-MM-DD. Defaults to today.' },
        },
        required: ['menu_id', 'food_name', 'quantity'],
      },
    },
    {
      name: 'remove_food_from_menu',
      description: 'Remove a food item from a menu.',
      input_schema: {
        type: 'object',
        properties: {
          menu_id: { type: 'number', description: 'The numeric ID of the menu.' },
          item_id: { type: 'number', description: 'The numeric ID of the food item to remove.' },
          date: { type: 'string', description: 'Date the menu belongs to, YYYY-MM-DD. Defaults to today.' },
        },
        required: ['menu_id', 'item_id'],
      },
    },
    {
      name: 'remove_menu',
      description: 'Delete an entire menu/meal for a date.',
      input_schema: {
        type: 'object',
        properties: {
          menu_id: { type: 'number', description: 'The numeric ID of the menu to delete.' },
          date: { type: 'string', description: 'Date the menu belongs to, YYYY-MM-DD. Defaults to today.' },
        },
        required: ['menu_id'],
      },
    },
    {
      name: 'update_goal',
      description: 'Update the user\'s fitness goal (cut/bulk/maintain, target weight, dates).',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['cut', 'bulk', 'maintain'], description: 'Goal type.' },
          target_weight_kg: { type: 'number', description: 'Target weight in kg.' },
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD.' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD.' },
          daily_kcal: { type: 'number', description: 'Daily calorie target.' },
        },
        required: [],
      },
    },
    {
      name: 'get_workout_data',
      description: 'Read workout/exercise data for a given date.',
      input_schema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format. Defaults to today.' },
        },
        required: [],
      },
    },
    {
      name: 'add_exercise',
      description: 'Add a new exercise to the workout log for a date.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Exercise name, e.g. "Bench Press", "Squat", "Deadlift".' },
          date: { type: 'string', description: 'Date YYYY-MM-DD. Defaults to today.' },
          sets: {
            type: 'array',
            description: 'Optional sets to add immediately.',
            items: {
              type: 'object',
              properties: {
                reps: { type: 'number' },
                weight: { type: 'number', description: 'Weight in kg. 0 for bodyweight.' },
              },
              required: ['reps', 'weight'],
            },
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'add_set',
      description: 'Add a set to an existing exercise.',
      input_schema: {
        type: 'object',
        properties: {
          exercise_id: { type: 'number', description: 'The numeric ID of the exercise.' },
          reps: { type: 'number' },
          weight: { type: 'number', description: 'Weight in kg.' },
          date: { type: 'string', description: 'Date YYYY-MM-DD. Defaults to today.' },
        },
        required: ['exercise_id', 'reps', 'weight'],
      },
    },
    {
      name: 'remove_exercise',
      description: 'Remove an exercise from the workout log.',
      input_schema: {
        type: 'object',
        properties: {
          exercise_id: { type: 'number', description: 'The numeric ID of the exercise to remove.' },
          date: { type: 'string', description: 'Date YYYY-MM-DD. Defaults to today.' },
        },
        required: ['exercise_id'],
      },
    },
    {
      name: 'update_set',
      description: 'Update reps or weight of a specific set.',
      input_schema: {
        type: 'object',
        properties: {
          exercise_id: { type: 'number' },
          set_id: { type: 'number' },
          reps: { type: 'number' },
          weight: { type: 'number' },
          date: { type: 'string' },
        },
        required: ['exercise_id', 'set_id', 'reps', 'weight'],
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
          result.food_database = FOOD_DB.map(f => ({ name: f.name, kcal: f.kcal, p: f.p, c: f.c, f: f.f, unit: f.unit }));
        }
        if (inc.includes('workouts')) {
          const d = input.meal_date || today();
          const snap = JSON.parse(localStorage.getItem('ft_workouts') || '{}');
          result.workouts = { date: d, exercises: snap[d] || [] };
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
        const food = FOOD_DB.find(f => f.name.toLowerCase() === input.food_name.toLowerCase())
          || FOOD_DB.find(f => f.name.toLowerCase().includes(input.food_name.toLowerCase()));
        if (!food) return { success: false, message: `Food "${input.food_name}" not found in database.` };
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
        return { success: true, message: `Added ${qty}${food.unit} ${food.name} to menu (${item.kcal} kcal)` };
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
          ...(input.daily_kcal !== undefined && { dailyKcal: String(input.daily_kcal) }),
        }));
        return { success: true, message: 'Goal updated.' };
      }
      case 'get_workout_data': {
        const d = input.date || today();
        const snapshot = JSON.parse(localStorage.getItem('ft_workouts') || '{}');
        return { date: d, exercises: snapshot[d] || [] };
      }
      case 'add_exercise': {
        const d = input.date || today();
        const ex = { id: Date.now(), name: (input.name || 'Exercise').trim(), sets: [] };
        if (input.sets?.length) {
          ex.sets = input.sets.map((s, i) => ({ id: Date.now() + i + Math.random(), reps: Number(s.reps) || 0, weight: Number(s.weight) || 0 }));
        }
        setWorkouts(prev => ({ ...prev, [d]: [...(prev[d] || []), ex] }));
        if (d === workoutDate) setWorkoutDate(d);
        return { success: true, exercise_id: ex.id, message: `Added exercise "${ex.name}" with ${ex.sets.length} sets.` };
      }
      case 'add_set': {
        const d = input.date || today();
        addSet(d, input.exercise_id, input.reps, input.weight);
        return { success: true, message: `Added set: ${input.reps} reps @ ${input.weight}kg` };
      }
      case 'remove_exercise': {
        const d = input.date || today();
        removeExercise(d, input.exercise_id);
        return { success: true, message: 'Exercise removed.' };
      }
      case 'update_set': {
        const d = input.date || today();
        updateSet(d, input.exercise_id, input.set_id, input.reps, input.weight);
        return { success: true, message: `Set updated: ${input.reps} reps @ ${input.weight}kg` };
      }
      default:
        return { success: false, message: `Unknown tool: ${toolName}` };
    }
  };

  // ── AI sendAiMessage — bmr/tdee tanımlandıktan sonra ──
  const sendAiMessage = async (text) => {
    const userMsg = (typeof text === 'string' ? text : aiInput).trim();
    if (!userMsg || aiLoading) return;
    const key = localStorage.getItem('anthropic_api_key');
    if (!key) { setAiMessages(p => [...p, { role: 'assistant', content: 'API key required — Settings → AI.' }]); return; }

    const newMessages = [...aiMessages, { role: 'user', content: userMsg }];
    setAiMessages(newMessages);
    setAiInput('');
    setAiLoading(true);

    const system = `You are a fitness assistant with full access to the user's fitness app data. You can read their weight log, meals, macros, profile and goals — and you can make changes: add/remove foods, create menus, log weight, update goals.

User stats: gender=${profile.gender}, age=${profile.age || '?'}, weight=${profile.weight || '?'}kg, height=${profile.height || '?'}cm, activity=${profile.activity || '?'}, BMR=${bmr || '?'}kcal, TDEE=${tdee || '?'}kcal, goal=${goal.type || 'maintain'}${goal.targetWeight ? ` target ${goal.targetWeight}kg` : ''}, today=${today()}.

Rules:
- Use tools to read data before answering questions about meals or weight history.
- When the user asks to add/remove food or create a meal plan, use the tools to actually do it — don't just describe it.
- Answer ONLY what is asked. No extra advice, no bullet lists of tips unless asked.
- Keep answers under 3 sentences unless a list is truly necessary.
- No motivational filler, no disclaimers, no "consult a professional".
- Same language as the user.
- After taking actions, briefly confirm what was done.`;

    try {
      // Agentic loop — tool use destekli
      let loopMessages = newMessages.map(m => ({ role: m.role, content: m.content }));
      let finalText = '';
      let actionTaken = false;

      for (let i = 0; i < 8; i++) {
        const body = JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system,
          tools: AI_TOOLS,
          messages: loopMessages,
        });

        const result = await invoke('fetch_post', {
          url: 'https://api.anthropic.com/v1/messages',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body,
        });

        const data = JSON.parse(result);
        if (data.error) throw new Error(data.error.message);

        // stop_reason: 'end_turn' → son cevap
        if (data.stop_reason === 'end_turn') {
          const textBlock = data.content.find(b => b.type === 'text');
          finalText = textBlock?.text?.trim() || (actionTaken ? '✓ Done.' : '');
          break;
        }

        // stop_reason: 'tool_use' → tool'ları çalıştır
        if (data.stop_reason === 'tool_use') {
          // Assistant mesajını history'ye ekle
          loopMessages.push({ role: 'assistant', content: data.content });

          // Her tool_use bloğunu çalıştır
          const toolResults = [];
          for (const block of data.content) {
            if (block.type !== 'tool_use') continue;
            const toolResult = executeAiTool(block.name, block.input);
            if (block.name !== 'get_fitness_data') actionTaken = true;
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(toolResult),
            });
          }
          loopMessages.push({ role: 'user', content: toolResults });
          continue;
        }

        // Beklenmedik durum
        break;
      }

      setAiMessages(p => [...p, { role: 'assistant', content: finalText || '...' }]);
    } catch (e) {
      setAiMessages(p => [...p, { role: 'assistant', content: 'Error: ' + (e?.message || 'Unknown') }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => aiInputRef.current?.focus(), 50);
    }
  };

  const dayMenus = meals[mealDate] || [];

  // Arama sonuçları — boşken liste gösterme
  const searchResults = searchQ.trim()
    ? FOOD_DB.filter(f => f.name.toLowerCase().includes(searchQ.toLowerCase()))
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

  // ── Şablon CRUD ──
  function createTemplate() {
    playAddSound();
    const name = newTplName.trim() || 'Template';
    const tpl = { id: Date.now(), name, items: [] };
    setMenuTemplates(prev => [...prev, tpl]);
    setTargetTplId(tpl.id);
    setNewTplName('');
  }

  function removeTemplate(id) {
    playDeleteSound();
    setMenuTemplates(prev => prev.filter(t => t.id !== id));
    if (targetTplId === id) setTargetTplId(null);
  }

  function renameTemplate(id, name) {
    setMenuTemplates(prev => prev.map(t => t.id === id ? { ...t, name: name.trim() || t.name } : t));
    setEditingTplId(null);
  }

  function addFoodToTemplate(tplId, food, qty) {
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
    setMenuTemplates(prev => prev.map(t => t.id === tplId ? { ...t, items: [...t.items, item] } : t));
  }

  function removeFoodFromTemplate(tplId, itemId) {
    playDeleteSound();
    setMenuTemplates(prev => prev.map(t => t.id === tplId ? { ...t, items: t.items.filter(i => i.id !== itemId) } : t));
  }

  function updateTemplateItemQty(tplId, itemId, newQty) {
    const qty = parseFloat(newQty);
    if (!qty || qty <= 0) return;
    setMenuTemplates(prev => prev.map(t => {
      if (t.id !== tplId) return t;
      return { ...t, items: t.items.map(i => {
        if (i.id !== itemId) return i;
        const ratio = i.unit === 'adet' ? qty : qty / 100;
        return { ...i, qty, kcal: Math.round(i.baseKcal*ratio), p: Math.round(i.baseP*ratio*10)/10, c: Math.round(i.baseC*ratio*10)/10, f: Math.round(i.baseF*ratio*10)/10 };
      })};
    }));
  }

  // Şablonu günlük log'a uygula (deep copy, yeni id'lerle)
  function applyTemplateToDay(tpl) {
    playAddSound();
    const newMenu = {
      ...tpl,
      id: Date.now() + Math.random(),
      items: tpl.items.map(i => ({ ...i, id: Date.now() + Math.random() })),
      kcal: tpl.items.reduce((s, i) => s + i.kcal, 0),
      p: tpl.items.reduce((s, i) => s + i.p, 0),
      c: tpl.items.reduce((s, i) => s + i.c, 0),
      f: tpl.items.reduce((s, i) => s + i.f, 0),
    };
    updateMeals(prev => ({ ...prev, [mealDate]: [...(prev[mealDate] || []), newMenu] }));
    setSelectedMenuIds(prev => [...prev, newMenu.id]);
  }

  function addCustomKcal() {
    const kcal = Math.round(parseFloat(customFoodKcal));
    if (!customFoodName.trim() || !kcal || kcal <= 0) return;
    playAddSound();
    const item = { id: Date.now()+Math.random(), name: customFoodName.trim(), qty: kcal, unit: 'kcal', baseKcal: kcal, baseP: 0, baseC: 0, baseF: 0, kcal, p: 0, c: 0, f: 0 };
    if (foodPanelMode === 'template') {
      if (targetTplId) {
        setMenuTemplates(prev => prev.map(t => t.id === targetTplId ? { ...t, items: [...t.items, item] } : t));
      }
    } else {
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
  function addExercise(date, name) {
    playAddSound();
    const d = date || workoutDate;
    const ex = { id: Date.now(), name: name.trim() || 'Exercise', sets: [] };
    setWorkouts(prev => ({ ...prev, [d]: [...(prev[d] || []), ex] }));
    return ex.id;
  }

  function removeExercise(date, exId) {
    playDeleteSound();
    const d = date || workoutDate;
    setWorkouts(prev => ({ ...prev, [d]: (prev[d] || []).filter(e => e.id !== exId) }));
  }

  function addSet(date, exId, reps, weight) {
    playClickSound();
    const d = date || workoutDate;
    const setEntry = { id: Date.now() + Math.random(), reps: Number(reps) || 0, weight: Number(weight) || 0 };
    setWorkouts(prev => ({
      ...prev,
      [d]: (prev[d] || []).map(e => e.id === exId ? { ...e, sets: [...e.sets, setEntry] } : e),
    }));
  }

  function removeSet(date, exId, setId) {
    playDeleteSound();
    const d = date || workoutDate;
    setWorkouts(prev => ({
      ...prev,
      [d]: (prev[d] || []).map(e => e.id === exId ? { ...e, sets: e.sets.filter(s => s.id !== setId) } : e),
    }));
  }

  function updateSet(date, exId, setId, reps, weight) {
    const d = date || workoutDate;
    setWorkouts(prev => ({
      ...prev,
      [d]: (prev[d] || []).map(e => e.id === exId
        ? { ...e, sets: e.sets.map(s => s.id === setId ? { ...s, reps: Number(reps), weight: Number(weight) } : s) }
        : e),
    }));
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
    if (waistInput) entry.waist = parseFloat(waistInput);
    if (neckInput)  entry.neck  = parseFloat(neckInput);
    setWeightLog(prev => [...prev.filter(e => e.date !== addDate), entry].sort((a, b) => a.date.localeCompare(b.date)));
    setWeightInput('');
    setWaistInput('');
    setNeckInput('');
    setShowWeightForm(false);
    // Profilde de güncelle (yağ oranı hesabı için)
    const profileUpdate = { weight: v };
    if (entry.waist) profileUpdate.waist = entry.waist;
    if (entry.neck)  profileUpdate.neck  = entry.neck;
    setProfile(p => ({ ...p, ...profileUpdate }));
    setDraft(p => ({ ...p, ...profileUpdate }));
  }

  function startEdit(i, entry) {
    setEditingIdx(i);
    setEditDate(entry.date);
    setEditVal(String(entry.value));
    setEditWaist(entry.waist ? String(entry.waist) : '');
    setEditNeck(entry.neck  ? String(entry.neck)  : '');
  }

  function saveEdit(originalDate) {
    const v = parseFloat(editVal);
    if (!v || !editDate) { setEditingIdx(null); return; }
    const entry = { date: editDate, value: v };
    if (editWaist) entry.waist = parseFloat(editWaist);
    if (editNeck)  entry.neck  = parseFloat(editNeck);
    setWeightLog(prev => [...prev.filter(e => e.date !== originalDate), entry].sort((a, b) => a.date.localeCompare(b.date)));
    setEditingIdx(null);
  }

  function deleteEntry(date) { playDeleteSound(); setWeightLog(prev => prev.filter(e => e.date !== date)); setEditingIdx(null); }

  return (
    <div className="ft-root">
      <div className="ft-scroll">

        {/* ══ HERO ══ */}
        <div className="ft-hero">
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
          <div className="ft-hero-actions">
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

          {/* ── Sol Kolon: Kilo Takibi + AI ── */}
          <div className="ft-resizable-col" style={{ width: w0, gap: 8 }}>
            <div className="ft-card" style={{ flexShrink: 0, boxSizing: 'border-box', overflow: 'auto' }}>
              <div className="ft-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="ft-card-label">Weight Tracking</div>
                  <div className="ft-chart-tabs">
                    <button className={`ft-chart-tab${chartTab === 'weight' ? ' ft-chart-tab--active' : ''}`} onClick={() => setChartTab('weight')}>Weight</button>
                    <button className={`ft-chart-tab${chartTab === 'kcal' ? ' ft-chart-tab--active' : ''}`} onClick={() => setChartTab('kcal')}>Calories</button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {lastWeight && goal.targetWeight &&
                    <span className="ft-badge">{(lastWeight - parseFloat(goal.targetWeight)).toFixed(1)} kg remaining</span>}
                  {chartTab === 'weight' && <button
                    className="ft-btn-sm"
                    style={{ padding: '3px 10px', fontSize: 16, lineHeight: 1 }}
                    onClick={() => { setShowWeightForm(v => !v); setAddDate(today()); }}
                  >{showWeightForm ? '−' : '+'}</button>}
                </div>
              </div>

              {/* Giriş formu — sadece showWeightForm açıkken */}
              {showWeightForm && (
                <div className="ft-weight-input-row">
                  <input type="date" className="ft-input ft-date-sm" value={addDate} onChange={e => setAddDate(e.target.value)} />
                  <input className="ft-input" type="number" step="0.1" placeholder="Weight kg"
                    value={weightInput} onChange={e => setWeightInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addWeight(); }} />
                  <input className="ft-input" type="number" step="0.5" placeholder="Waist cm"
                    value={waistInput} onChange={e => setWaistInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addWeight(); }} />
                  <input className="ft-input" type="number" step="0.5" placeholder="Neck cm"
                    value={neckInput} onChange={e => setNeckInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addWeight(); }} />
                  <button className="ft-btn-accent" onClick={addWeight}>Save</button>
                </div>
              )}

              {chartTab === 'weight' && weightLog.length === 0 && <div className="ft-empty">No records yet</div>}

              {chartTab === 'weight' && weightLog.length >= 1 && (
                <div className="ft-chart-wrap">
                  <WeightChart
                    entries={weightLog.slice(-60)}
                    targetWeight={goal.targetWeight}
                    profile={profile}
                  />
                </div>
              )}

              {chartTab === 'kcal' && (
                <div className="ft-chart-wrap">
                  <KaloriChart meals={meals} goalKcal={goalKcal} />
                </div>
              )}

              {/* Sütun başlıkları */}
              {chartTab === 'weight' && weightLog.length > 0 && (
                <div className="ft-wlog-header">
                  <span>Date</span>
                  <span>Weight</span>
                  <span>Fat %</span>
                  <span></span>
                </div>
              )}

              <div className="ft-weight-list" style={{ display: chartTab === 'kcal' ? 'none' : undefined }}>
                {[...weightLog].reverse().slice(0, 10).map((e, i) => (
                  editingIdx === i ? (
                    <div key={i} className="ft-list-row ft-list-editing">
                      <input type="date" className="ft-input ft-edit-input" value={editDate} onChange={ev => setEditDate(ev.target.value)} />
                      <input type="number" step="0.1" className="ft-input ft-edit-input" placeholder="kg" value={editVal}
                        onChange={ev => setEditVal(ev.target.value)}
                        onKeyDown={ev => { if (ev.key === 'Enter') saveEdit(e.date); if (ev.key === 'Escape') setEditingIdx(null); }} />
                      <input type="number" step="0.5" className="ft-input ft-edit-input" placeholder="bel" value={editWaist}
                        onChange={ev => setEditWaist(ev.target.value)} />
                      <input type="number" step="0.5" className="ft-input ft-edit-input" placeholder="boyun" value={editNeck}
                        onChange={ev => setEditNeck(ev.target.value)} />
                      <button className="ft-btn-accent ft-edit-save" onClick={() => saveEdit(e.date)}>✓</button>
                      <button className="ft-del-btn" onClick={() => deleteEntry(e.date)}>×</button>
                      <button className="ft-btn-ghost ft-edit-cancel" onClick={() => setEditingIdx(null)}>Cancel</button>
                    </div>
                  ) : (
                    <div key={i} className="ft-wlog-row" onClick={() => startEdit(i, e)}>
                      <span className="ft-wlog-date">{e.date}</span>
                      <span className="ft-wlog-kg">{e.value} kg</span>
                      <span className="ft-wlog-fat">
                        {(() => {
                          if (!e.waist || !e.neck || !profile.height) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
                          const bf = calcBodyFat({ ...profile, weight: e.value, waist: e.waist, neck: e.neck });
                          return bf != null ? <span style={{ color: '#e8e8e8' }}>%{bf}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>;
                        })()}
                      </span>
                      <span className="ft-list-edit-hint">✎</span>
                    </div>
                  )
                ))}
              </div>
            </div>

            {/* ── AI Fitness Assistant ── */}
            <div className="ft-card ft-ai-box" style={{ flex: 1, minHeight: 0 }}>
              <div className="ft-card-header">
                <div className="ft-card-label">AI Fitness Assistant</div>
                {aiMessages.length > 0 && (
                  <button className="ft-btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => setAiMessages([])}>Clear</button>
                )}
              </div>

              <div className="ft-ai-messages">
                {aiMessages.length === 0 && (
                  <div className="ft-ai-suggestions">
                    {[
                      'How many calories did I eat today?',
                      'Analyze my today\'s workout',
                      'Analyze my weight chart',
                      'Add a push day workout',
                    ].map((q, i) => (
                      <button key={i} className="ft-ai-suggestion-btn" onClick={() => sendAiMessage(q)}>{q}</button>
                    ))}
                  </div>
                )}
                {aiMessages.map((m, i) => (
                  <div key={i} className={`ft-ai-msg ft-ai-msg--${m.role}`}>
                    <span className="ft-ai-msg-label">{m.role === 'user' ? 'You' : 'AI'}</span>
                    <span className="ft-ai-msg-text" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
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

              <div className="ft-ai-input-row">
                <input
                  ref={aiInputRef}
                  className="ft-input"
                  style={{ flex: 1, fontSize: 13 }}
                  placeholder="Ask about fitness, diet, bodybuilding..."
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); } }}
                  disabled={aiLoading}
                />
                <button className="ft-btn-accent" onClick={() => sendAiMessage()} disabled={aiLoading || !aiInput.trim()}>
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Handle 1: kilo | menü */}
          <div className="ft-resize-handle" onMouseDown={onDown0} />

          {/* ── Menü + Antrenman ── */}
          <div className="ft-resizable-col" style={{ flex: 1, minWidth: 160, gap: 0 }}>
            <div className="ft-card ft-log-card" style={{ height: menuH, flexShrink: 0, overflow: 'hidden' }}>
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

                  {/* ── Şablon Menüler ── */}
                  <div className="ft-sidebar-section-label">Templates</div>
                  <div className="ft-new-menu-row">
                    <input
                      className="ft-input"
                      style={{ fontSize: 12, padding: '5px 8px' }}
                      placeholder="Template name..."
                      value={newTplName}
                      onChange={e => setNewTplName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') createTemplate(); }}
                    />
                    <button className="ft-btn-sm" style={{ padding: '5px 8px', fontSize: 13 }} onClick={createTemplate}>+</button>
                  </div>
                  {menuTemplates.length === 0 && (
                    <div className="ft-empty" style={{ fontSize: 11, padding: '4px 4px 8px' }}>Create a template</div>
                  )}
                  {menuTemplates.map(tpl => {
                    const isTarget = targetTplId === tpl.id;
                    const isExpanded = expandedTplId === tpl.id;
                    const tplKcal = tpl.items.reduce((s, i) => s + i.kcal, 0);
                    return (
                      <div key={tpl.id}>
                        {/* Şablon başlık satırı */}
                        <div className={`ft-menu-item${isTarget ? ' ft-menu-selected' : ''}`}
                          onClick={() => {
                            setTargetTplId(tpl.id);
                            setFoodPanelMode('template');
                            setExpandedTplId(isExpanded ? null : tpl.id);
                          }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>{isExpanded ? '▾' : '▸'}</div>
                          <div className="ft-menu-info">
                            {editingTplId === tpl.id ? (
                              <input className="ft-input" style={{ fontSize:12, padding:'2px 6px', width:'100%' }} autoFocus
                                value={editingTplName}
                                onChange={e => setEditingTplName(e.target.value)}
                                onBlur={() => renameTemplate(tpl.id, editingTplName)}
                                onKeyDown={e => { if (e.key === 'Enter') renameTemplate(tpl.id, editingTplName); if (e.key === 'Escape') setEditingTplId(null); }}
                                onClick={e => e.stopPropagation()}
                              />
                            ) : (
                              <span className="ft-menu-name">{tpl.name}</span>
                            )}
                            <span className="ft-menu-kcal">{tplKcal} kcal</span>
                          </div>
                          <button className="ft-del-btn" title="Rename" style={{ fontSize: 12 }}
                            onClick={e => { e.stopPropagation(); setEditingTplId(tpl.id); setEditingTplName(tpl.name); }}>✎</button>
                          <button className="ft-del-btn" title="Apply today" style={{ fontSize: 13 }}
                            onClick={e => { e.stopPropagation(); applyTemplateToDay(tpl); }}>▶</button>
                          <button className="ft-del-btn"
                            onClick={e => { e.stopPropagation(); removeTemplate(tpl.id); }}>×</button>
                        </div>

                        {/* Expand: yiyecek listesi */}
                        {isExpanded && (
                          <div style={{ paddingLeft: 8, paddingBottom: 4 }}>
                            {tpl.items.length === 0
                              ? <div className="ft-empty" style={{ fontSize: 11 }}>No food yet</div>
                              : tpl.items.map(item => (
                                <div key={item.id} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 0', borderBottom:'1px solid #21262d44', fontSize:12 }}>
                                  <span style={{ flex:1, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</span>
                                  <input
                                    className="ft-input"
                                    type="number" min="0.5"
                                    step={item.unit === 'adet' ? 1 : 10}
                                    value={item.qty}
                                    style={{ width:52, textAlign:'center', padding:'2px 4px', fontSize:11 }}
                                    onChange={e => updateTemplateItemQty(tpl.id, item.id, e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                  />
                                  <span style={{ color:'#6e7681', fontSize:11 }}>{item.unit}</span>
                                  <button className="ft-del-btn" style={{ fontSize:12 }}
                                    onClick={e => { e.stopPropagation(); removeFoodFromTemplate(tpl.id, item.id); }}>×</button>
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
                      <div key={menu.id} className="ft-menu-section">
                        {/* Menü başlığı */}
                        <div className="ft-menu-section-header">
                          <span className="ft-menu-section-name">{menu.name}</span>
                          <span className="ft-menu-section-kcal">{menuKcal} kcal</span>
                          <button className="ft-del-btn" title="Delete menu" style={{ marginLeft: 4 }} onClick={() => removeMenu(menu.id)}>×</button>
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
                                title="Ctrl+C ile kopyala"
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
                                <span style={{ color: '#e8e8e8', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{item.kcal} kcal</span>
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

            {/* Dikey resize handle: menü ↕ antrenman */}
            <div className="ft-resize-handle-v" onMouseDown={onMenuVDown} />

            {/* ── Antrenman ── */}
            {(() => {
              const dayExs = workouts[workoutDate] || [];
              return (
                <div className="ft-card ft-workout-card">
                  <div className="ft-card-header">
                    <div className="ft-card-label">Workout</div>
                    <input type="date" className="ft-input ft-date-sm" style={{ width: 130 }} value={workoutDate} onChange={e => setWorkoutDate(e.target.value)} />
                  </div>

                  {/* Egzersiz ekle */}
                  <div className="ft-workout-add-row">
                    <input
                      className="ft-input"
                      style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
                      placeholder="Exercise name..."
                      value={newExName}
                      onChange={e => setNewExName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newExName.trim()) { addExercise(workoutDate, newExName); setNewExName(''); } }}
                    />
                    <button className="ft-btn-sm" style={{ padding: '5px 10px' }} onClick={() => { if (newExName.trim()) { addExercise(workoutDate, newExName); setNewExName(''); } }}>+</button>
                  </div>

                  {dayExs.length === 0 && <div className="ft-empty">Add exercise or ask AI</div>}

                  <div className="ft-workout-list">
                    {dayExs.map(ex => (
                      <div key={ex.id} className="ft-workout-ex">
                        <div className="ft-workout-ex-header">
                          <span className="ft-workout-ex-name">{ex.name}</span>
                          <span className="ft-workout-ex-vol">
                            {ex.sets.length > 0 && `${ex.sets.length} set · ${Math.max(...ex.sets.map(s => s.weight))}kg`}
                          </span>
                          <button className="ft-del-btn" onClick={() => removeExercise(workoutDate, ex.id)}>×</button>
                        </div>
                        <div className="ft-workout-sets">
                          {ex.sets.map((s, si) => (
                            <div key={s.id} className="ft-workout-set-row">
                              <span className="ft-workout-set-num">{si + 1}</span>
                              <input
                                className="ft-input ft-qty-input"
                                type="number" min="1" placeholder="reps"
                                value={s.reps}
                                onChange={e => updateSet(workoutDate, ex.id, s.id, e.target.value, s.weight)}
                              />
                              <span className="ft-workout-set-sep">×</span>
                              <input
                                className="ft-input ft-qty-input"
                                type="number" min="0" step="2.5" placeholder="kg"
                                value={s.weight}
                                onChange={e => updateSet(workoutDate, ex.id, s.id, s.reps, e.target.value)}
                              />
                              <span className="ft-workout-set-unit">kg</span>
                              <button className="ft-del-btn" onClick={() => removeSet(workoutDate, ex.id, s.id)}>×</button>
                            </div>
                          ))}
                          <button
                            className="ft-btn-ghost ft-workout-add-set"
                            onClick={() => {
                              const last = ex.sets[ex.sets.length - 1];
                              addSet(workoutDate, ex.id, last?.reps || 10, last?.weight || 0);
                            }}
                          >+ Add set</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Handle 2: menü | arama */}
          <div className="ft-resize-handle" onMouseDown={onDown1} />

          {/* ── Yiyecek Paneli ── */}
          <div className="ft-resizable-col" style={{ width: w1, minWidth: 160, flexShrink: 0 }}>
            <div className="ft-card ft-search-card" style={{ height: '100%', boxSizing: 'border-box', display:'flex', flexDirection:'column', paddingTop: 8 }}>

              {/* Mod toggle */}
              <div className="ft-food-panel-header">
                <button
                  className={`ft-food-mode-btn${foodPanelMode === 'log' ? ' ft-food-mode-active' : ''}`}
                  onClick={() => setFoodPanelMode('log')}
                >Daily Log</button>
                <button
                  className={`ft-food-mode-btn${foodPanelMode === 'template' ? ' ft-food-mode-active' : ''}`}
                  onClick={() => setFoodPanelMode('template')}
                >Add to Template</button>
              </div>

              {/* Şablon modu: hedef şablon seçici + içerik */}
              {foodPanelMode === 'template' && (() => {
                const tpl = menuTemplates.find(t => t.id === targetTplId);
                const tplKcal = tpl ? tpl.items.reduce((s,i) => s+i.kcal, 0) : 0;
                return (
                  <div style={{ padding:'0 8px 6px' }}>
                    <div className="ft-menu-section-header" style={{ marginBottom: 0 }}>
                      <select style={{ background:'transparent', border:'none', color:'var(--text-primary)', fontSize:13, fontWeight:700, fontFamily:'inherit', cursor:'pointer', flex:1, outline:'none', minWidth:0 }}
                        value={targetTplId ?? ''}
                        onChange={e => setTargetTplId(Number(e.target.value) || null)}>
                        <option value="">-- Select template --</option>
                        {menuTemplates.map(t => <option key={t.id} value={t.id} style={{ background:'#161b22' }}>{t.name}</option>)}
                      </select>
                      <span className="ft-menu-section-kcal">{tplKcal} kcal</span>
                    </div>
                    {tpl && (tpl.items.length === 0
                      ? <div className="ft-empty" style={{ fontSize:11 }}>No food yet — add from below</div>
                      : <div className="ft-menu-dropzone" style={{ padding:0 }}>
                          {tpl.items.map(item => (
                            <div key={item.id} className="ft-menu-food-row">
                              <span className="ft-list-name">{item.name}</span>
                              <input className="ft-input ft-qty-input" type="number" min="0.5"
                                step={item.unit === 'adet' ? 1 : 10}
                                value={item.qty}
                                onChange={e => updateTemplateItemQty(targetTplId, item.id, e.target.value)}
                              />
                              <span className="ft-list-sub">{item.unit}</span>
                              <span style={{ color:'#e8e8e8', fontWeight:700, fontSize:13, whiteSpace:'nowrap' }}>{item.kcal} kcal</span>
                              <button className="ft-del-btn" onClick={() => removeFoodFromTemplate(targetTplId, item.id)}>×</button>
                            </div>
                          ))}
                        </div>
                    )}
                  </div>
                );
              })()}

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
                    <div>{foodPanelMode === 'template' ? 'Search to add to template' : 'Search to add to daily log'}</div>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="ft-food-empty-hint">
                    <div style={{ fontSize:28, opacity:0.2 }}>🤷</div>
                    <div>Not found</div>
                  </div>
                ) : searchResults.map((food, i) => {
                  const isAdet = food.unit === 'adet';
                  const defaultQty = isAdet ? 1 : 100;
                  const qty = parseFloat(foodQty[food.name]) || defaultQty;
                  const ratio = isAdet ? qty : qty / 100;
                  return (
                    <div key={i} className="ft-food-item">
                      <div className="ft-food-info">
                        <span className="ft-food-name">{food.name}</span>
                        <span className="ft-food-kcal">{Math.round(food.kcal * ratio)} kcal</span>
                      </div>
                      <div className="ft-food-macros">
                        <span style={{ color:'#f85149' }}>P {Math.round(food.p * ratio * 10)/10}g</span>
                        <span style={{ color:'#e8e8e8' }}>C {Math.round(food.c * ratio * 10)/10}g</span>
                        <span style={{ color:'#3fb950' }}>F {Math.round(food.f * ratio * 10)/10}g</span>
                      </div>
                      <div className="ft-food-actions">
                        <input
                          className="ft-input ft-qty-input"
                          type="number" min="0.5"
                          step={isAdet ? 1 : 10}
                          value={foodQty[food.name] ?? defaultQty}
                          onChange={e => setFoodQty(prev => ({ ...prev, [food.name]: e.target.value }))}
                        />
                        <span className="ft-food-unit">{isAdet ? 'pcs' : 'g'}</span>
                        <button className="ft-btn-sm" onClick={() => {
                          if (foodPanelMode === 'template') {
                            if (!targetTplId) {
                              // Şablon yoksa ilk önce oluştur
                              const tpl = { id: Date.now(), name: 'Template', items: [] };
                              setMenuTemplates(prev => [...prev, tpl]);
                              setTargetTplId(tpl.id);
                              addFoodToTemplate(tpl.id, food, qty);
                            } else {
                              addFoodToTemplate(targetTplId, food, qty);
                            }
                          } else {
                            // Günlük log'a ekle
                            const existingId = selectedMenuIds[selectedMenuIds.length - 1] ?? dayMenus[0]?.id ?? null;
                            if (existingId) {
                              setSelectedMenuIds(prev => prev.includes(existingId) ? prev : [...prev, existingId]);
                              addFoodToMenu(existingId, food, qty);
                            } else {
                              const ratio2 = food.unit === 'adet' ? qty : qty / 100;
                              const item = { id: Date.now()+Math.random(), name:food.name, qty, unit:food.unit||'g', baseKcal:food.kcal, baseP:food.p, baseC:food.c, baseF:food.f, kcal:Math.round(food.kcal*ratio2), p:Math.round(food.p*ratio2*10)/10, c:Math.round(food.c*ratio2*10)/10, f:Math.round(food.f*ratio2*10)/10 };
                              const newMenu = { id: Date.now(), name: 'Meal', items: [item], kcal: item.kcal, p: item.p, c: item.c, f: item.f };
                              updateMeals(prev => ({ ...prev, [mealDate]: [...(prev[mealDate]||[]), newMenu] }));
                              setSelectedMenuIds([newMenu.id]);
                            }
                          }
                        }}>+</button>
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
