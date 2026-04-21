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

// unit: 'g' → gram bazlı (kcal/makro per 100g)
// unit: 'adet', perUnit: N → 1 adet = N gram eşdeğeri (kcal/makro per adet)
const FOOD_DB = [
  { name: 'Tavuk göğsü (ızgara)', kcal: 165, p: 31,  c: 0,   f: 3.6, unit: 'g' },
  { name: 'Tavuk but (ızgara)',    kcal: 209, p: 26,  c: 0,   f: 11,  unit: 'g' },
  { name: 'Dana kıyma (%20 yağ)', kcal: 254, p: 17,  c: 0,   f: 20,  unit: 'g' },
  { name: 'Dana bonfile',          kcal: 271, p: 26,  c: 0,   f: 18,  unit: 'g' },
  { name: 'Dana antrikot',         kcal: 291, p: 24,  c: 0,   f: 21,  unit: 'g' },
  { name: 'Kuzu pirzola',          kcal: 294, p: 25,  c: 0,   f: 21,  unit: 'g' },
  { name: 'Hindi göğsü',           kcal: 135, p: 30,  c: 0,   f: 1,   unit: 'g' },
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

const EMPTY_PROFILE = { gender: 'male', age: '', weight: '', height: '', waist: '', neck: '', hip: '', activity: 'light' };
const EMPTY_GOAL    = { type: 'maintain', targetWeight: '', days: '' }; // type: cut | maintain | bulk

// Resize handle hook
function useResize(initialPx, min, max) {
  const [size, setSize] = useState(initialPx);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startSize = useRef(initialPx);

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
      const delta = e.clientX - startX.current;
      setSize(Math.min(max, Math.max(min, startSize.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [min, max]);

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
  const [weightLog, setWeightLog]   = useState(() => load('ft_weight_log', []));
  const [weightInput, setWeightInput] = useState('');
  const [addDate, setAddDate]         = useState(today());
  const [editingIdx, setEditingIdx]   = useState(null);
  const [editDate, setEditDate]       = useState('');
  const [editVal, setEditVal]         = useState('');

  // Menü log: { [date]: [ { id, name: 'Tabak adı', items: [...], kcal, p, c, f } ] }
  const [meals, setMeals]       = useState(() => load('ft_meals', {}));
  const [mealDate, setMealDate] = useState(today());
  const [selectedMenuIds, setSelectedMenuIds] = useState([]);

  // Tabak
  const [plate, setPlate]       = useState([]);
  const [plateOver, setPlateOver] = useState(false);
  const [plateName, setPlateName] = useState('');

  // Arama
  const [searchQ, setSearchQ]   = useState('');
  const [dragQty, setDragQty]   = useState({});

  // Resize handles: panel dividers
  const [w0, onDown0] = useResize(220, 140, 400); // kilo genişliği
  const [w1, onDown1] = useResize(280, 160, 600); // öğün genişliği
  const [w2, onDown2] = useResize(280, 160, 600); // tabak genişliği
  // arama: kalan tüm alan (flex:1)
  // Menü sidebar iç resize
  const [menuSideW, onMenuSideDown] = useResize(110, 60, 220);

  useEffect(() => { save('ft_weight_log', weightLog); }, [weightLog]);
  useEffect(() => { save('ft_meals', meals); }, [meals]);

  const bmr      = calcBMR(profile);
  const tdee     = calcTDEE(profile);
  const bmi      = calcBMI(profile.weight, profile.height);
  const bmiData  = bmiInfo(bmi);
  const bodyFat  = calcBodyFat(profile);
  const lastWeight = weightLog.length > 0 ? weightLog[weightLog.length - 1].value : (profile.weight || null);
  const hasProfile = profile.weight && profile.height && profile.age;

  // Günlük kalori hedefi — hedef + süreye göre hesapla
  function calcGoalKcal() {
    if (!tdee) return null;
    if (goal.type === 'maintain') return tdee;
    if (goal.type === 'bulk') {
      // Bulk: günlük +300 sabit (süre varsa daha agresif olmaz, bulk yavaş olmalı)
      return tdee + 300;
    }
    // cut: hedef kilo & süre varsa dinamik hesapla
    if (goal.type === 'cut') {
      const curW  = parseFloat(lastWeight || profile.weight);
      const tgtW  = parseFloat(goal.targetWeight);
      const days  = parseInt(goal.days);
      if (curW && tgtW && days > 0 && curW > tgtW) {
        const kgToLose    = curW - tgtW;
        const kcalToLose  = kgToLose * 7700; // ~7700 kcal per kg fat
        const dailyDeficit = Math.round(kcalToLose / days);
        // Güvenli aralık: max -1000 kcal/gün (daha fazlası sağlıksız)
        const safeDeficit = Math.min(dailyDeficit, 1000);
        return Math.max(1200, tdee - safeDeficit);
      }
      return tdee - 500; // fallback
    }
    return tdee;
  }
  const goalKcal = calcGoalKcal();

  // Süreye göre tahmini bilgiler
  const goalInfo = (() => {
    if (!tdee || goal.type !== 'cut') return null;
    const curW = parseFloat(lastWeight || profile.weight);
    const tgtW = parseFloat(goal.targetWeight);
    const days = parseInt(goal.days);
    if (!curW || !tgtW || !days || curW <= tgtW) return null;
    const kgToLose   = curW - tgtW;
    const deficit    = tdee - goalKcal;
    const actualDays = Math.round((kgToLose * 7700) / deficit);
    const weeklyLoss = Math.round((deficit * 7) / 7700 * 10) / 10;
    return { deficit, weeklyLoss, actualDays };
  })();

  const proteinTarget = profile.weight ? Math.round(profile.weight * 2) : null;

  const dayMenus = meals[mealDate] || [];

  // Tabak toplamları
  const plateKcal    = plate.reduce((s, i) => s + i.kcal, 0);
  const plateProtein = plate.reduce((s, i) => s + i.p, 0);
  const plateCarb    = plate.reduce((s, i) => s + i.c, 0);
  const plateFat     = plate.reduce((s, i) => s + i.f, 0);

  // Arama sonuçları — boşken liste gösterme
  const searchResults = searchQ.trim()
    ? FOOD_DB.filter(f => f.name.toLowerCase().includes(searchQ.toLowerCase()))
    : [];

  // Drag & Drop
  function onDragStart(e, food) {
    const defaultQty = food.unit === 'adet' ? 1 : 100;
    const qty = parseFloat(dragQty[food.name]) || defaultQty;
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
    // adet ise: ratio = qty (adet sayısı), kcal/makro direkt per-adet
    // gram ise: ratio = qty/100
    const ratio = food.unit === 'adet' ? qty : qty / 100;
    setPlate(prev => [...prev, {
      id: Date.now() + Math.random(),
      name: food.name,
      qty,
      unit: food.unit || 'g',
      kcal: Math.round(food.kcal * ratio),
      p:    Math.round(food.p * ratio * 10) / 10,
      c:    Math.round(food.c * ratio * 10) / 10,
      f:    Math.round(food.f * ratio * 10) / 10,
    }]);
  }

  function removeFromPlate(id) {
    setPlate(prev => prev.filter(i => i.id !== id));
  }

  function savePlate() {
    if (plate.length === 0) return;
    const name = plateName.trim() || 'Tabak';
    const kcal = Math.round(plate.reduce((s, i) => s + i.kcal, 0));
    const p    = Math.round(plate.reduce((s, i) => s + i.p, 0) * 10) / 10;
    const c    = Math.round(plate.reduce((s, i) => s + i.c, 0) * 10) / 10;
    const f    = Math.round(plate.reduce((s, i) => s + i.f, 0) * 10) / 10;
    const menu = { id: Date.now(), name, items: plate, kcal, p, c, f };
    setMeals(prev => ({ ...prev, [mealDate]: [...(prev[mealDate] || []), menu] }));
    setPlate([]);
    setPlateName('');
  }

  function removeMenu(id) {
    setMeals(prev => ({ ...prev, [mealDate]: prev[mealDate].filter(m => m.id !== id) }));
    setSelectedMenuIds(prev => prev.filter(i => i !== id));
  }

  function saveProfile() {
    setProfile(draft);
    save('ft_profile', draft);
    setEditingProfile(false);
  }

  function saveGoal() {
    setGoal(goalDraft);
    save('ft_goal', goalDraft);
    setEditingGoal(false);
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
            <button className="ft-btn-ghost" onClick={() => { setGoalDraft(goal); setEditingGoal(true); }}>
              Hedef
            </button>
            <button className="ft-btn-ghost" onClick={() => { setDraft(profile); setEditingProfile(true); }}>
              Profil
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
                  { key: 'gender', label: 'Cinsiyet', type: 'select', opts: [['male','Erkek'],['female','Kadın']] },
                  { key: 'age',    label: 'Yaş',       type: 'number', ph: '25' },
                  { key: 'height', label: 'Boy (cm)',  type: 'number', ph: '175' },
                  { key: 'weight', label: 'Kilo (kg)', type: 'number', ph: '75' },
                  { key: 'waist',  label: 'Bel (cm)',  type: 'number', ph: '85' },
                  { key: 'neck',   label: 'Boyun (cm)',type: 'number', ph: '38' },
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
              </div>
              <div className="ft-popup-footer">
                <button className="ft-btn-ghost" onClick={() => setEditingProfile(false)}>İptal</button>
                <button className="ft-btn-accent" onClick={saveProfile}>Kaydet</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ HEDEF POPUP ══ */}
        {editingGoal && (
          <div className="ft-popup-overlay" onClick={() => setEditingGoal(false)}>
            <div className="ft-popup" onClick={e => e.stopPropagation()} style={{ width: 520 }}>
              <div className="ft-popup-header">
                <span className="ft-popup-title">Hedef Belirle</span>
                <button className="ft-popup-close" onClick={() => setEditingGoal(false)}>✕</button>
              </div>

              {/* Hedef tipi seçimi */}
              <div className="ft-goal-type-row">
                {[
                  { key: 'cut',      label: 'Yağ Yak',      icon: '🔥', desc: 'Kalori açığı ile kilo ver' },
                  { key: 'maintain', label: 'Koru',          icon: '⚖️', desc: 'Kilonu koru' },
                  { key: 'bulk',     label: 'Kas Kazan',     icon: '💪', desc: 'Kalori fazlası ile kas kazan' },
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
              {goalDraft.type === 'cut' && (
                <div className="ft-goal-details">
                  <div className="ft-profile-grid">
                    <label className="ft-label">
                      Hedef Kilo (kg)
                      <input className="ft-input" type="number" step="0.5" placeholder="70"
                        value={goalDraft.targetWeight}
                        onChange={e => setGoalDraft(g => ({ ...g, targetWeight: e.target.value }))} />
                    </label>
                    <label className="ft-label">
                      Süre (gün)
                      <input className="ft-input" type="number" placeholder="90"
                        value={goalDraft.days}
                        onChange={e => setGoalDraft(g => ({ ...g, days: e.target.value }))} />
                    </label>
                  </div>

                  {/* Hızlı süre seçimi */}
                  <div className="ft-goal-quick-days">
                    {[
                      { label: '1 Hafta',  days: 7   },
                      { label: '2 Hafta',  days: 14  },
                      { label: '1 Ay',     days: 30  },
                      { label: '2 Ay',     days: 60  },
                      { label: '3 Ay',     days: 90  },
                      { label: '6 Ay',     days: 180 },
                    ].map(q => (
                      <button
                        key={q.days}
                        className={`ft-goal-day-btn${parseInt(goalDraft.days) === q.days ? ' ft-goal-day-active' : ''}`}
                        onClick={() => setGoalDraft(g => ({ ...g, days: String(q.days) }))}
                      >{q.label}</button>
                    ))}
                  </div>

                  {/* Canlı hesaplama önizlemesi */}
                  {(() => {
                    const curW = parseFloat(lastWeight || profile.weight);
                    const tgtW = parseFloat(goalDraft.targetWeight);
                    const days = parseInt(goalDraft.days);
                    if (!curW || !tgtW || !days || !tdee || curW <= tgtW) return null;
                    const kgToLose    = curW - tgtW;
                    const kcalToLose  = kgToLose * 7700;
                    const rawDeficit  = Math.round(kcalToLose / days);
                    const safeDeficit = Math.min(rawDeficit, 1000);
                    const daily       = Math.max(1200, tdee - safeDeficit);
                    const weeklyLoss  = Math.round((safeDeficit * 7) / 7700 * 100) / 100;
                    const realDays    = Math.round(kcalToLose / safeDeficit);
                    const isCapped    = rawDeficit > 1000;
                    return (
                      <div className="ft-goal-preview">
                        <div className="ft-goal-preview-row">
                          <span>Verilecek kilo</span>
                          <b style={{ color: '#f85149' }}>{kgToLose.toFixed(1)} kg</b>
                        </div>
                        <div className="ft-goal-preview-row">
                          <span>Günlük kalori hedefi</span>
                          <b style={{ color: '#5c7cfa' }}>{daily} kcal</b>
                        </div>
                        <div className="ft-goal-preview-row">
                          <span>Günlük açık</span>
                          <b style={{ color: '#d29922' }}>-{safeDeficit} kcal</b>
                        </div>
                        <div className="ft-goal-preview-row">
                          <span>Haftalık tahmini kayıp</span>
                          <b style={{ color: '#3fb950' }}>{weeklyLoss} kg/hafta</b>
                        </div>
                        {isCapped && (
                          <div className="ft-goal-preview-row ft-goal-preview-warn">
                            <span>⚠️ Süre çok kısa — güvenli limite ({realDays} gün) ayarlandı</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {goalDraft.type === 'bulk' && (
                <div className="ft-goal-details">
                  <div className="ft-goal-preview">
                    <div className="ft-goal-preview-row">
                      <span>TDEE</span>
                      <b style={{ color: '#8b949e' }}>{tdee || '—'} kcal</b>
                    </div>
                    <div className="ft-goal-preview-row">
                      <span>Günlük kalori hedefi</span>
                      <b style={{ color: '#5c7cfa' }}>{tdee ? tdee + 300 : '—'} kcal</b>
                    </div>
                    <div className="ft-goal-preview-row">
                      <span>Günlük fazla</span>
                      <b style={{ color: '#3fb950' }}>+300 kcal</b>
                    </div>
                  </div>
                </div>
              )}

              {goalDraft.type === 'maintain' && (
                <div className="ft-goal-details">
                  <div className="ft-goal-preview">
                    <div className="ft-goal-preview-row">
                      <span>Günlük kalori hedefi</span>
                      <b style={{ color: '#5c7cfa' }}>{tdee || '—'} kcal</b>
                    </div>
                    <div className="ft-goal-preview-row">
                      <span>Strateji</span>
                      <b style={{ color: '#8b949e' }}>TDEE = Tüketim</b>
                    </div>
                  </div>
                </div>
              )}

              <div className="ft-popup-footer">
                <button className="ft-btn-ghost" onClick={() => setEditingGoal(false)}>İptal</button>
                <button className="ft-btn-accent" onClick={saveGoal}>Kaydet</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ ANA LAYOUT: 4 panel + 3 resize handle ══ */}
        <div className="ft-main-layout">

          {/* ── Kilo Takibi ── */}
          <div className="ft-resizable-col" style={{ width: w0 }}>
            <div className="ft-card" style={{ height: '100%', boxSizing: 'border-box' }}>
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
          </div>

          {/* Handle 1: kilo | öğün */}
          <div className="ft-resize-handle" onMouseDown={onDown0} />

          {/* ── Menü ── */}
          <div className="ft-resizable-col" style={{ width: w1 }}>
            <div className="ft-card ft-log-card">
              <div className="ft-card-header">
                <div className="ft-card-label">Menü</div>
                <input type="date" className="ft-input ft-date-sm" style={{ width: 130 }} value={mealDate} onChange={e => setMealDate(e.target.value)} />
              </div>

              <div className="ft-log-body">
                {/* Sol: kaydedilen tabaklar */}
                <div className="ft-menu-sidebar" style={{ width: menuSideW, minWidth: menuSideW }}>
                  {dayMenus.length === 0 && (
                    <div className="ft-empty" style={{ fontSize: 11, padding: '8px 4px' }}>Tabak kaydet</div>
                  )}
                  {dayMenus.map(menu => {
                    const checked = selectedMenuIds.includes(menu.id);
                    return (
                      <div
                        key={menu.id}
                        className={`ft-menu-item${checked ? ' ft-menu-selected' : ''}`}
                        onClick={() => setSelectedMenuIds(prev =>
                          prev.includes(menu.id) ? prev.filter(i => i !== menu.id) : [...prev, menu.id]
                        )}
                      >
                        <div className={`ft-menu-check${checked ? ' ft-menu-check-on' : ''}`}>
                          {checked && '✓'}
                        </div>
                        <div className="ft-menu-info">
                          <span className="ft-menu-name">{menu.name}</span>
                          <span className="ft-menu-kcal">{menu.kcal} kcal</span>
                        </div>
                        <button className="ft-del-btn" style={{ marginLeft: 'auto' }}
                          onClick={e => { e.stopPropagation(); removeMenu(menu.id); }}>×</button>
                      </div>
                    );
                  })}
                </div>

                {/* Menü iç dikey çizgi — sürüklenebilir */}
                <div className="ft-resize-handle ft-resize-handle-inner" onMouseDown={onMenuSideDown} />

                {/* Sağ: seçili tabakların içeriği birleşik */}
                <div className="ft-log-content">
                  {(() => {
                    const selMenus = dayMenus.filter(m => selectedMenuIds.includes(m.id));
                    const allItems = selMenus.flatMap(m => m.items.map(i => ({ ...i, menuName: m.name })));
                    const totalKcal = selMenus.reduce((s, m) => s + m.kcal, 0);
                    const totalP    = selMenus.reduce((s, m) => s + m.p, 0);
                    const totalC    = selMenus.reduce((s, m) => s + m.c, 0);
                    const totalF    = selMenus.reduce((s, m) => s + m.f, 0);
                    return (
                      <>
                        {selMenus.length === 0 && (
                          <div className="ft-empty" style={{ marginTop: 24 }}>Soldan tabak seç</div>
                        )}
                        {selMenus.length > 0 && (
                          <div className="ft-log-summary">
                            <span className="ft-log-kcal" style={{ color: totalKcal > goalKcal && goalKcal ? '#f85149' : '#5c7cfa' }}>
                              {totalKcal} kcal
                            </span>
                            <span className="ft-log-macros">
                              P <b style={{ color: '#f85149' }}>{Math.round(totalP)}g</b>
                              · K <b style={{ color: '#d29922' }}>{Math.round(totalC)}g</b>
                              · Y <b style={{ color: '#3fb950' }}>{Math.round(totalF)}g</b>
                            </span>
                          </div>
                        )}
                        {allItems.map((item, idx) => (
                          <div key={idx} className="ft-list-row">
                            <span className="ft-menu-tag">{item.menuName}</span>
                            <span className="ft-list-name">{item.name}</span>
                            <span className="ft-list-sub">{item.qty}g</span>
                            <span className="ft-list-val" style={{ color: '#5c7cfa', marginLeft: 'auto' }}>{item.kcal}</span>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Handle 2: öğün | tabak */}
          <div className="ft-resize-handle" onMouseDown={onDown1} />

          {/* ── Tabak ── */}
          <div className="ft-resizable-col" style={{ width: w2 }}>
            <div className="ft-card ft-plate-card" style={{ height: '100%', boxSizing: 'border-box' }}>
              <div className="ft-card-header">
                <div className="ft-card-label">Tabak</div>
              </div>

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
                        <span className="ft-plate-qty">{item.qty}{item.unit || 'g'}</span>
                        <span className="ft-plate-kcal">{item.kcal} kcal</span>
                        <button className="ft-del-btn" onClick={() => removeFromPlate(item.id)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {plate.length > 0 && (
                <div className="ft-plate-totals">
                  <div className="ft-plate-total-kcal">{plateKcal} kcal</div>
                  <div className="ft-plate-macros">
                    <span style={{ color: '#f85149' }}>P {plateProtein}g</span>
                    <span style={{ color: '#d29922' }}>K {plateCarb}g</span>
                    <span style={{ color: '#3fb950' }}>Y {plateFat}g</span>
                  </div>
                  <div className="ft-plate-save-row">
                    <input
                      className="ft-input"
                      placeholder="Tabak adı..."
                      value={plateName}
                      onChange={e => setPlateName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') savePlate(); }}
                      style={{ flex: 1, fontSize: 13 }}
                    />
                    <button className="ft-btn-accent" onClick={savePlate} style={{ whiteSpace: 'nowrap' }}>
                      Kaydet →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Handle 3: tabak | arama */}
          <div className="ft-resize-handle" onMouseDown={onDown2} />

          {/* ── Yiyecek Arama ── */}
          <div className="ft-resizable-col" style={{ flex: 1, minWidth: 160 }}>
            <div className="ft-card ft-search-card" style={{ height: '100%', boxSizing: 'border-box' }}>
              <div className="ft-card-header">
                <div className="ft-card-label">Yiyecek Ara</div>
              </div>
              <input
                className="ft-input"
                style={{ fontSize: 15, padding: '9px 12px' }}
                placeholder="Yiyecek ara..."
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
              />
              {searchQ.trim() === '' ? (
                <div className="ft-food-empty-hint">
                  <div style={{ fontSize: 36, opacity: 0.2 }}>🔍</div>
                  <div>Aramak istediğin yiyeceği yaz</div>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="ft-food-empty-hint">
                  <div style={{ fontSize: 36, opacity: 0.2 }}>🤷</div>
                  <div>Sonuç bulunamadı</div>
                </div>
              ) : null}
              <div className="ft-food-list">
                {searchResults.map((food, i) => {
                  const isAdet = food.unit === 'adet';
                  const defaultQty = isAdet ? 1 : 100;
                  const qty = parseFloat(dragQty[food.name]) || defaultQty;
                  const ratio = isAdet ? qty : qty / 100;
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
                          min="0.5"
                          step={isAdet ? 1 : 10}
                          value={dragQty[food.name] ?? defaultQty}
                          onClick={e => e.stopPropagation()}
                          onChange={e => setDragQty(prev => ({ ...prev, [food.name]: e.target.value }))}
                        />
                        <span className="ft-food-unit">{isAdet ? 'adet' : 'g'}</span>
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
