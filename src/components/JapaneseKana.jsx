import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getAudioContext, getMasterGain, getVolume } from "../utils/sounds";
import { pushKeyToSupabase } from "../supabase";
import "./JapaneseKana.css";

function openKanaPopup() {
  invoke('toggle_kana_window').catch(() => {});
}

function getJapaneseVoice() {
  const voices = window.speechSynthesis.getVoices();
  // Prefer ja-JP voices, prioritize Google/Microsoft quality voices
  const jaVoices = voices.filter(v => v.lang.startsWith('ja'));
  if (jaVoices.length === 0) return null;
  return (
    jaVoices.find(v => v.name.includes('Google')) ||
    jaVoices.find(v => v.name.includes('Microsoft')) ||
    jaVoices.find(v => !v.localService) ||
    jaVoices[0]
  );
}

// Pre-warm voices on first load
if (typeof window !== 'undefined') {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

let _ttsError = null;

async function speakKanaGoogleTTS(char, slow = true) {
  try {
    // Use Rust backend to bypass CSP/fetch restrictions
    const bytes = await invoke('fetch_tts', { text: char, slow });
    if (!bytes || bytes.length === 0) {
      _ttsError = 'empty response';
      return false;
    }
    const arrayBuffer = new Uint8Array(bytes).buffer;
    const ctx = getAudioContext();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const src = ctx.createBufferSource();
    src.buffer = decoded;
    src.connect(getMasterGain());
    src.start(0);
    _ttsError = null;
    return true;
  } catch(e) {
    _ttsError = e.message || String(e);
    return false;
  }
}

function speakKana(char, rate = 0.7) {
  if (!char) return;
  const voice = getJapaneseVoice();
  if (voice) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(char);
      utterance.lang = 'ja-JP';
      utterance.rate = rate;
      utterance.pitch = 1.0;
      utterance.volume = getVolume();
      utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
      return;
    } catch {}
  }
  // Fallback: Rust backend → Google TTS (slow only for single chars)
  speakKanaGoogleTTS(char, rate < 1.0);
}


function playCorrectSound() {
  try {
    const ctx = getAudioContext();
    const master = getMasterGain();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(master);
    o.type = 'sine'; o.frequency.setValueAtTime(520, ctx.currentTime);
    o.frequency.setValueAtTime(660, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    o.start(); o.stop(ctx.currentTime + 0.35);
  } catch {}
}

function playWrongSound() {
  try {
    const ctx = getAudioContext();
    const master = getMasterGain();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(master);
    o.type = 'sawtooth'; o.frequency.setValueAtTime(220, ctx.currentTime);
    o.frequency.setValueAtTime(160, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.start(); o.stop(ctx.currentTime + 0.3);
  } catch {}
}

function playTypeSound() {
  try {
    const ctx = getAudioContext();
    const master = getMasterGain();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(master);
    o.type = 'sine'; o.frequency.setValueAtTime(800, ctx.currentTime);
    g.gain.setValueAtTime(0.04, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    o.start(); o.stop(ctx.currentTime + 0.06);
  } catch {}
}

// ── Data ──────────────────────────────────────────────────────────────────────

const HIRAGANA_ROWS = [
  ["あa", "いi", "うu", "えe", "おo"],
  ["かka", "きki", "くku", "けke", "こko"],
  ["さsa", "しshi", "すsu", "せse", "そso"],
  ["たta", "ちchi", "つtsu", "てte", "とto"],
  ["なna", "にni", "ぬnu", "ねne", "のno"],
  ["はha", "ひhi", "ふfu", "へhe", "ほho"],
  ["まma", "みmi", "むmu", "めme", "もmo"],
  ["やya", "ゆyu", "よyo"],
  ["らra", "りri", "るru", "れre", "ろro"],
  ["わwa", "をwo", "んn"],
];

const HIRAGANA_VOICED_ROWS = [
  ["がga", "ぎgi", "ぐgu", "げge", "ごgo"],
  ["ざza", "じji", "ずzu", "ぜze", "ぞzo"],
  ["だda", "ぢji", "づzu", "でde", "どdo"],
  ["ばba", "びbi", "ぶbu", "べbe", "ぼbo"],
  ["ぱpa", "ぴpi", "ぷpu", "ぺpe", "ぽpo"],
];

const KATAKANA_ROWS = [
  ["アa", "イi", "ウu", "エe", "オo"],
  ["カka", "キki", "クku", "ケke", "コko"],
  ["サsa", "シshi", "スsu", "セse", "ソso"],
  ["タta", "チchi", "ツtsu", "テte", "トto"],
  ["ナna", "ニni", "ヌnu", "ネne", "ノno"],
  ["ハha", "ヒhi", "フfu", "ヘhe", "ホho"],
  ["マma", "ミmi", "ムmu", "メme", "モmo"],
  ["ヤya", "ユyu", "ヨyo"],
  ["ラra", "リri", "ルru", "レre", "ロro"],
  ["ワwa", "ヲwo", "ンn"],
];

const KATAKANA_VOICED_ROWS = [
  ["ガga", "ギgi", "グgu", "ゲge", "ゴgo"],
  ["ザza", "ジji", "ズzu", "ゼze", "ゾzo"],
  ["ダda", "ヂji", "ヅzu", "デde", "ドdo"],
  ["バba", "ビbi", "ブbu", "ベbe", "ボbo"],
  ["パpa", "ピpi", "プpu", "ペpe", "ポpo"],
];

// Parse "あa" → { char: "あ", romaji: "a" }
function parseEntry(entry) {
  // The character is everything up to the first ASCII letter
  const match = entry.match(/^([^\x00-\x7F]+)(.+)$/);
  if (!match) return null;
  return { char: match[1], romaji: match[2] };
}

const HIRAGANA = HIRAGANA_ROWS.flat().map(parseEntry).filter(Boolean);
const HIRAGANA_VOICED = HIRAGANA_VOICED_ROWS.flat().map(parseEntry).filter(Boolean);
const KATAKANA = KATAKANA_ROWS.flat().map(parseEntry).filter(Boolean);
const KATAKANA_VOICED = KATAKANA_VOICED_ROWS.flat().map(parseEntry).filter(Boolean);
const ALL_KANA = [...HIRAGANA, ...KATAKANA];
const ALL_KANA_WITH_VOICED = [...HIRAGANA, ...HIRAGANA_VOICED, ...KATAKANA, ...KATAKANA_VOICED];

const ROW_LABELS = ["a", "ka", "sa", "ta", "na", "ha", "ma", "ya", "ra", "wa"];
const VOICED_ROW_LABELS = ["ga", "za", "da", "ba", "pa"];
const COL_LABELS = ["·", "K", "S", "T", "N", "H", "M", "Y", "R", "W"];
const VOICED_COL_LABELS = ["G", "Z", "D", "B", "P"];
const VOWEL_LABELS = ["A", "I", "U", "E", "O"];

// ── Vocabulary word list ──────────────────────────────────────────────────────

const VOCAB_GREETINGS = [
  { kana:"おはよう", romaji:"ohayou", meaning:"good morning", category:"greetings" },
  { kana:"こんにちは", romaji:"konnichiwa", meaning:"hello / good afternoon", category:"greetings" },
  { kana:"こんばんは", romaji:"konbanwa", meaning:"good evening", category:"greetings" },
  { kana:"ありがとう", romaji:"arigatou", meaning:"thank you", category:"greetings" },
  { kana:"すみません", romaji:"sumimasen", meaning:"excuse me / sorry", category:"greetings" },
  { kana:"ごめんなさい", romaji:"gomennasai", meaning:"I'm sorry", category:"greetings" },
  { kana:"はい", romaji:"hai", meaning:"yes", category:"greetings" },
  { kana:"いいえ", romaji:"iie", meaning:"no", category:"greetings" },
  { kana:"おやすみ", romaji:"oyasumi", meaning:"good night", category:"greetings" },
  { kana:"さようなら", romaji:"sayounara", meaning:"goodbye", category:"greetings" },
  { kana:"はじめまして", romaji:"hajimemashite", meaning:"nice to meet you", category:"greetings" },
  { kana:"どうぞ", romaji:"douzo", meaning:"please / go ahead", category:"greetings" },
];

const VOCAB_NUMBERS = [
  { kana:"いち", romaji:"ichi", meaning:"one (1)", category:"numbers" },
  { kana:"に", romaji:"ni", meaning:"two (2)", category:"numbers" },
  { kana:"さん", romaji:"san", meaning:"three (3)", category:"numbers" },
  { kana:"し", romaji:"shi", meaning:"four (4)", category:"numbers" },
  { kana:"よん", romaji:"yon", meaning:"four (4) alt.", category:"numbers" },
  { kana:"ご", romaji:"go", meaning:"five (5)", category:"numbers" },
  { kana:"ろく", romaji:"roku", meaning:"six (6)", category:"numbers" },
  { kana:"なな", romaji:"nana", meaning:"seven (7)", category:"numbers" },
  { kana:"しち", romaji:"shichi", meaning:"seven (7) alt.", category:"numbers" },
  { kana:"はち", romaji:"hachi", meaning:"eight (8)", category:"numbers" },
  { kana:"きゅう", romaji:"kyuu", meaning:"nine (9)", category:"numbers" },
  { kana:"く", romaji:"ku", meaning:"nine (9) alt.", category:"numbers" },
  { kana:"じゅう", romaji:"juu", meaning:"ten (10)", category:"numbers" },
  { kana:"ひゃく", romaji:"hyaku", meaning:"hundred (100)", category:"numbers" },
  { kana:"せん", romaji:"sen", meaning:"thousand (1000)", category:"numbers" },
];

const VOCAB_COLORS = [
  { kana:"あか", romaji:"aka", meaning:"red", category:"colors" },
  { kana:"あお", romaji:"ao", meaning:"blue / green", category:"colors" },
  { kana:"しろ", romaji:"shiro", meaning:"white", category:"colors" },
  { kana:"くろ", romaji:"kuro", meaning:"black", category:"colors" },
  { kana:"きいろ", romaji:"kiiro", meaning:"yellow", category:"colors" },
  { kana:"みどり", romaji:"midori", meaning:"green", category:"colors" },
  { kana:"むらさき", romaji:"murasaki", meaning:"purple", category:"colors" },
  { kana:"ピンク", romaji:"pinku", meaning:"pink", category:"colors" },
  { kana:"オレンジ", romaji:"orenji", meaning:"orange", category:"colors" },
  { kana:"ちゃいろ", romaji:"chairo", meaning:"brown", category:"colors" },
  { kana:"はいいろ", romaji:"haiiro", meaning:"gray", category:"colors" },
];

const VOCAB_FOOD = [
  { kana:"ごはん", romaji:"gohan", meaning:"rice / meal", category:"food" },
  { kana:"パン", romaji:"pan", meaning:"bread", category:"food" },
  { kana:"みず", romaji:"mizu", meaning:"water", category:"food" },
  { kana:"おちゃ", romaji:"ocha", meaning:"tea", category:"food" },
  { kana:"コーヒー", romaji:"koohii", meaning:"coffee", category:"food" },
  { kana:"すし", romaji:"sushi", meaning:"sushi", category:"food" },
  { kana:"ラーメン", romaji:"raamen", meaning:"ramen", category:"food" },
  { kana:"てんぷら", romaji:"tenpura", meaning:"tempura", category:"food" },
  { kana:"さしみ", romaji:"sashimi", meaning:"sashimi", category:"food" },
  { kana:"うどん", romaji:"udon", meaning:"udon noodles", category:"food" },
  { kana:"そば", romaji:"soba", meaning:"soba noodles", category:"food" },
  { kana:"たまご", romaji:"tamago", meaning:"egg", category:"food" },
  { kana:"さかな", romaji:"sakana", meaning:"fish", category:"food" },
  { kana:"にく", romaji:"niku", meaning:"meat", category:"food" },
  { kana:"やさい", romaji:"yasai", meaning:"vegetable", category:"food" },
  { kana:"くだもの", romaji:"kudamono", meaning:"fruit", category:"food" },
  { kana:"おにぎり", romaji:"onigiri", meaning:"rice ball", category:"food" },
  { kana:"みそしる", romaji:"misoshiru", meaning:"miso soup", category:"food" },
];

const VOCAB_ANIMALS = [
  { kana:"いぬ", romaji:"inu", meaning:"dog", category:"animals" },
  { kana:"ねこ", romaji:"neko", meaning:"cat", category:"animals" },
  { kana:"とり", romaji:"tori", meaning:"bird", category:"animals" },
  { kana:"さかな", romaji:"sakana", meaning:"fish", category:"animals" },
  { kana:"うま", romaji:"uma", meaning:"horse", category:"animals" },
  { kana:"うし", romaji:"ushi", meaning:"cow", category:"animals" },
  { kana:"ぶた", romaji:"buta", meaning:"pig", category:"animals" },
  { kana:"うさぎ", romaji:"usagi", meaning:"rabbit", category:"animals" },
  { kana:"きつね", romaji:"kitsune", meaning:"fox", category:"animals" },
  { kana:"たぬき", romaji:"tanuki", meaning:"raccoon dog", category:"animals" },
  { kana:"くま", romaji:"kuma", meaning:"bear", category:"animals" },
  { kana:"さる", romaji:"saru", meaning:"monkey", category:"animals" },
  { kana:"へび", romaji:"hebi", meaning:"snake", category:"animals" },
  { kana:"かえる", romaji:"kaeru", meaning:"frog", category:"animals" },
];

const VOCAB_BODY = [
  { kana:"あたま", romaji:"atama", meaning:"head", category:"body" },
  { kana:"め", romaji:"me", meaning:"eye", category:"body" },
  { kana:"はな", romaji:"hana", meaning:"nose", category:"body" },
  { kana:"くち", romaji:"kuchi", meaning:"mouth", category:"body" },
  { kana:"みみ", romaji:"mimi", meaning:"ear", category:"body" },
  { kana:"て", romaji:"te", meaning:"hand", category:"body" },
  { kana:"あし", romaji:"ashi", meaning:"leg / foot", category:"body" },
  { kana:"かお", romaji:"kao", meaning:"face", category:"body" },
  { kana:"かみ", romaji:"kami", meaning:"hair", category:"body" },
  { kana:"せなか", romaji:"senaka", meaning:"back", category:"body" },
  { kana:"おなか", romaji:"onaka", meaning:"stomach / belly", category:"body" },
  { kana:"こし", romaji:"koshi", meaning:"hip / waist", category:"body" },
];

const VOCAB_FAMILY = [
  { kana:"おかあさん", romaji:"okaasan", meaning:"mother", category:"family" },
  { kana:"おとうさん", romaji:"otousan", meaning:"father", category:"family" },
  { kana:"おにいさん", romaji:"oniisan", meaning:"older brother", category:"family" },
  { kana:"おねえさん", romaji:"oneesan", meaning:"older sister", category:"family" },
  { kana:"おとうと", romaji:"otouto", meaning:"younger brother", category:"family" },
  { kana:"いもうと", romaji:"imouto", meaning:"younger sister", category:"family" },
  { kana:"かぞく", romaji:"kazoku", meaning:"family", category:"family" },
  { kana:"こども", romaji:"kodomo", meaning:"child", category:"family" },
  { kana:"そぼ", romaji:"sobo", meaning:"grandmother", category:"family" },
  { kana:"そふ", romaji:"sofu", meaning:"grandfather", category:"family" },
];

const VOCAB_TIME = [
  { kana:"いま", romaji:"ima", meaning:"now", category:"time" },
  { kana:"きょう", romaji:"kyou", meaning:"today", category:"time" },
  { kana:"きのう", romaji:"kinou", meaning:"yesterday", category:"time" },
  { kana:"あした", romaji:"ashita", meaning:"tomorrow", category:"time" },
  { kana:"あさ", romaji:"asa", meaning:"morning", category:"time" },
  { kana:"ひる", romaji:"hiru", meaning:"noon / daytime", category:"time" },
  { kana:"よる", romaji:"yoru", meaning:"night", category:"time" },
  { kana:"まいにち", romaji:"mainichi", meaning:"every day", category:"time" },
  { kana:"らいねん", romaji:"rainen", meaning:"next year", category:"time" },
  { kana:"ことし", romaji:"kotoshi", meaning:"this year", category:"time" },
  { kana:"せんしゅう", romaji:"senshuu", meaning:"last week", category:"time" },
  { kana:"らいしゅう", romaji:"raishuu", meaning:"next week", category:"time" },
];

const VOCAB_VERBS = [
  { kana:"たべる", romaji:"taberu", meaning:"to eat", category:"verbs" },
  { kana:"のむ", romaji:"nomu", meaning:"to drink", category:"verbs" },
  { kana:"みる", romaji:"miru", meaning:"to see / watch", category:"verbs" },
  { kana:"きく", romaji:"kiku", meaning:"to listen / ask", category:"verbs" },
  { kana:"はなす", romaji:"hanasu", meaning:"to speak", category:"verbs" },
  { kana:"かく", romaji:"kaku", meaning:"to write", category:"verbs" },
  { kana:"よむ", romaji:"yomu", meaning:"to read", category:"verbs" },
  { kana:"いく", romaji:"iku", meaning:"to go", category:"verbs" },
  { kana:"くる", romaji:"kuru", meaning:"to come", category:"verbs" },
  { kana:"する", romaji:"suru", meaning:"to do", category:"verbs" },
  { kana:"ある", romaji:"aru", meaning:"to be / exist (things)", category:"verbs" },
  { kana:"いる", romaji:"iru", meaning:"to be / exist (living)", category:"verbs" },
  { kana:"わかる", romaji:"wakaru", meaning:"to understand", category:"verbs" },
  { kana:"おきる", romaji:"okiru", meaning:"to wake up", category:"verbs" },
  { kana:"ねる", romaji:"neru", meaning:"to sleep", category:"verbs" },
  { kana:"かえる", romaji:"kaeru", meaning:"to return home", category:"verbs" },
  { kana:"はいる", romaji:"hairu", meaning:"to enter", category:"verbs" },
  { kana:"でる", romaji:"deru", meaning:"to leave / exit", category:"verbs" },
];

const VOCAB_ADJECTIVES = [
  { kana:"おおきい", romaji:"ookii", meaning:"big", category:"adjectives" },
  { kana:"ちいさい", romaji:"chiisai", meaning:"small", category:"adjectives" },
  { kana:"あつい", romaji:"atsui", meaning:"hot", category:"adjectives" },
  { kana:"さむい", romaji:"samui", meaning:"cold (weather)", category:"adjectives" },
  { kana:"たかい", romaji:"takai", meaning:"tall / expensive", category:"adjectives" },
  { kana:"やすい", romaji:"yasui", meaning:"cheap / easy", category:"adjectives" },
  { kana:"はやい", romaji:"hayai", meaning:"fast / early", category:"adjectives" },
  { kana:"おそい", romaji:"osoi", meaning:"slow / late", category:"adjectives" },
  { kana:"いい", romaji:"ii", meaning:"good", category:"adjectives" },
  { kana:"わるい", romaji:"warui", meaning:"bad", category:"adjectives" },
  { kana:"あたらしい", romaji:"atarashii", meaning:"new", category:"adjectives" },
  { kana:"ふるい", romaji:"furui", meaning:"old", category:"adjectives" },
  { kana:"かわいい", romaji:"kawaii", meaning:"cute", category:"adjectives" },
  { kana:"おいしい", romaji:"oishii", meaning:"delicious", category:"adjectives" },
  { kana:"むずかしい", romaji:"muzukashii", meaning:"difficult", category:"adjectives" },
  { kana:"やさしい", romaji:"yasashii", meaning:"kind / gentle", category:"adjectives" },
  { kana:"たのしい", romaji:"tanoshii", meaning:"fun / enjoyable", category:"adjectives" },
  { kana:"きれい", romaji:"kirei", meaning:"pretty / clean", category:"adjectives" },
];

// ── Word list ─────────────────────────────────────────────────────────────────
// { kana, romaji, meaning, chars: [hiragana chars used] }
const WORD_LIST = [
  { kana:"あお", romaji:"ao", meaning:"blue/green", category:"general" },
  { kana:"あか", romaji:"aka", meaning:"red", category:"general" },
  { kana:"あき", romaji:"aki", meaning:"autumn", category:"general" },
  { kana:"あさ", romaji:"asa", meaning:"morning", category:"general" },
  { kana:"あし", romaji:"ashi", meaning:"leg/foot", category:"general" },
  { kana:"あに", romaji:"ani", meaning:"older brother", category:"general" },
  { kana:"あね", romaji:"ane", meaning:"older sister", category:"general" },
  { kana:"あめ", romaji:"ame", meaning:"rain / candy", category:"general" },
  { kana:"あり", romaji:"ari", meaning:"ant", category:"general" },
  { kana:"いえ", romaji:"ie", meaning:"house", category:"general" },
  { kana:"いか", romaji:"ika", meaning:"squid", category:"general" },
  { kana:"いけ", romaji:"ike", meaning:"pond", category:"general" },
  { kana:"いぬ", romaji:"inu", meaning:"dog", category:"general" },
  { kana:"いま", romaji:"ima", meaning:"now / living room", category:"general" },
  { kana:"いも", romaji:"imo", meaning:"potato", category:"general" },
  { kana:"いわ", romaji:"iwa", meaning:"rock", category:"general" },
  { kana:"うえ", romaji:"ue", meaning:"above/up", category:"general" },
  { kana:"うし", romaji:"ushi", meaning:"cow", category:"general" },
  { kana:"うた", romaji:"uta", meaning:"song", category:"general" },
  { kana:"うみ", romaji:"umi", meaning:"sea/ocean", category:"general" },
  { kana:"うら", romaji:"ura", meaning:"back/reverse", category:"general" },
  { kana:"えき", romaji:"eki", meaning:"station", category:"general" },
  { kana:"おか", romaji:"oka", meaning:"hill", category:"general" },
  { kana:"おと", romaji:"oto", meaning:"sound", category:"general" },
  { kana:"おに", romaji:"oni", meaning:"demon/ogre", category:"general" },
  { kana:"おや", romaji:"oya", meaning:"parent", category:"general" },
  { kana:"かお", romaji:"kao", meaning:"face", category:"general" },
  { kana:"かぜ", romaji:"kaze", meaning:"wind / cold", category:"general" },
  { kana:"かた", romaji:"kata", meaning:"shoulder / person", category:"general" },
  { kana:"かに", romaji:"kani", meaning:"crab", category:"general" },
  { kana:"かね", romaji:"kane", meaning:"money / bell", category:"general" },
  { kana:"かみ", romaji:"kami", meaning:"paper / god / hair", category:"general" },
  { kana:"から", romaji:"kara", meaning:"from / empty", category:"general" },
  { kana:"かわ", romaji:"kawa", meaning:"river / skin", category:"general" },
  { kana:"き", romaji:"ki", meaning:"tree", category:"general" },
  { kana:"きた", romaji:"kita", meaning:"north", category:"general" },
  { kana:"くさ", romaji:"kusa", meaning:"grass", category:"general" },
  { kana:"くち", romaji:"kuchi", meaning:"mouth", category:"general" },
  { kana:"くに", romaji:"kuni", meaning:"country", category:"general" },
  { kana:"くま", romaji:"kuma", meaning:"bear", category:"general" },
  { kana:"くも", romaji:"kumo", meaning:"cloud / spider", category:"general" },
  { kana:"くる", romaji:"kuru", meaning:"to come", category:"general" },
  { kana:"けさ", romaji:"kesa", meaning:"this morning", category:"general" },
  { kana:"こえ", romaji:"koe", meaning:"voice", category:"general" },
  { kana:"こな", romaji:"kona", meaning:"powder / flour", category:"general" },
  { kana:"こめ", romaji:"kome", meaning:"rice (uncooked)", category:"general" },
  { kana:"さかな", romaji:"sakana", meaning:"fish", category:"general" },
  { kana:"さくら", romaji:"sakura", meaning:"cherry blossom", category:"general" },
  { kana:"さむい", romaji:"samui", meaning:"cold (weather)", category:"general" },
  { kana:"しお", romaji:"shio", meaning:"salt", category:"general" },
  { kana:"した", romaji:"shita", meaning:"below/under", category:"general" },
  { kana:"しま", romaji:"shima", meaning:"island", category:"general" },
  { kana:"しろ", romaji:"shiro", meaning:"white / castle", category:"general" },
  { kana:"すな", romaji:"suna", meaning:"sand", category:"general" },
  { kana:"すみ", romaji:"sumi", meaning:"corner / ink", category:"general" },
  { kana:"そら", romaji:"sora", meaning:"sky", category:"general" },
  { kana:"たに", romaji:"tani", meaning:"valley", category:"general" },
  { kana:"ちから", romaji:"chikara", meaning:"power/strength", category:"general" },
  { kana:"つき", romaji:"tsuki", meaning:"moon / month", category:"general" },
  { kana:"つち", romaji:"tsuchi", meaning:"soil/earth", category:"general" },
  { kana:"てき", romaji:"teki", meaning:"enemy", category:"general" },
  { kana:"てら", romaji:"tera", meaning:"temple", category:"general" },
  { kana:"とき", romaji:"toki", meaning:"time", category:"general" },
  { kana:"とり", romaji:"tori", meaning:"bird", category:"general" },
  { kana:"なか", romaji:"naka", meaning:"inside/middle", category:"general" },
  { kana:"なつ", romaji:"natsu", meaning:"summer", category:"general" },
  { kana:"なみ", romaji:"nami", meaning:"wave", category:"general" },
  { kana:"にく", romaji:"niku", meaning:"meat", category:"general" },
  { kana:"にし", romaji:"nishi", meaning:"west", category:"general" },
  { kana:"にわ", romaji:"niwa", meaning:"garden", category:"general" },
  { kana:"ねこ", romaji:"neko", meaning:"cat", category:"general" },
  { kana:"ねつ", romaji:"netsu", meaning:"fever / heat", category:"general" },
  { kana:"のり", romaji:"nori", meaning:"seaweed / glue", category:"general" },
  { kana:"はな", romaji:"hana", meaning:"flower / nose", category:"general" },
  { kana:"はし", romaji:"hashi", meaning:"chopsticks / bridge", category:"general" },
  { kana:"はる", romaji:"haru", meaning:"spring", category:"general" },
  { kana:"ひかり", romaji:"hikari", meaning:"light", category:"general" },
  { kana:"ひと", romaji:"hito", meaning:"person", category:"general" },
  { kana:"ひま", romaji:"hima", meaning:"free time", category:"general" },
  { kana:"ふね", romaji:"fune", meaning:"ship/boat", category:"general" },
  { kana:"ふゆ", romaji:"fuyu", meaning:"winter", category:"general" },
  { kana:"ほし", romaji:"hoshi", meaning:"star", category:"general" },
  { kana:"まち", romaji:"machi", meaning:"town", category:"general" },
  { kana:"まつ", romaji:"matsu", meaning:"pine tree / to wait", category:"general" },
  { kana:"みず", romaji:"mizu", meaning:"water", category:"general" },
  { kana:"みち", romaji:"michi", meaning:"road/path", category:"general" },
  { kana:"みなみ", romaji:"minami", meaning:"south", category:"general" },
  { kana:"むし", romaji:"mushi", meaning:"insect/bug", category:"general" },
  { kana:"めし", romaji:"meshi", meaning:"meal/rice (casual)", category:"general" },
  { kana:"もり", romaji:"mori", meaning:"forest", category:"general" },
  { kana:"やま", romaji:"yama", meaning:"mountain", category:"general" },
  { kana:"ゆき", romaji:"yuki", meaning:"snow", category:"general" },
  { kana:"よる", romaji:"yoru", meaning:"night", category:"general" },
  { kana:"らく", romaji:"raku", meaning:"comfortable/easy", category:"general" },
  { kana:"りく", romaji:"riku", meaning:"land/shore", category:"general" },
  { kana:"るす", romaji:"rusu", meaning:"absence/away from home", category:"general" },
  { kana:"わたし", romaji:"watashi", meaning:"I/me", category:"general" },
  { kana:"をとこ", romaji:"otoko", meaning:"man (archaic)", category:"general" },
  { kana:"かなた", romaji:"kanata", meaning:"far away / beyond", category:"general" },
  { kana:"さかた", romaji:"sakata", meaning:"(place name)", category:"general" },
  { kana:"なかま", romaji:"nakama", meaning:"friend/companion", category:"general" },
  { kana:"たのしい", romaji:"tanoshii", meaning:"fun/enjoyable", category:"general" },
  { kana:"おいしい", romaji:"oishii", meaning:"delicious", category:"general" },
  { kana:"あたらしい", romaji:"atarashii", meaning:"new", category:"general" },
  { kana:"あかるい", romaji:"akarui", meaning:"bright/cheerful", category:"general" },
  { kana:"むらさき", romaji:"murasaki", meaning:"purple", category:"general" },
  { kana:"しずか", romaji:"shizuka", meaning:"quiet/calm", category:"general" },
  { kana:"はやい", romaji:"hayai", meaning:"fast/early", category:"general" },
  { kana:"おおきい", romaji:"ookii", meaning:"big", category:"general" },
  { kana:"ちいさい", romaji:"chiisai", meaning:"small", category:"general" },
  { kana:"あい", romaji:"ai", meaning:"love", category:"general" },
  { kana:"あいこ", romaji:"aiko", meaning:"tie/draw (game)", category:"general" },
  { kana:"あおい", romaji:"aoi", meaning:"blue/pale", category:"general" },
  { kana:"あおぞら", romaji:"aozora", meaning:"blue sky", category:"general" },
  { kana:"あかい", romaji:"akai", meaning:"red (adjective)", category:"general" },
  { kana:"あかね", romaji:"akane", meaning:"madder red / name", category:"general" },
  { kana:"あくび", romaji:"akubi", meaning:"yawn", category:"general" },
  { kana:"あさひ", romaji:"asahi", meaning:"morning sun", category:"general" },
  { kana:"あした", romaji:"ashita", meaning:"tomorrow", category:"general" },
  { kana:"あたま", romaji:"atama", meaning:"head", category:"general" },
  { kana:"あなた", romaji:"anata", meaning:"you", category:"general" },
  { kana:"あひる", romaji:"ahiru", meaning:"duck", category:"general" },
  { kana:"いいえ", romaji:"iie", meaning:"no", category:"general" },
  { kana:"いきる", romaji:"ikiru", meaning:"to live", category:"general" },
  { kana:"いくら", romaji:"ikura", meaning:"how much / salmon roe", category:"general" },
  { kana:"いし", romaji:"ishi", meaning:"stone / will", category:"general" },
  { kana:"いたい", romaji:"itai", meaning:"painful / ouch", category:"general" },
  { kana:"いつ", romaji:"itsu", meaning:"when", category:"general" },
  { kana:"いのち", romaji:"inochi", meaning:"life", category:"general" },
  { kana:"いろ", romaji:"iro", meaning:"color", category:"general" },
  { kana:"うさぎ", romaji:"usagi", meaning:"rabbit", category:"general" },
  { kana:"うそ", romaji:"uso", meaning:"lie / falsehood", category:"general" },
  { kana:"うたう", romaji:"utau", meaning:"to sing", category:"general" },
  { kana:"うどん", romaji:"udon", meaning:"udon noodles", category:"general" },
  { kana:"うなぎ", romaji:"unagi", meaning:"eel", category:"general" },
  { kana:"えがお", romaji:"egao", meaning:"smiling face", category:"general" },
  { kana:"おいしい", romaji:"oishii", meaning:"delicious", category:"general" },
  { kana:"おかし", romaji:"okashi", meaning:"sweets / snack", category:"general" },
  { kana:"おかね", romaji:"okane", meaning:"money", category:"general" },
  { kana:"おきる", romaji:"okiru", meaning:"to wake up", category:"general" },
  { kana:"おこめ", romaji:"okome", meaning:"rice (uncooked)", category:"general" },
  { kana:"おそい", romaji:"osoi", meaning:"slow / late", category:"general" },
  { kana:"おちる", romaji:"ochiru", meaning:"to fall", category:"general" },
  { kana:"おとな", romaji:"otona", meaning:"adult", category:"general" },
  { kana:"おなか", romaji:"onaka", meaning:"stomach / belly", category:"general" },
  { kana:"おにぎり", romaji:"onigiri", meaning:"rice ball", category:"general" },
  { kana:"おはよう", romaji:"ohayou", meaning:"good morning", category:"general" },
  { kana:"おふろ", romaji:"ofuro", meaning:"bath", category:"general" },
  { kana:"おもい", romaji:"omoi", meaning:"heavy / feeling", category:"general" },
  { kana:"おもしろい", romaji:"omoshiroi", meaning:"interesting / funny", category:"general" },
  { kana:"おやすみ", romaji:"oyasumi", meaning:"good night", category:"general" },
  { kana:"かいわ", romaji:"kaiwa", meaning:"conversation", category:"general" },
  { kana:"かける", romaji:"kakeru", meaning:"to hang / to run / to call", category:"general" },
  { kana:"かこ", romaji:"kako", meaning:"the past", category:"general" },
  { kana:"かさ", romaji:"kasa", meaning:"umbrella", category:"general" },
  { kana:"かのじょ", romaji:"kanojo", meaning:"she / girlfriend", category:"general" },
  { kana:"かべ", romaji:"kabe", meaning:"wall", category:"general" },
  { kana:"かもめ", romaji:"kamome", meaning:"seagull", category:"general" },
  { kana:"からす", romaji:"karasu", meaning:"crow", category:"general" },
  { kana:"かれ", romaji:"kare", meaning:"he / boyfriend", category:"general" },
  { kana:"かわいい", romaji:"kawaii", meaning:"cute", category:"general" },
  { kana:"きいろ", romaji:"kiiro", meaning:"yellow", category:"general" },
  { kana:"きえる", romaji:"kieru", meaning:"to disappear", category:"general" },
  { kana:"きく", romaji:"kiku", meaning:"to listen / chrysanthemum", category:"general" },
  { kana:"きこえる", romaji:"kikoeru", meaning:"to be audible", category:"general" },
  { kana:"きせつ", romaji:"kisetsu", meaning:"season", category:"general" },
  { kana:"きつね", romaji:"kitsune", meaning:"fox", category:"general" },
  { kana:"きのう", romaji:"kinou", meaning:"yesterday", category:"general" },
  { kana:"きょう", romaji:"kyou", meaning:"today", category:"general" },
  { kana:"きらい", romaji:"kirai", meaning:"dislike", category:"general" },
  { kana:"きれい", romaji:"kirei", meaning:"pretty / clean", category:"general" },
  { kana:"くだもの", romaji:"kudamono", meaning:"fruit", category:"general" },
  { kana:"くらい", romaji:"kurai", meaning:"dark / about (approx.)", category:"general" },
  { kana:"くれる", romaji:"kureru", meaning:"to give (to me)", category:"general" },
  { kana:"けしき", romaji:"keshiki", meaning:"scenery", category:"general" },
  { kana:"けむり", romaji:"kemuri", meaning:"smoke", category:"general" },
  { kana:"こころ", romaji:"kokoro", meaning:"heart / mind", category:"general" },
  { kana:"こたえ", romaji:"kotae", meaning:"answer", category:"general" },
  { kana:"こども", romaji:"kodomo", meaning:"child", category:"general" },
  { kana:"こまる", romaji:"komaru", meaning:"to be troubled", category:"general" },
  { kana:"こわい", romaji:"kowai", meaning:"scary", category:"general" },
  { kana:"さがす", romaji:"sagasu", meaning:"to search", category:"general" },
  { kana:"さびしい", romaji:"sabishii", meaning:"lonely", category:"general" },
  { kana:"さよなら", romaji:"sayonara", meaning:"goodbye", category:"general" },
  { kana:"さる", romaji:"saru", meaning:"monkey", category:"general" },
  { kana:"しあわせ", romaji:"shiawase", meaning:"happiness", category:"general" },
  { kana:"しごと", romaji:"shigoto", meaning:"work / job", category:"general" },
  { kana:"しずく", romaji:"shizuku", meaning:"droplet", category:"general" },
  { kana:"した", romaji:"shita", meaning:"below / under", category:"general" },
  { kana:"すごい", romaji:"sugoi", meaning:"amazing / wow", category:"general" },
  { kana:"すずめ", romaji:"suzume", meaning:"sparrow", category:"general" },
  { kana:"せかい", romaji:"sekai", meaning:"world", category:"general" },
  { kana:"そうじ", romaji:"souji", meaning:"cleaning / sweeping", category:"general" },
  { kana:"そと", romaji:"soto", meaning:"outside", category:"general" },
  { kana:"たいこ", romaji:"taiko", meaning:"drum", category:"general" },
  { kana:"たいよう", romaji:"taiyou", meaning:"sun", category:"general" },
  { kana:"たから", romaji:"takara", meaning:"treasure", category:"general" },
  { kana:"たこ", romaji:"tako", meaning:"octopus / kite", category:"general" },
  { kana:"たすける", romaji:"tasukeru", meaning:"to help / to rescue", category:"general" },
  { kana:"ただしい", romaji:"tadashii", meaning:"correct / right", category:"general" },
  { kana:"たびびと", romaji:"tabibito", meaning:"traveller", category:"general" },
  { kana:"たまご", romaji:"tamago", meaning:"egg", category:"general" },
  { kana:"たまねぎ", romaji:"tamanegi", meaning:"onion", category:"general" },
  { kana:"ちかい", romaji:"chikai", meaning:"near / close", category:"general" },
  { kana:"ちかてつ", romaji:"chikatetsu", meaning:"subway", category:"general" },
  { kana:"ちず", romaji:"chizu", meaning:"map", category:"general" },
  { kana:"つくえ", romaji:"tsukue", meaning:"desk", category:"general" },
  { kana:"つばめ", romaji:"tsubame", meaning:"swallow (bird)", category:"general" },
  { kana:"つよい", romaji:"tsuyoi", meaning:"strong", category:"general" },
  { kana:"てがみ", romaji:"tegami", meaning:"letter (mail)", category:"general" },
  { kana:"てんき", romaji:"tenki", meaning:"weather", category:"general" },
  { kana:"とうふ", romaji:"toufu", meaning:"tofu", category:"general" },
  { kana:"とかげ", romaji:"tokage", meaning:"lizard", category:"general" },
  { kana:"としょかん", romaji:"toshokan", meaning:"library", category:"general" },
  { kana:"ともだち", romaji:"tomodachi", meaning:"friend", category:"general" },
  { kana:"とんぼ", romaji:"tonbo", meaning:"dragonfly", category:"general" },
  { kana:"なおす", romaji:"naosu", meaning:"to fix / to cure", category:"general" },
  { kana:"なつかしい", romaji:"natsukashii", meaning:"nostalgic", category:"general" },
  { kana:"なまえ", romaji:"namae", meaning:"name", category:"general" },
  { kana:"ならう", romaji:"narau", meaning:"to learn", category:"general" },
  { kana:"なわ", romaji:"nawa", meaning:"rope", category:"general" },
  { kana:"にじ", romaji:"niji", meaning:"rainbow", category:"general" },
  { kana:"にほん", romaji:"nihon", meaning:"Japan", category:"general" },
  { kana:"ねがい", romaji:"negai", meaning:"wish / hope", category:"general" },
  { kana:"ねむい", romaji:"nemui", meaning:"sleepy", category:"general" },
  { kana:"のむ", romaji:"nomu", meaning:"to drink", category:"general" },
  { kana:"はいる", romaji:"hairu", meaning:"to enter", category:"general" },
  { kana:"はこ", romaji:"hako", meaning:"box", category:"general" },
  { kana:"はじめ", romaji:"hajime", meaning:"beginning", category:"general" },
  { kana:"はたらく", romaji:"hataraku", meaning:"to work", category:"general" },
  { kana:"はなし", romaji:"hanashi", meaning:"story / talk", category:"general" },
  { kana:"はる", romaji:"haru", meaning:"spring", category:"general" },
  { kana:"ひこうき", romaji:"hikouki", meaning:"airplane", category:"general" },
  { kana:"ひだり", romaji:"hidari", meaning:"left", category:"general" },
  { kana:"ひつじ", romaji:"hitsuji", meaning:"sheep", category:"general" },
  { kana:"ひみつ", romaji:"himitsu", meaning:"secret", category:"general" },
  { kana:"ふじさん", romaji:"fujisan", meaning:"Mt. Fuji", category:"general" },
  { kana:"ふたり", romaji:"futari", meaning:"two people", category:"general" },
  { kana:"ふとい", romaji:"futoi", meaning:"fat / thick", category:"general" },
  { kana:"まいにち", romaji:"mainichi", meaning:"every day", category:"general" },
  { kana:"まきずし", romaji:"makizushi", meaning:"rolled sushi", category:"general" },
  { kana:"まくら", romaji:"makura", meaning:"pillow", category:"general" },
  { kana:"まける", romaji:"makeru", meaning:"to lose (a match)", category:"general" },
  { kana:"まつり", romaji:"matsuri", meaning:"festival", category:"general" },
  { kana:"まど", romaji:"mado", meaning:"window", category:"general" },
  { kana:"みぎ", romaji:"migi", meaning:"right", category:"general" },
  { kana:"みじかい", romaji:"mijikai", meaning:"short", category:"general" },
  { kana:"みせ", romaji:"mise", meaning:"shop / store", category:"general" },
  { kana:"みそしる", romaji:"misoshiru", meaning:"miso soup", category:"general" },
  { kana:"みつける", romaji:"mitsukeru", meaning:"to find", category:"general" },
  { kana:"みなと", romaji:"minato", meaning:"harbor / port", category:"general" },
  { kana:"むかし", romaji:"mukashi", meaning:"long ago / old times", category:"general" },
  { kana:"むずかしい", romaji:"muzukashii", meaning:"difficult", category:"general" },
  { kana:"むら", romaji:"mura", meaning:"village", category:"general" },
  { kana:"めがね", romaji:"megane", meaning:"glasses / spectacles", category:"general" },
  { kana:"もみじ", romaji:"momiji", meaning:"autumn leaves / maple", category:"general" },
  { kana:"もも", romaji:"momo", meaning:"peach / thigh", category:"general" },
  { kana:"やさい", romaji:"yasai", meaning:"vegetable", category:"general" },
  { kana:"やさしい", romaji:"yasashii", meaning:"kind / gentle", category:"general" },
  { kana:"やせる", romaji:"yaseru", meaning:"to lose weight / to be thin", category:"general" },
  { kana:"ゆうき", romaji:"yuuki", meaning:"courage", category:"general" },
  { kana:"ゆき", romaji:"yuki", meaning:"snow", category:"general" },
  { kana:"ゆめ", romaji:"yume", meaning:"dream", category:"general" },
  { kana:"よい", romaji:"yoi", meaning:"good", category:"general" },
  { kana:"よこ", romaji:"yoko", meaning:"side / horizontal", category:"general" },
  { kana:"よむ", romaji:"yomu", meaning:"to read", category:"general" },
  { kana:"よる", romaji:"yoru", meaning:"night", category:"general" },
  { kana:"らいねん", romaji:"rainen", meaning:"next year", category:"general" },
  { kana:"りょうり", romaji:"ryouri", meaning:"cooking / cuisine", category:"general" },
  { kana:"れきし", romaji:"rekishi", meaning:"history", category:"general" },
  { kana:"わかる", romaji:"wakaru", meaning:"to understand", category:"general" },
  { kana:"わかれ", romaji:"wakare", meaning:"parting / farewell", category:"general" },
  { kana:"わらう", romaji:"warau", meaning:"to laugh / to smile", category:"general" },
];

// ── N5/N4/N3 Extended Vocabulary ─────────────────────────────────────────────

const VOCAB_PLACES = [
  { kana:"がっこう", romaji:"gakkou", meaning:"school", category:"places" },
  { kana:"びょういん", romaji:"byouin", meaning:"hospital", category:"places" },
  { kana:"ゆうびんきょく", romaji:"yuubinkyoku", meaning:"post office", category:"places" },
  { kana:"ぎんこう", romaji:"ginkou", meaning:"bank", category:"places" },
  { kana:"えき", romaji:"eki", meaning:"train station", category:"places" },
  { kana:"くうこう", romaji:"kuukou", meaning:"airport", category:"places" },
  { kana:"ほてる", romaji:"hoteru", meaning:"hotel", category:"places" },
  { kana:"レストラン", romaji:"resutoran", meaning:"restaurant", category:"places" },
  { kana:"スーパー", romaji:"suupaa", meaning:"supermarket", category:"places" },
  { kana:"コンビニ", romaji:"konbini", meaning:"convenience store", category:"places" },
  { kana:"こうえん", romaji:"kouen", meaning:"park", category:"places" },
  { kana:"としょかん", romaji:"toshokan", meaning:"library", category:"places" },
  { kana:"はくぶつかん", romaji:"hakubutsukan", meaning:"museum", category:"places" },
  { kana:"びじゅつかん", romaji:"bijutsukan", meaning:"art museum", category:"places" },
  { kana:"えいがかん", romaji:"eigakan", meaning:"cinema / movie theater", category:"places" },
  { kana:"おてら", romaji:"otera", meaning:"temple", category:"places" },
  { kana:"じんじゃ", romaji:"jinja", meaning:"shrine", category:"places" },
  { kana:"しろ", romaji:"shiro", meaning:"castle", category:"places" },
  { kana:"うみ", romaji:"umi", meaning:"sea / ocean", category:"places" },
  { kana:"やま", romaji:"yama", meaning:"mountain", category:"places" },
  { kana:"かわ", romaji:"kawa", meaning:"river", category:"places" },
  { kana:"みち", romaji:"michi", meaning:"road / path", category:"places" },
  { kana:"はし", romaji:"hashi", meaning:"bridge", category:"places" },
  { kana:"まち", romaji:"machi", meaning:"town / city", category:"places" },
  { kana:"むら", romaji:"mura", meaning:"village", category:"places" },
  { kana:"にほん", romaji:"nihon", meaning:"Japan", category:"places" },
  { kana:"とうきょう", romaji:"toukyou", meaning:"Tokyo", category:"places" },
  { kana:"おおさか", romaji:"oosaka", meaning:"Osaka", category:"places" },
  { kana:"きょうと", romaji:"kyouto", meaning:"Kyoto", category:"places" },
  { kana:"いえ", romaji:"ie", meaning:"house / home", category:"places" },
  { kana:"へや", romaji:"heya", meaning:"room", category:"places" },
  { kana:"にわ", romaji:"niwa", meaning:"garden", category:"places" },
  { kana:"だいどころ", romaji:"daidokoro", meaning:"kitchen", category:"places" },
  { kana:"トイレ", romaji:"toire", meaning:"toilet / bathroom", category:"places" },
  { kana:"ちかてつ", romaji:"chikatetsu", meaning:"subway", category:"places" },
];

const VOCAB_TRANSPORT = [
  { kana:"でんしゃ", romaji:"densha", meaning:"train", category:"transport" },
  { kana:"バス", romaji:"basu", meaning:"bus", category:"transport" },
  { kana:"タクシー", romaji:"takushii", meaning:"taxi", category:"transport" },
  { kana:"ひこうき", romaji:"hikouki", meaning:"airplane", category:"transport" },
  { kana:"ふね", romaji:"fune", meaning:"ship / boat", category:"transport" },
  { kana:"じてんしゃ", romaji:"jitensha", meaning:"bicycle", category:"transport" },
  { kana:"くるま", romaji:"kuruma", meaning:"car", category:"transport" },
  { kana:"オートバイ", romaji:"ootobai", meaning:"motorcycle", category:"transport" },
  { kana:"しんかんせん", romaji:"shinkansen", meaning:"bullet train", category:"transport" },
  { kana:"ちかてつ", romaji:"chikatetsu", meaning:"subway", category:"transport" },
  { kana:"きっぷ", romaji:"kippu", meaning:"ticket", category:"transport" },
  { kana:"えき", romaji:"eki", meaning:"station", category:"transport" },
  { kana:"のりかえ", romaji:"norikae", meaning:"transfer / connection", category:"transport" },
  { kana:"つぎ", romaji:"tsugi", meaning:"next", category:"transport" },
  { kana:"とまる", romaji:"tomaru", meaning:"to stop", category:"transport" },
];

const VOCAB_SCHOOL = [
  { kana:"せんせい", romaji:"sensei", meaning:"teacher", category:"school" },
  { kana:"がくせい", romaji:"gakusei", meaning:"student", category:"school" },
  { kana:"きょうしつ", romaji:"kyoushitsu", meaning:"classroom", category:"school" },
  { kana:"こくばん", romaji:"kokuban", meaning:"blackboard", category:"school" },
  { kana:"ノート", romaji:"nooto", meaning:"notebook", category:"school" },
  { kana:"えんぴつ", romaji:"enpitsu", meaning:"pencil", category:"school" },
  { kana:"ボールペン", romaji:"boorupen", meaning:"ballpoint pen", category:"school" },
  { kana:"けしごむ", romaji:"keshigomu", meaning:"eraser", category:"school" },
  { kana:"きょうかしょ", romaji:"kyoukasho", meaning:"textbook", category:"school" },
  { kana:"じしょ", romaji:"jisho", meaning:"dictionary", category:"school" },
  { kana:"しゅくだい", romaji:"shukudai", meaning:"homework", category:"school" },
  { kana:"しけん", romaji:"shiken", meaning:"exam / test", category:"school" },
  { kana:"せいと", romaji:"seito", meaning:"pupil / student", category:"school" },
  { kana:"なまえ", romaji:"namae", meaning:"name", category:"school" },
  { kana:"べんきょう", romaji:"benkyou", meaning:"study", category:"school" },
  { kana:"かく", romaji:"kaku", meaning:"to write", category:"school" },
  { kana:"よむ", romaji:"yomu", meaning:"to read", category:"school" },
  { kana:"おしえる", romaji:"oshieru", meaning:"to teach", category:"school" },
  { kana:"ならう", romaji:"narau", meaning:"to learn", category:"school" },
  { kana:"わかる", romaji:"wakaru", meaning:"to understand", category:"school" },
  { kana:"もんだい", romaji:"mondai", meaning:"problem / question", category:"school" },
  { kana:"こたえ", romaji:"kotae", meaning:"answer", category:"school" },
  { kana:"せいかつ", romaji:"seikatsu", meaning:"life / living", category:"school" },
  { kana:"クラス", romaji:"kurasu", meaning:"class", category:"school" },
  { kana:"そつぎょう", romaji:"sotsugyou", meaning:"graduation", category:"school" },
];

const VOCAB_WEATHER = [
  { kana:"てんき", romaji:"tenki", meaning:"weather", category:"weather" },
  { kana:"はれ", romaji:"hare", meaning:"sunny / clear", category:"weather" },
  { kana:"くもり", romaji:"kumori", meaning:"cloudy", category:"weather" },
  { kana:"あめ", romaji:"ame", meaning:"rain", category:"weather" },
  { kana:"ゆき", romaji:"yuki", meaning:"snow", category:"weather" },
  { kana:"かぜ", romaji:"kaze", meaning:"wind", category:"weather" },
  { kana:"かみなり", romaji:"kaminari", meaning:"thunder / lightning", category:"weather" },
  { kana:"たいふう", romaji:"taifuu", meaning:"typhoon", category:"weather" },
  { kana:"にじ", romaji:"niji", meaning:"rainbow", category:"weather" },
  { kana:"きり", romaji:"kiri", meaning:"fog / mist", category:"weather" },
  { kana:"あつい", romaji:"atsui", meaning:"hot", category:"weather" },
  { kana:"さむい", romaji:"samui", meaning:"cold", category:"weather" },
  { kana:"あたたかい", romaji:"atatakai", meaning:"warm", category:"weather" },
  { kana:"すずしい", romaji:"suzushii", meaning:"cool", category:"weather" },
  { kana:"きおん", romaji:"kion", meaning:"temperature", category:"weather" },
  { kana:"しつど", romaji:"shitsudo", meaning:"humidity", category:"weather" },
  { kana:"きせつ", romaji:"kisetsu", meaning:"season", category:"weather" },
  { kana:"はる", romaji:"haru", meaning:"spring", category:"weather" },
  { kana:"なつ", romaji:"natsu", meaning:"summer", category:"weather" },
  { kana:"あき", romaji:"aki", meaning:"autumn / fall", category:"weather" },
  { kana:"ふゆ", romaji:"fuyu", meaning:"winter", category:"weather" },
];

const VOCAB_EMOTIONS = [
  { kana:"うれしい", romaji:"ureshii", meaning:"happy / glad", category:"emotions" },
  { kana:"かなしい", romaji:"kanashii", meaning:"sad", category:"emotions" },
  { kana:"たのしい", romaji:"tanoshii", meaning:"fun / enjoyable", category:"emotions" },
  { kana:"こわい", romaji:"kowai", meaning:"scary / afraid", category:"emotions" },
  { kana:"おかしい", romaji:"okashii", meaning:"funny / strange", category:"emotions" },
  { kana:"はずかしい", romaji:"hazukashii", meaning:"embarrassed / shy", category:"emotions" },
  { kana:"さびしい", romaji:"sabishii", meaning:"lonely", category:"emotions" },
  { kana:"しあわせ", romaji:"shiawase", meaning:"happiness / happy", category:"emotions" },
  { kana:"かなしみ", romaji:"kanashimi", meaning:"sadness", category:"emotions" },
  { kana:"おこる", romaji:"okoru", meaning:"to get angry", category:"emotions" },
  { kana:"なく", romaji:"naku", meaning:"to cry", category:"emotions" },
  { kana:"わらう", romaji:"warau", meaning:"to laugh / smile", category:"emotions" },
  { kana:"びっくり", romaji:"bikkuri", meaning:"surprised / startled", category:"emotions" },
  { kana:"しんぱい", romaji:"shinpai", meaning:"worry / concern", category:"emotions" },
  { kana:"あんしん", romaji:"anshin", meaning:"relief / peace of mind", category:"emotions" },
  { kana:"きぶん", romaji:"kibun", meaning:"feeling / mood", category:"emotions" },
  { kana:"すき", romaji:"suki", meaning:"like / fond of", category:"emotions" },
  { kana:"きらい", romaji:"kirai", meaning:"dislike", category:"emotions" },
  { kana:"あい", romaji:"ai", meaning:"love", category:"emotions" },
  { kana:"いかり", romaji:"ikari", meaning:"anger", category:"emotions" },
  { kana:"おどろく", romaji:"odoroku", meaning:"to be surprised", category:"emotions" },
  { kana:"ねむい", romaji:"nemui", meaning:"sleepy", category:"emotions" },
  { kana:"つかれた", romaji:"tsukareta", meaning:"tired", category:"emotions" },
  { kana:"いたい", romaji:"itai", meaning:"painful / hurts", category:"emotions" },
];

const VOCAB_SHOPPING = [
  { kana:"かう", romaji:"kau", meaning:"to buy", category:"shopping" },
  { kana:"うる", romaji:"uru", meaning:"to sell", category:"shopping" },
  { kana:"たかい", romaji:"takai", meaning:"expensive", category:"shopping" },
  { kana:"やすい", romaji:"yasui", meaning:"cheap", category:"shopping" },
  { kana:"いくら", romaji:"ikura", meaning:"how much?", category:"shopping" },
  { kana:"おかね", romaji:"okane", meaning:"money", category:"shopping" },
  { kana:"さいふ", romaji:"saifu", meaning:"wallet", category:"shopping" },
  { kana:"クレジットカード", romaji:"kurejittokado", meaning:"credit card", category:"shopping" },
  { kana:"レシート", romaji:"reshiito", meaning:"receipt", category:"shopping" },
  { kana:"ふくろ", romaji:"fukuro", meaning:"bag", category:"shopping" },
  { kana:"えん", romaji:"en", meaning:"yen (¥)", category:"shopping" },
  { kana:"おつり", romaji:"otsuri", meaning:"change (money)", category:"shopping" },
  { kana:"セール", romaji:"seeru", meaning:"sale", category:"shopping" },
  { kana:"わりびき", romaji:"waribiki", meaning:"discount", category:"shopping" },
  { kana:"みせ", romaji:"mise", meaning:"shop / store", category:"shopping" },
  { kana:"デパート", romaji:"depaato", meaning:"department store", category:"shopping" },
  { kana:"ふく", romaji:"fuku", meaning:"clothes", category:"shopping" },
  { kana:"くつ", romaji:"kutsu", meaning:"shoes", category:"shopping" },
  { kana:"ぼうし", romaji:"boushi", meaning:"hat", category:"shopping" },
  { kana:"かばん", romaji:"kaban", meaning:"bag / briefcase", category:"shopping" },
  { kana:"とけい", romaji:"tokei", meaning:"watch / clock", category:"shopping" },
  { kana:"めがね", romaji:"megane", meaning:"glasses", category:"shopping" },
];

const VOCAB_HEALTH = [
  { kana:"びょうき", romaji:"byouki", meaning:"illness / sick", category:"health" },
  { kana:"かぜ", romaji:"kaze", meaning:"cold (illness)", category:"health" },
  { kana:"ねつ", romaji:"netsu", meaning:"fever", category:"health" },
  { kana:"いたい", romaji:"itai", meaning:"painful", category:"health" },
  { kana:"くすり", romaji:"kusuri", meaning:"medicine", category:"health" },
  { kana:"びょういん", romaji:"byouin", meaning:"hospital", category:"health" },
  { kana:"いしゃ", romaji:"isha", meaning:"doctor", category:"health" },
  { kana:"かんごし", romaji:"kangoshi", meaning:"nurse", category:"health" },
  { kana:"けが", romaji:"kega", meaning:"injury / wound", category:"health" },
  { kana:"きず", romaji:"kizu", meaning:"wound / scar", category:"health" },
  { kana:"せき", romaji:"seki", meaning:"cough", category:"health" },
  { kana:"はな", romaji:"hana", meaning:"nose", category:"health" },
  { kana:"のど", romaji:"nodo", meaning:"throat", category:"health" },
  { kana:"おなか", romaji:"onaka", meaning:"stomach", category:"health" },
  { kana:"あたま", romaji:"atama", meaning:"head", category:"health" },
  { kana:"めまい", romaji:"memai", meaning:"dizziness", category:"health" },
  { kana:"アレルギー", romaji:"arerugii", meaning:"allergy", category:"health" },
  { kana:"しんさつ", romaji:"shinsatsu", meaning:"medical examination", category:"health" },
  { kana:"けんこう", romaji:"kenkou", meaning:"health", category:"health" },
  { kana:"うんどう", romaji:"undou", meaning:"exercise / sport", category:"health" },
  { kana:"やすむ", romaji:"yasumu", meaning:"to rest", category:"health" },
  { kana:"ねる", romaji:"neru", meaning:"to sleep", category:"health" },
];

const VOCAB_WORK = [
  { kana:"しごと", romaji:"shigoto", meaning:"work / job", category:"work" },
  { kana:"かいしゃ", romaji:"kaisha", meaning:"company", category:"work" },
  { kana:"かいぎ", romaji:"kaigi", meaning:"meeting", category:"work" },
  { kana:"しゃちょう", romaji:"shachou", meaning:"company president", category:"work" },
  { kana:"かかりちょう", romaji:"kakarichou", meaning:"section chief", category:"work" },
  { kana:"どうりょう", romaji:"douryou", meaning:"colleague", category:"work" },
  { kana:"きゅうりょう", romaji:"kyuuryou", meaning:"salary", category:"work" },
  { kana:"つうきん", romaji:"tsuukin", meaning:"commute", category:"work" },
  { kana:"やすみ", romaji:"yasumi", meaning:"day off / rest", category:"work" },
  { kana:"しゅっちょう", romaji:"shutchou", meaning:"business trip", category:"work" },
  { kana:"メール", romaji:"meeru", meaning:"email", category:"work" },
  { kana:"パソコン", romaji:"pasokon", meaning:"computer (PC)", category:"work" },
  { kana:"プロジェクト", romaji:"purojekuto", meaning:"project", category:"work" },
  { kana:"しめきり", romaji:"shimekiri", meaning:"deadline", category:"work" },
  { kana:"でんわ", romaji:"denwa", meaning:"phone call / telephone", category:"work" },
  { kana:"はたらく", romaji:"hataraku", meaning:"to work", category:"work" },
  { kana:"やめる", romaji:"yameru", meaning:"to quit", category:"work" },
  { kana:"さぎょう", romaji:"sagyou", meaning:"task / operation", category:"work" },
  { kana:"けいけん", romaji:"keiken", meaning:"experience", category:"work" },
  { kana:"しかく", romaji:"shikaku", meaning:"qualification", category:"work" },
];

const VOCAB_DAILY = [
  { kana:"おきる", romaji:"okiru", meaning:"to wake up", category:"daily" },
  { kana:"ねる", romaji:"neru", meaning:"to sleep / go to bed", category:"daily" },
  { kana:"あさごはん", romaji:"asagohan", meaning:"breakfast", category:"daily" },
  { kana:"ひるごはん", romaji:"hirugohan", meaning:"lunch", category:"daily" },
  { kana:"ばんごはん", romaji:"bangohan", meaning:"dinner", category:"daily" },
  { kana:"はをみがく", romaji:"ha wo migaku", meaning:"to brush teeth", category:"daily" },
  { kana:"かおをあらう", romaji:"kao wo arau", meaning:"to wash face", category:"daily" },
  { kana:"シャワー", romaji:"shawaa", meaning:"shower", category:"daily" },
  { kana:"おふろ", romaji:"ofuro", meaning:"bath", category:"daily" },
  { kana:"きがえる", romaji:"kigaeru", meaning:"to change clothes", category:"daily" },
  { kana:"でかける", romaji:"dekakeru", meaning:"to go out", category:"daily" },
  { kana:"かえる", romaji:"kaeru", meaning:"to return home", category:"daily" },
  { kana:"そうじ", romaji:"souji", meaning:"cleaning", category:"daily" },
  { kana:"せんたく", romaji:"sentaku", meaning:"laundry", category:"daily" },
  { kana:"りょうり", romaji:"ryouri", meaning:"cooking", category:"daily" },
  { kana:"かいもの", romaji:"kaimono", meaning:"shopping", category:"daily" },
  { kana:"テレビ", romaji:"terebi", meaning:"television", category:"daily" },
  { kana:"スマホ", romaji:"sumaho", meaning:"smartphone", category:"daily" },
  { kana:"インターネット", romaji:"intaanetto", meaning:"internet", category:"daily" },
  { kana:"おんがく", romaji:"ongaku", meaning:"music", category:"daily" },
  { kana:"えいが", romaji:"eiga", meaning:"movie", category:"daily" },
  { kana:"ほん", romaji:"hon", meaning:"book", category:"daily" },
  { kana:"しんぶん", romaji:"shinbun", meaning:"newspaper", category:"daily" },
  { kana:"でんき", romaji:"denki", meaning:"electricity / light", category:"daily" },
  { kana:"みず", romaji:"mizu", meaning:"water", category:"daily" },
  { kana:"ゴミ", romaji:"gomi", meaning:"trash / garbage", category:"daily" },
];

const VOCAB_DIRECTIONS = [
  { kana:"みぎ", romaji:"migi", meaning:"right", category:"directions" },
  { kana:"ひだり", romaji:"hidari", meaning:"left", category:"directions" },
  { kana:"まえ", romaji:"mae", meaning:"front / before", category:"directions" },
  { kana:"うしろ", romaji:"ushiro", meaning:"behind / back", category:"directions" },
  { kana:"うえ", romaji:"ue", meaning:"above / up", category:"directions" },
  { kana:"した", romaji:"shita", meaning:"below / down", category:"directions" },
  { kana:"なか", romaji:"naka", meaning:"inside / middle", category:"directions" },
  { kana:"そと", romaji:"soto", meaning:"outside", category:"directions" },
  { kana:"ちかく", romaji:"chikaku", meaning:"nearby / close", category:"directions" },
  { kana:"とおく", romaji:"tooku", meaning:"far away", category:"directions" },
  { kana:"きた", romaji:"kita", meaning:"north", category:"directions" },
  { kana:"みなみ", romaji:"minami", meaning:"south", category:"directions" },
  { kana:"ひがし", romaji:"higashi", meaning:"east", category:"directions" },
  { kana:"にし", romaji:"nishi", meaning:"west", category:"directions" },
  { kana:"まっすぐ", romaji:"massugu", meaning:"straight ahead", category:"directions" },
  { kana:"まがる", romaji:"magaru", meaning:"to turn", category:"directions" },
  { kana:"わたる", romaji:"wataru", meaning:"to cross", category:"directions" },
  { kana:"こうさてん", romaji:"kousaten", meaning:"intersection", category:"directions" },
  { kana:"しんごう", romaji:"shingou", meaning:"traffic light", category:"directions" },
  { kana:"かど", romaji:"kado", meaning:"corner", category:"directions" },
];

const VOCAB_HOBBIES = [
  { kana:"しゅみ", romaji:"shumi", meaning:"hobby", category:"hobbies" },
  { kana:"スポーツ", romaji:"supootsu", meaning:"sports", category:"hobbies" },
  { kana:"サッカー", romaji:"sakkaa", meaning:"soccer / football", category:"hobbies" },
  { kana:"やきゅう", romaji:"yakyuu", meaning:"baseball", category:"hobbies" },
  { kana:"テニス", romaji:"tenisu", meaning:"tennis", category:"hobbies" },
  { kana:"バスケットボール", romaji:"basukettoboru", meaning:"basketball", category:"hobbies" },
  { kana:"およぐ", romaji:"oyogu", meaning:"to swim", category:"hobbies" },
  { kana:"はしる", romaji:"hashiru", meaning:"to run", category:"hobbies" },
  { kana:"うたう", romaji:"utau", meaning:"to sing", category:"hobbies" },
  { kana:"えをかく", romaji:"e wo kaku", meaning:"to draw / paint", category:"hobbies" },
  { kana:"りょこう", romaji:"ryokou", meaning:"travel", category:"hobbies" },
  { kana:"しゃしん", romaji:"shashin", meaning:"photo / photograph", category:"hobbies" },
  { kana:"ゲーム", romaji:"geemu", meaning:"game", category:"hobbies" },
  { kana:"アニメ", romaji:"anime", meaning:"anime", category:"hobbies" },
  { kana:"まんが", romaji:"manga", meaning:"manga / comic", category:"hobbies" },
  { kana:"おんがく", romaji:"ongaku", meaning:"music", category:"hobbies" },
  { kana:"ダンス", romaji:"dansu", meaning:"dance", category:"hobbies" },
  { kana:"りょうり", romaji:"ryouri", meaning:"cooking", category:"hobbies" },
  { kana:"つり", romaji:"tsuri", meaning:"fishing", category:"hobbies" },
  { kana:"ハイキング", romaji:"haikingu", meaning:"hiking", category:"hobbies" },
  { kana:"よむ", romaji:"yomu", meaning:"to read", category:"hobbies" },
  { kana:"かく", romaji:"kaku", meaning:"to write", category:"hobbies" },
];

const VOCAB_NATURE = [
  { kana:"そら", romaji:"sora", meaning:"sky", category:"nature" },
  { kana:"たいよう", romaji:"taiyou", meaning:"sun", category:"nature" },
  { kana:"つき", romaji:"tsuki", meaning:"moon", category:"nature" },
  { kana:"ほし", romaji:"hoshi", meaning:"star", category:"nature" },
  { kana:"くも", romaji:"kumo", meaning:"cloud", category:"nature" },
  { kana:"うみ", romaji:"umi", meaning:"sea / ocean", category:"nature" },
  { kana:"かわ", romaji:"kawa", meaning:"river", category:"nature" },
  { kana:"みずうみ", romaji:"mizuumi", meaning:"lake", category:"nature" },
  { kana:"やま", romaji:"yama", meaning:"mountain", category:"nature" },
  { kana:"もり", romaji:"mori", meaning:"forest", category:"nature" },
  { kana:"き", romaji:"ki", meaning:"tree", category:"nature" },
  { kana:"はな", romaji:"hana", meaning:"flower", category:"nature" },
  { kana:"くさ", romaji:"kusa", meaning:"grass", category:"nature" },
  { kana:"はっぱ", romaji:"happa", meaning:"leaf", category:"nature" },
  { kana:"いし", romaji:"ishi", meaning:"stone / rock", category:"nature" },
  { kana:"つち", romaji:"tsuchi", meaning:"soil / earth", category:"nature" },
  { kana:"すな", romaji:"suna", meaning:"sand", category:"nature" },
  { kana:"かぜ", romaji:"kaze", meaning:"wind", category:"nature" },
  { kana:"なみ", romaji:"nami", meaning:"wave", category:"nature" },
  { kana:"たき", romaji:"taki", meaning:"waterfall", category:"nature" },
  { kana:"じしん", romaji:"jishin", meaning:"earthquake", category:"nature" },
  { kana:"かざん", romaji:"kazan", meaning:"volcano", category:"nature" },
  { kana:"しぜん", romaji:"shizen", meaning:"nature", category:"nature" },
  { kana:"かんきょう", romaji:"kankyou", meaning:"environment", category:"nature" },
];

const VOCAB_FOOD2 = [
  { kana:"やきとり", romaji:"yakitori", meaning:"grilled chicken skewer", category:"food" },
  { kana:"おこのみやき", romaji:"okonomiyaki", meaning:"savory pancake", category:"food" },
  { kana:"たこやき", romaji:"takoyaki", meaning:"octopus balls", category:"food" },
  { kana:"やきそば", romaji:"yakisoba", meaning:"fried noodles", category:"food" },
  { kana:"どんぶり", romaji:"donburi", meaning:"rice bowl dish", category:"food" },
  { kana:"カレー", romaji:"karee", meaning:"curry", category:"food" },
  { kana:"ステーキ", romaji:"suteeki", meaning:"steak", category:"food" },
  { kana:"ピザ", romaji:"piza", meaning:"pizza", category:"food" },
  { kana:"サンドイッチ", romaji:"sandoicchi", meaning:"sandwich", category:"food" },
  { kana:"ケーキ", romaji:"keeki", meaning:"cake", category:"food" },
  { kana:"アイスクリーム", romaji:"aisukuriimu", meaning:"ice cream", category:"food" },
  { kana:"チョコレート", romaji:"chokoreeto", meaning:"chocolate", category:"food" },
  { kana:"キャンディ", romaji:"kyandi", meaning:"candy", category:"food" },
  { kana:"ジュース", romaji:"juusu", meaning:"juice", category:"food" },
  { kana:"ビール", romaji:"biiru", meaning:"beer", category:"food" },
  { kana:"ワイン", romaji:"wain", meaning:"wine", category:"food" },
  { kana:"にんじん", romaji:"ninjin", meaning:"carrot", category:"food" },
  { kana:"じゃがいも", romaji:"jagaimo", meaning:"potato", category:"food" },
  { kana:"たまねぎ", romaji:"tamanegi", meaning:"onion", category:"food" },
  { kana:"キャベツ", romaji:"kyabetsu", meaning:"cabbage", category:"food" },
  { kana:"トマト", romaji:"tomato", meaning:"tomato", category:"food" },
  { kana:"きゅうり", romaji:"kyuuri", meaning:"cucumber", category:"food" },
  { kana:"りんご", romaji:"ringo", meaning:"apple", category:"food" },
  { kana:"バナナ", romaji:"banana", meaning:"banana", category:"food" },
  { kana:"いちご", romaji:"ichigo", meaning:"strawberry", category:"food" },
  { kana:"みかん", romaji:"mikan", meaning:"mandarin orange", category:"food" },
  { kana:"ぶどう", romaji:"budou", meaning:"grape", category:"food" },
  { kana:"すいか", romaji:"suika", meaning:"watermelon", category:"food" },
];

const VOCAB_VERBS2 = [
  { kana:"あるく", romaji:"aruku", meaning:"to walk", category:"verbs" },
  { kana:"はしる", romaji:"hashiru", meaning:"to run", category:"verbs" },
  { kana:"とぶ", romaji:"tobu", meaning:"to fly / jump", category:"verbs" },
  { kana:"およぐ", romaji:"oyogu", meaning:"to swim", category:"verbs" },
  { kana:"のる", romaji:"noru", meaning:"to ride / board", category:"verbs" },
  { kana:"おりる", romaji:"oriru", meaning:"to get off / descend", category:"verbs" },
  { kana:"あける", romaji:"akeru", meaning:"to open", category:"verbs" },
  { kana:"しめる", romaji:"shimeru", meaning:"to close", category:"verbs" },
  { kana:"おす", romaji:"osu", meaning:"to push", category:"verbs" },
  { kana:"ひく", romaji:"hiku", meaning:"to pull", category:"verbs" },
  { kana:"つかう", romaji:"tsukau", meaning:"to use", category:"verbs" },
  { kana:"もつ", romaji:"motsu", meaning:"to hold / carry", category:"verbs" },
  { kana:"おく", romaji:"oku", meaning:"to put / place", category:"verbs" },
  { kana:"とる", romaji:"toru", meaning:"to take", category:"verbs" },
  { kana:"あげる", romaji:"ageru", meaning:"to give (to others)", category:"verbs" },
  { kana:"もらう", romaji:"morau", meaning:"to receive", category:"verbs" },
  { kana:"かりる", romaji:"kariru", meaning:"to borrow", category:"verbs" },
  { kana:"かす", romaji:"kasu", meaning:"to lend", category:"verbs" },
  { kana:"みせる", romaji:"miseru", meaning:"to show", category:"verbs" },
  { kana:"きめる", romaji:"kimeru", meaning:"to decide", category:"verbs" },
  { kana:"かんがえる", romaji:"kangaeru", meaning:"to think / consider", category:"verbs" },
  { kana:"おもう", romaji:"omou", meaning:"to think / feel", category:"verbs" },
  { kana:"しる", romaji:"shiru", meaning:"to know", category:"verbs" },
  { kana:"わすれる", romaji:"wasureru", meaning:"to forget", category:"verbs" },
  { kana:"おぼえる", romaji:"oboeru", meaning:"to remember / memorize", category:"verbs" },
  { kana:"みつける", romaji:"mitsukeru", meaning:"to find", category:"verbs" },
  { kana:"なくす", romaji:"nakusu", meaning:"to lose (something)", category:"verbs" },
  { kana:"つくる", romaji:"tsukuru", meaning:"to make / create", category:"verbs" },
  { kana:"こわす", romaji:"kowasu", meaning:"to break", category:"verbs" },
  { kana:"なおす", romaji:"naosu", meaning:"to fix / repair", category:"verbs" },
  { kana:"きる", romaji:"kiru", meaning:"to cut", category:"verbs" },
  { kana:"かざる", romaji:"kazaru", meaning:"to decorate", category:"verbs" },
  { kana:"はじめる", romaji:"hajimeru", meaning:"to start / begin", category:"verbs" },
  { kana:"おわる", romaji:"owaru", meaning:"to end / finish", category:"verbs" },
  { kana:"つづける", romaji:"tsuzukeru", meaning:"to continue", category:"verbs" },
  { kana:"やめる", romaji:"yameru", meaning:"to stop / quit", category:"verbs" },
  { kana:"かえる", romaji:"kaeru", meaning:"to change", category:"verbs" },
  { kana:"みがく", romaji:"migaku", meaning:"to polish / brush", category:"verbs" },
  { kana:"あらう", romaji:"arau", meaning:"to wash", category:"verbs" },
  { kana:"そうじする", romaji:"souji suru", meaning:"to clean", category:"verbs" },
  { kana:"りょうりする", romaji:"ryouri suru", meaning:"to cook", category:"verbs" },
  { kana:"でんわする", romaji:"denwa suru", meaning:"to call (phone)", category:"verbs" },
  { kana:"でかける", romaji:"dekakeru", meaning:"to go out", category:"verbs" },
  { kana:"あそぶ", romaji:"asobu", meaning:"to play / hang out", category:"verbs" },
  { kana:"はたらく", romaji:"hataraku", meaning:"to work", category:"verbs" },
  { kana:"やすむ", romaji:"yasumu", meaning:"to rest", category:"verbs" },
  { kana:"まつ", romaji:"matsu", meaning:"to wait", category:"verbs" },
  { kana:"あう", romaji:"au", meaning:"to meet", category:"verbs" },
  { kana:"はなす", romaji:"hanasu", meaning:"to talk / speak", category:"verbs" },
  { kana:"きく", romaji:"kiku", meaning:"to listen / ask", category:"verbs" },
];

const VOCAB_ADJECTIVES2 = [
  { kana:"ひろい", romaji:"hiroi", meaning:"wide / spacious", category:"adjectives" },
  { kana:"せまい", romaji:"semai", meaning:"narrow / small (space)", category:"adjectives" },
  { kana:"ながい", romaji:"nagai", meaning:"long", category:"adjectives" },
  { kana:"みじかい", romaji:"mijikai", meaning:"short (length)", category:"adjectives" },
  { kana:"おもい", romaji:"omoi", meaning:"heavy", category:"adjectives" },
  { kana:"かるい", romaji:"karui", meaning:"light (weight)", category:"adjectives" },
  { kana:"あかるい", romaji:"akarui", meaning:"bright / cheerful", category:"adjectives" },
  { kana:"くらい", romaji:"kurai", meaning:"dark", category:"adjectives" },
  { kana:"うるさい", romaji:"urusai", meaning:"noisy / annoying", category:"adjectives" },
  { kana:"しずか", romaji:"shizuka", meaning:"quiet / calm", category:"adjectives" },
  { kana:"つよい", romaji:"tsuyoi", meaning:"strong", category:"adjectives" },
  { kana:"よわい", romaji:"yowai", meaning:"weak", category:"adjectives" },
  { kana:"やわらかい", romaji:"yawarakai", meaning:"soft", category:"adjectives" },
  { kana:"かたい", romaji:"katai", meaning:"hard / firm", category:"adjectives" },
  { kana:"あまい", romaji:"amai", meaning:"sweet", category:"adjectives" },
  { kana:"からい", romaji:"karai", meaning:"spicy / salty", category:"adjectives" },
  { kana:"すっぱい", romaji:"suppai", meaning:"sour", category:"adjectives" },
  { kana:"にがい", romaji:"nigai", meaning:"bitter", category:"adjectives" },
  { kana:"おいしい", romaji:"oishii", meaning:"delicious", category:"adjectives" },
  { kana:"まずい", romaji:"mazui", meaning:"bad-tasting / bad", category:"adjectives" },
  { kana:"きたない", romaji:"kitanai", meaning:"dirty", category:"adjectives" },
  { kana:"きれい", romaji:"kirei", meaning:"clean / beautiful", category:"adjectives" },
  { kana:"すごい", romaji:"sugoi", meaning:"amazing / wow", category:"adjectives" },
  { kana:"ひどい", romaji:"hidoi", meaning:"terrible / awful", category:"adjectives" },
  { kana:"すばらしい", romaji:"subarashii", meaning:"wonderful / splendid", category:"adjectives" },
  { kana:"たいせつ", romaji:"taisetsu", meaning:"important / precious", category:"adjectives" },
  { kana:"むずかしい", romaji:"muzukashii", meaning:"difficult", category:"adjectives" },
  { kana:"かんたん", romaji:"kantan", meaning:"easy / simple", category:"adjectives" },
  { kana:"べんり", romaji:"benri", meaning:"convenient / handy", category:"adjectives" },
  { kana:"ふべん", romaji:"fuben", meaning:"inconvenient", category:"adjectives" },
  { kana:"たいくつ", romaji:"taikutsu", meaning:"boring", category:"adjectives" },
  { kana:"いそがしい", romaji:"isogashii", meaning:"busy", category:"adjectives" },
  { kana:"ひま", romaji:"hima", meaning:"free / not busy", category:"adjectives" },
  { kana:"あぶない", romaji:"abunai", meaning:"dangerous", category:"adjectives" },
  { kana:"あんぜん", romaji:"anzen", meaning:"safe", category:"adjectives" },
];

const VOCAB_PARTICLES = [
  { kana:"は", romaji:"wa", meaning:"topic marker particle", category:"particles" },
  { kana:"が", romaji:"ga", meaning:"subject marker particle", category:"particles" },
  { kana:"を", romaji:"wo/o", meaning:"object marker particle", category:"particles" },
  { kana:"に", romaji:"ni", meaning:"direction / time / location particle", category:"particles" },
  { kana:"で", romaji:"de", meaning:"location (action) / by means of particle", category:"particles" },
  { kana:"へ", romaji:"e", meaning:"direction particle", category:"particles" },
  { kana:"と", romaji:"to", meaning:"and / with particle", category:"particles" },
  { kana:"も", romaji:"mo", meaning:"also / too particle", category:"particles" },
  { kana:"の", romaji:"no", meaning:"possessive / noun modifier particle", category:"particles" },
  { kana:"か", romaji:"ka", meaning:"question marker particle", category:"particles" },
  { kana:"ね", romaji:"ne", meaning:"right? / isn't it? (seeking agreement)", category:"particles" },
  { kana:"よ", romaji:"yo", meaning:"emphasis / assertion particle", category:"particles" },
  { kana:"から", romaji:"kara", meaning:"from / because", category:"particles" },
  { kana:"まで", romaji:"made", meaning:"until / as far as", category:"particles" },
  { kana:"より", romaji:"yori", meaning:"than / from (comparison)", category:"particles" },
];

const VOCAB_EXPRESSIONS = [
  { kana:"いただきます", romaji:"itadakimasu", meaning:"said before eating (bon appétit)", category:"expressions" },
  { kana:"ごちそうさま", romaji:"gochisousama", meaning:"said after eating (thanks for the meal)", category:"expressions" },
  { kana:"おねがいします", romaji:"onegaishimasu", meaning:"please (request)", category:"expressions" },
  { kana:"どうもありがとう", romaji:"doumo arigatou", meaning:"thank you very much", category:"expressions" },
  { kana:"どういたしまして", romaji:"douitashimashite", meaning:"you're welcome", category:"expressions" },
  { kana:"わかりました", romaji:"wakarimashita", meaning:"I understand / understood", category:"expressions" },
  { kana:"わかりません", romaji:"wakarimasen", meaning:"I don't understand", category:"expressions" },
  { kana:"もういちど", romaji:"mou ichido", meaning:"one more time / again", category:"expressions" },
  { kana:"ゆっくり", romaji:"yukkuri", meaning:"slowly", category:"expressions" },
  { kana:"もっと", romaji:"motto", meaning:"more", category:"expressions" },
  { kana:"すこし", romaji:"sukoshi", meaning:"a little / a bit", category:"expressions" },
  { kana:"たくさん", romaji:"takusan", meaning:"a lot / many", category:"expressions" },
  { kana:"だいじょうぶ", romaji:"daijoubu", meaning:"it's okay / no problem", category:"expressions" },
  { kana:"きをつけて", romaji:"ki wo tsukete", meaning:"take care / be careful", category:"expressions" },
  { kana:"がんばって", romaji:"ganbatte", meaning:"do your best / good luck", category:"expressions" },
  { kana:"よかった", romaji:"yokatta", meaning:"that's good / I'm glad", category:"expressions" },
  { kana:"ざんねん", romaji:"zannen", meaning:"what a shame / unfortunate", category:"expressions" },
  { kana:"ほんとう", romaji:"hontou", meaning:"really / truly", category:"expressions" },
  { kana:"もちろん", romaji:"mochiron", meaning:"of course", category:"expressions" },
  { kana:"たぶん", romaji:"tabun", meaning:"probably / maybe", category:"expressions" },
  { kana:"だから", romaji:"dakara", meaning:"so / therefore / that's why", category:"expressions" },
  { kana:"でも", romaji:"demo", meaning:"but / however", category:"expressions" },
  { kana:"そして", romaji:"soshite", meaning:"and then / and", category:"expressions" },
  { kana:"それから", romaji:"sorekara", meaning:"after that / and then", category:"expressions" },
  { kana:"ところで", romaji:"tokorode", meaning:"by the way", category:"expressions" },
];

const VOCAB_COUNTERS = [
  { kana:"ひとつ", romaji:"hitotsu", meaning:"one (general counter)", category:"counters" },
  { kana:"ふたつ", romaji:"futatsu", meaning:"two (general counter)", category:"counters" },
  { kana:"みっつ", romaji:"mittsu", meaning:"three (general counter)", category:"counters" },
  { kana:"よっつ", romaji:"yottsu", meaning:"four (general counter)", category:"counters" },
  { kana:"いつつ", romaji:"itsutsu", meaning:"five (general counter)", category:"counters" },
  { kana:"むっつ", romaji:"muttsu", meaning:"six (general counter)", category:"counters" },
  { kana:"ななつ", romaji:"nanatsu", meaning:"seven (general counter)", category:"counters" },
  { kana:"やっつ", romaji:"yattsu", meaning:"eight (general counter)", category:"counters" },
  { kana:"ここのつ", romaji:"kokonotsu", meaning:"nine (general counter)", category:"counters" },
  { kana:"とお", romaji:"too", meaning:"ten (general counter)", category:"counters" },
  { kana:"いちにち", romaji:"ichinichi", meaning:"one day", category:"counters" },
  { kana:"ふつか", romaji:"futsuka", meaning:"two days / 2nd of month", category:"counters" },
  { kana:"みっか", romaji:"mikka", meaning:"three days / 3rd of month", category:"counters" },
  { kana:"ようか", romaji:"youka", meaning:"eight days / 8th of month", category:"counters" },
  { kana:"はつか", romaji:"hatsuka", meaning:"twenty days / 20th of month", category:"counters" },
  { kana:"いちじ", romaji:"ichiji", meaning:"one o'clock", category:"counters" },
  { kana:"にじ", romaji:"niji", meaning:"two o'clock", category:"counters" },
  { kana:"さんじ", romaji:"sanji", meaning:"three o'clock", category:"counters" },
  { kana:"ふん/ぷん", romaji:"fun/pun", meaning:"minutes counter", category:"counters" },
  { kana:"じかん", romaji:"jikan", meaning:"hours / time", category:"counters" },
];

const VOCAB_PRONOUNS = [
  { kana:"わたし", romaji:"watashi", meaning:"I / me (formal)", category:"pronouns" },
  { kana:"ぼく", romaji:"boku", meaning:"I / me (male, casual)", category:"pronouns" },
  { kana:"おれ", romaji:"ore", meaning:"I / me (male, rough)", category:"pronouns" },
  { kana:"あなた", romaji:"anata", meaning:"you (formal)", category:"pronouns" },
  { kana:"きみ", romaji:"kimi", meaning:"you (casual, male usage)", category:"pronouns" },
  { kana:"かれ", romaji:"kare", meaning:"he / him / boyfriend", category:"pronouns" },
  { kana:"かのじょ", romaji:"kanojo", meaning:"she / her / girlfriend", category:"pronouns" },
  { kana:"わたしたち", romaji:"watashitachi", meaning:"we / us", category:"pronouns" },
  { kana:"かれら", romaji:"karera", meaning:"they / them", category:"pronouns" },
  { kana:"みんな", romaji:"minna", meaning:"everyone / all", category:"pronouns" },
  { kana:"だれ", romaji:"dare", meaning:"who?", category:"pronouns" },
  { kana:"なに", romaji:"nani", meaning:"what?", category:"pronouns" },
  { kana:"どこ", romaji:"doko", meaning:"where?", category:"pronouns" },
  { kana:"いつ", romaji:"itsu", meaning:"when?", category:"pronouns" },
  { kana:"なぜ", romaji:"naze", meaning:"why?", category:"pronouns" },
  { kana:"どうして", romaji:"doushite", meaning:"why? / how come?", category:"pronouns" },
  { kana:"どう", romaji:"dou", meaning:"how?", category:"pronouns" },
  { kana:"どれ", romaji:"dore", meaning:"which one?", category:"pronouns" },
  { kana:"どちら", romaji:"dochira", meaning:"which direction / which one (polite)", category:"pronouns" },
  { kana:"これ", romaji:"kore", meaning:"this (near speaker)", category:"pronouns" },
  { kana:"それ", romaji:"sore", meaning:"that (near listener)", category:"pronouns" },
  { kana:"あれ", romaji:"are", meaning:"that (far from both)", category:"pronouns" },
  { kana:"ここ", romaji:"koko", meaning:"here", category:"pronouns" },
  { kana:"そこ", romaji:"soko", meaning:"there (near listener)", category:"pronouns" },
  { kana:"あそこ", romaji:"asoko", meaning:"over there", category:"pronouns" },
];

// Get chars used in a word
function getWordChars(kana) {
  return [...new Set([...kana])];
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS_STATS_KEY = "kana_stats";
const LS_PREFS_KEY = "kana_prefs";
const LS_BEST_KEY = "kana_best_score";

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(LS_STATS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveStats(stats) {
  localStorage.setItem(LS_STATS_KEY, JSON.stringify(stats));
}

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(LS_PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

function savePrefs(prefs) {
  localStorage.setItem(LS_PREFS_KEY, JSON.stringify(prefs));
}

function loadBestScore() {
  try { return JSON.parse(localStorage.getItem(LS_BEST_KEY)) || null; } catch { return null; }
}

function saveBestScore(data) {
  localStorage.setItem(LS_BEST_KEY, JSON.stringify(data));
}


// ── Guide Tab ─────────────────────────────────────────────────────────────────

// Build transposed grid: 5 vowel rows × 10 consonant columns
// rows[colIdx][vowelIdx] — empty cell if that combo doesn't exist
function buildTransposedGrid(rows) {
  // rows = array of consonant groups, each has up to 5 vowel entries
  // vowel index: a=0, i=1, u=2, e=3, o=4
  const NUM_VOWELS = 5;
  const grid = []; // grid[vowelIdx][colIdx]
  for (let v = 0; v < NUM_VOWELS; v++) {
    grid[v] = rows.map((row) => {
      const entry = row[v] || null;
      return entry ? parseEntry(entry) : null;
    });
  }
  return grid;
}

const CELL_COLORS = [null, '#f85149', '#d2a800', '#3fb950']; // null=none, red, yellow, green

function loadCellColors() {
  try { return JSON.parse(localStorage.getItem('kana_cell_colors') || '{}'); } catch { return {}; }
}
function saveCellColors(obj) {
  localStorage.setItem('kana_cell_colors', JSON.stringify(obj));
  pushKeyToSupabase('kana_cell_colors', obj);
}

function KanaTable({ rows, title, colLabels = COL_LABELS, cellColors, onCellColor, searchQuery }) {
  const grid = buildTransposedGrid(rows);
  return (
    <div className="kana-table-wrapper">
      <h3 className="kana-table-title">{title}</h3>
      <div className="kana-grid" style={{ gridTemplateColumns: `28px repeat(${colLabels.length}, 72px)` }}>
        <div className="kana-grid-row">
          <span className="kana-vowel-label" />
          {colLabels.map((c) => (
            <span key={c} className="kana-col-label">{c}</span>
          ))}
        </div>
        {grid.map((row, vi) => (
          <div key={vi} className="kana-grid-row">
            <span className="kana-vowel-label">{VOWEL_LABELS[vi]}</span>
            {row.map((p, ci) =>
              p ? (() => {
                const colorIdx = cellColors[p.char] || 0;
                const borderColor = CELL_COLORS[colorIdx];
                const q = searchQuery.trim().toLowerCase();
                const isMatch = q && p.romaji.toLowerCase().includes(q);
                return (
                  <div
                    key={ci}
                    className={`kana-cell kana-cell--clickable${isMatch ? ' kana-cell--match' : ''}`}
                    style={borderColor ? { borderColor, boxShadow: `0 0 0 1px ${borderColor}` } : {}}
                    onClick={() => onCellColor(p.char)}
                    title={p.romaji}
                  >
                    <span className="kana-char">{p.char}</span>
                    <span className="kana-romaji">{p.romaji}</span>
                    {colorIdx > 0 && (
                      <span className="kana-color-dot" style={{ background: CELL_COLORS[colorIdx] }} />
                    )}
                  </div>
                );
              })() : (
                <div key={ci} className="kana-cell kana-cell--empty" />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GuideTab() {
  const [cellColors, setCellColors] = useState(loadCellColors);
  const [searchQuery, setSearchQuery] = useState('');

  const handleCellColor = (char) => {
    setCellColors(prev => {
      const next = { ...prev, [char]: ((prev[char] || 0) + 1) % CELL_COLORS.length };
      saveCellColors(next);
      return next;
    });
  };

  const tableProps = { cellColors, onCellColor: handleCellColor, searchQuery };

  return (
    <div className="guide-tab">
      {/* Search + legend */}
      <div className="guide-toolbar">
        <input
          className="guide-search"
          placeholder="Search romaji (e.g. ka, shi, tsu...)"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <div className="guide-legend">
          <span className="guide-legend-hint">Right-click to mark:</span>
          {CELL_COLORS.slice(1).map((c, i) => (
            <span key={i} className="guide-legend-dot" style={{ background: c }} />
          ))}
        </div>
      </div>

      <div className="guide-section-label">Basic — 清音</div>
      <div className="guide-tables-row">
        <KanaTable rows={HIRAGANA_ROWS} title="Hiragana" {...tableProps} />
        <KanaTable rows={KATAKANA_ROWS} title="Katakana" {...tableProps} />
      </div>
      <div className="guide-section-label">Voiced &amp; Semi-voiced — 濁音・半濁音</div>
      <div className="guide-tables-row">
        <KanaTable rows={HIRAGANA_VOICED_ROWS} title="Hiragana voiced" colLabels={VOICED_COL_LABELS} {...tableProps} />
        <KanaTable rows={KATAKANA_VOICED_ROWS} title="Katakana voiced" colLabels={VOICED_COL_LABELS} {...tableProps} />
      </div>
    </div>
  );
}

// ── Wrong Analysis ────────────────────────────────────────────────────────────

function WrongAnalysis({ pool, stats, onPracticeWrong, onResetWrong }) {
  const [open, setOpen] = useState(false);

  const wrongItems = pool
    .map(item => ({ ...item, s: stats[item.char] }))
    .filter(item => item.s && item.s.wrong > 0)
    .sort((a, b) => {
      const ratioA = a.s.wrong / Math.max(1, a.s.correct + a.s.wrong);
      const ratioB = b.s.wrong / Math.max(1, b.s.correct + b.s.wrong);
      if (ratioB !== ratioA) return ratioB - ratioA;
      return b.s.wrong - a.s.wrong;
    });

  if (wrongItems.length === 0) return null;

  return (
    <div className="wrong-analysis">
      <button className="wrong-analysis-toggle" onClick={() => setOpen(o => !o)}>
        <span className="wrong-analysis-badge">{wrongItems.length}</span>
        Wrong Analysis
        <span style={{ marginLeft: 'auto' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="wrong-analysis-body">
          <div className="wrong-analysis-list">
            {wrongItems.map(item => {
              const total = item.s.correct + item.s.wrong;
              const pct = Math.round((item.s.wrong / total) * 100);
              return (
                <div key={item.char} className="wrong-analysis-row">
                  <span className="wa-char" onClick={() => speakKana(item.char)} title="Listen">{item.char}</span>
                  <span className="wa-romaji">/{item.romaji}/</span>
                  <div className="wa-bar-wrap">
                    <div className="wa-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="wa-pct">{pct}%</span>
                  <span className="wa-counts">{item.s.wrong}✗ {item.s.correct}✓</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="practice-wrong-btn"
              onClick={() => onPracticeWrong(wrongItems.map(i => i.char))}
            >
              Practice Wrong Only ({wrongItems.length})
            </button>
            <button
              className="practice-wrong-btn"
              style={{ background: '#374151', flex: '0 0 auto' }}
              onClick={onResetWrong}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ pool, stats }) {
  const [tooltip, setTooltip] = useState(null);

  return (
    <div className="stats-bar">
      <div className="stats-grid">
        {pool.map((item) => {
          const s = stats[item.char];
          const status = !s
            ? "unseen"
            : s.lastResult === "correct"
            ? "correct"
            : "wrong";
          return (
            <div
              key={item.char}
              className={`stats-cell stats-cell--${status}`}
              title={`${item.char} (${item.romaji})`}
              onClick={() =>
                setTooltip((prev) =>
                  prev === item.char ? null : item.char
                )
              }
            >
              {item.char}
              {tooltip === item.char && (
                <div className="stats-tooltip">
                  <strong>{item.char}</strong> /{item.romaji}/
                  <br />
                  Correct: {s?.correct || 0}
                  <br />
                  Wrong: {s?.wrong || 0}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Practice Tab ──────────────────────────────────────────────────────────────

// ── Write Card (deftere yaz + self-assess) ────────────────────────────────────

function WriteCard({ targetChar, targetRomaji, onCorrect, onWrong, onNext }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => { setRevealed(false); }, [targetChar]);

  return (
    <div className="write-card">
      <div className="write-card-prompt">
        <span className="write-card-romaji">{targetRomaji}</span>
        <span className="write-card-hint">deftere yaz, sonra kontrol et</span>
      </div>

      <div className={`write-card-reveal${revealed ? ' write-card-reveal--open' : ''}`}>
        {revealed
          ? <span className="write-card-kana">{targetChar}</span>
          : <button className="draw-btn draw-btn--reveal" onClick={() => setRevealed(true)}>Cevabı Göster</button>
        }
      </div>

      {revealed && (
        <div className="write-card-assess">
          <button className="draw-btn draw-btn--wrong" onClick={onWrong}>✗ Yanlış</button>
          <button className="draw-btn draw-btn--correct" onClick={onCorrect}>✓ Doğru</button>
        </div>
      )}

      {!revealed && (
        <button className="draw-btn draw-btn--next" style={{ marginTop: 8 }} onClick={onNext}>Atla →</button>
      )}
    </div>
  );
}

// ── Practice Tab ───────────────────────────────────────────────────────────────

export function PracticeTab({ selectedRows, setSelectedRows }) {
  const prefs = loadPrefs();

  const [mode, setMode] = useState(prefs.mode || "Hiragana");
  const [direction, setDirection] = useState(prefs.direction || "Kana → Romaji");
  const [includeVoiced, setIncludeVoiced] = useState(() => prefs.includeVoiced ?? false);
  const [colorFilter, setColorFilter] = useState(new Set()); // Set of active color indices
  const [practiceMode, setPracticeMode] = useState('type'); // 'type' | 'draw'

  const [stats, setStats] = useState(loadStats);
  const [current, setCurrent] = useState(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [streak, setStreak] = useState(0);
  const [bestScore, setBestScore] = useState(loadBestScore);
  const inputRef = useRef(null);
  const feedbackFocusRef = useRef(null);
  const advanceTimerRef = useRef(null);
  const lastCharRef = useRef(null);
  // unseenPool: chars not yet correctly answered this round
  // wrongQueue: [{item, dueAfter}] — wrong answers scheduled to reappear
  const unseenPoolRef = useRef(null);
  const wrongQueueRef = useRef([]);
  const cardCountRef = useRef(0); // total cards shown this round
  const effectivePoolRef = useRef([]);

  // Derive base pool from mode + voiced toggle
  const baseBasic = mode === "Hiragana" ? HIRAGANA : mode === "Katakana" ? KATAKANA : ALL_KANA;
  const baseVoiced = mode === "Hiragana" ? HIRAGANA_VOICED : mode === "Katakana" ? KATAKANA_VOICED : [...HIRAGANA_VOICED, ...KATAKANA_VOICED];
  const basePool = includeVoiced ? [...baseBasic, ...baseVoiced] : baseBasic;

  // Filter by selected rows if any
  const pool = selectedRows === null
    ? basePool
    : basePool.filter(item => selectedRows.includes(item.char));

  // Filter by color mark
  const cellColors = loadCellColors();
  const hasColorFilter = colorFilter.size > 0;
  const colorFilteredPool = hasColorFilter
    ? basePool.filter(item => colorFilter.has(cellColors[item.char] || 0))
    : pool;
  // When color filter is active, use colorFilteredPool even if empty (don't fall back to basePool)
  const effectivePool = hasColorFilter
    ? colorFilteredPool
    : (pool.length > 0 ? pool : basePool);
  effectivePoolRef.current = effectivePool;

  // Row groups for selection UI
  const hiraganaRows = HIRAGANA_ROWS.map((row, i) => ({ label: ROW_LABELS[i], items: row.map(parseEntry).filter(Boolean) }));
  const katakanaRows = KATAKANA_ROWS.map((row, i) => ({ label: ROW_LABELS[i], items: row.map(parseEntry).filter(Boolean) }));
  const hiraganaVoicedRows = HIRAGANA_VOICED_ROWS.map((row, i) => ({ label: VOICED_ROW_LABELS[i], items: row.map(parseEntry).filter(Boolean), voiced: true }));
  const katakanaVoicedRows = KATAKANA_VOICED_ROWS.map((row, i) => ({ label: VOICED_ROW_LABELS[i], items: row.map(parseEntry).filter(Boolean), voiced: true }));
  const basicGroups = mode === "Hiragana" ? hiraganaRows : mode === "Katakana" ? katakanaRows : [...hiraganaRows, ...katakanaRows];
  const voicedGroups = mode === "Hiragana" ? hiraganaVoicedRows : mode === "Katakana" ? katakanaVoicedRows : [...hiraganaVoicedRows, ...katakanaVoicedRows];
  const visibleRowGroups = includeVoiced ? [...basicGroups, ...voicedGroups] : basicGroups;

  function toggleRow(chars) {
    setSelectedRows(prev => {
      const allChars = prev === null ? basePool.map(i => i.char) : prev;
      const allSelected = chars.every(c => allChars.includes(c));
      let next;
      if (allSelected) {
        next = allChars.filter(c => !chars.includes(c));
      } else {
        next = [...new Set([...allChars, ...chars])];
      }
      if (next.length === basePool.length) next = null;
      localStorage.setItem('kana_selected_rows', JSON.stringify(next));
      return next;
    });
  }

  function selectAll() {
    if (selectedRows === null) {
      // Already all selected → deselect all
      setSelectedRows([]);
      localStorage.setItem('kana_selected_rows', JSON.stringify([]));
    } else {
      // Select all
      setSelectedRows(null);
      localStorage.removeItem('kana_selected_rows');
    }
  }

  // Persist prefs
  useEffect(() => {
    savePrefs({ mode, direction, includeVoiced });
  }, [mode, direction, includeVoiced]);

  // Persist stats
  useEffect(() => {
    saveStats(stats);
  }, [stats]);

  // Initialize unseen pool when pool changes
  function initRound(newPool) {
    unseenPoolRef.current = [...(newPool || effectivePoolRef.current)];
    wrongQueueRef.current = [];
    cardCountRef.current = 0;
    lastCharRef.current = null;
  }

  // Pick next card — reads pool from ref to avoid stale closure / infinite loop
  const advance = useCallback(
    () => {
      cardCountRef.current += 1;
      const count = cardCountRef.current;
      const pool = effectivePoolRef.current;

      // Initialize unseen pool on first call
      if (unseenPoolRef.current === null) {
        unseenPoolRef.current = [...pool];
      }

      // Due wrong answers that are ready
      const dueWrong = wrongQueueRef.current.filter(w => w.dueAfter <= count && w.item.char !== lastCharRef.current);
      // Remove due items from queue
      wrongQueueRef.current = wrongQueueRef.current.filter(w => !(w.dueAfter <= count && w.item.char !== lastCharRef.current));

      let next;
      if (dueWrong.length > 0) {
        // Pick earliest due wrong answer
        dueWrong.sort((a, b) => a.dueAfter - b.dueAfter);
        next = dueWrong[0].item;
      } else if (unseenPoolRef.current.length > 0) {
        // Pick from unseen, excluding last shown
        const candidates = unseenPoolRef.current.filter(i => i.char !== lastCharRef.current);
        const fromPool = candidates.length > 0 ? candidates : unseenPoolRef.current;
        next = fromPool[Math.floor(Math.random() * fromPool.length)];
      } else {
        // All done this round — reset unseen pool
        unseenPoolRef.current = [...pool];
        wrongQueueRef.current = [];
        const candidates = unseenPoolRef.current.filter(i => i.char !== lastCharRef.current);
        const fromPool = candidates.length > 0 ? candidates : unseenPoolRef.current;
        next = fromPool[Math.floor(Math.random() * fromPool.length)];
      }

      lastCharRef.current = next.char;
      setCurrent(next);
      setInput("");
      setFeedback(null);
      setCorrectAnswer("");
      setTimeout(() => { inputRef.current?.focus(); }, 80);
    },
    [] // no deps — reads everything from refs
  );

  // When pool changes, reset round
  useEffect(() => {
    if (effectivePool.length === 0) return;
    clearTimeout(advanceTimerRef.current);
    initRound(effectivePool);
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, direction, selectedRows, includeVoiced, colorFilter]);

  // Initial card
  useEffect(() => {
    if (!current) { initRound(effectivePool); advance(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const question =
    direction === "Kana → Romaji" ? current?.char : current?.romaji;
  const answer =
    direction === "Kana → Romaji" ? current?.romaji : current?.char;
  const questionIsKana = direction === "Kana → Romaji";

  function handleSubmit() {
    if (!current || feedback !== null) return;

    const trimmed = input.trim().toLowerCase();
    const isCorrect = trimmed === answer?.toLowerCase();

    const newStats = {
      ...stats,
      [current.char]: {
        correct: (stats[current.char]?.correct || 0) + (isCorrect ? 1 : 0),
        wrong: (stats[current.char]?.wrong || 0) + (isCorrect ? 0 : 1),
        lastResult: isCorrect ? "correct" : "wrong",
      },
    };
    setStats(newStats);

    if (isCorrect) {
      // Remove from unseen pool
      if (unseenPoolRef.current) {
        unseenPoolRef.current = unseenPoolRef.current.filter(i => i.char !== current.char);
      }
      playCorrectSound();
      setFeedback("correct");
      setStreak((s) => s + 1);
      advanceTimerRef.current = setTimeout(() => advance(), 600);
    } else {
      // Schedule this card to reappear 2-5 cards later
      const delay = 2 + Math.floor(Math.random() * 4); // 2-5
      wrongQueueRef.current.push({ item: current, dueAfter: cardCountRef.current + delay });
      playWrongSound();
      setFeedback("wrong");
      setCorrectAnswer(answer);
      // Update best score before resetting streak
      if (streak > 0) {
        const currentBest = bestScore?.score || 0;
        if (streak > currentBest) {
          const rowLabel = selectedRows === null
            ? 'All'
            : visibleRowGroups
                .filter(g => g.items.every(i => selectedRows.includes(i.char)))
                .map(g => g.label).join(', ') || 'Custom';
          const newBest = { score: streak, mode, direction, rows: rowLabel };
          setBestScore(newBest);
          saveBestScore(newBest);
        }
      }
      setStreak(0);
      setTimeout(() => feedbackFocusRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      if (feedback === "wrong") {
        setFeedback(null);
        setInput("");
        setTimeout(() => inputRef.current?.focus(), 50);
      } else if (feedback === null) {
        handleSubmit();
      }
    }
    if (e.key === " " && feedback === "wrong") {
      e.preventDefault();
      advance();
    }
  }

  function resetStats() {
    clearTimeout(advanceTimerRef.current);
    const empty = {};
    setStats(empty);
    saveStats(empty);
    setStreak(0);
    initRound(effectivePool);
    advance();
  }

  function setModeAndReset(m) {
    clearTimeout(advanceTimerRef.current);
    setMode(m);
    setFeedback(null);
    setInput("");
  }

  function setDirectionAndReset(d) {
    clearTimeout(advanceTimerRef.current);
    setDirection(d);
    setFeedback(null);
    setInput("");
  }

  return (
    <div className="practice-tab">
      {/* Settings bar */}
      <div className="settings-bar">
        <div className="toggle-group">
          {["Hiragana", "Katakana", "Both"].map((m) => (
            <button
              key={m}
              className={`toggle-btn${mode === m ? " toggle-btn--active" : ""}`}
              onClick={() => setModeAndReset(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          className={`toggle-btn${includeVoiced ? " toggle-btn--active" : ""}`}
          onClick={() => { setIncludeVoiced(v => !v); setFeedback(null); setInput(""); setSelectedRows(null); localStorage.removeItem('kana_selected_rows'); }}
          title="Include voiced (が/ざ/だ/ば/ぱ) kana"
        >
          + Voiced
        </button>
        <div className="toggle-group">
          <button
            className={`toggle-btn${practiceMode === 'type' ? ' toggle-btn--active' : ''}`}
            onClick={() => setPracticeMode('type')}
            title="Romaji yazarak pratik yap"
          >✎ Yaz</button>
          <button
            className={`toggle-btn${practiceMode === 'draw' ? ' toggle-btn--active' : ''}`}
            onClick={() => setPracticeMode('draw')}
            title="Kana çizerek pratik yap"
          >✏ Çiz</button>
        </div>
        <button className="reset-btn" onClick={resetStats}>
          Reset Stats
        </button>

        {/* Color filters */}
        <div className="color-filter-group">
          {[
            { idx: 1, color: '#f85149', label: 'Red' },
            { idx: 2, color: '#d2a800', label: 'Yellow' },
            { idx: 3, color: '#3fb950', label: 'Green' },
          ].map(({ idx, color, label }) => {
            const count = basePool.filter(item => (cellColors[item.char] || 0) === idx).length;
            return (
              <button
                key={idx}
                className={`color-filter-btn${colorFilter.has(idx) ? ' active' : ''}`}
                style={{ '--cf-color': color }}
                onClick={() => { setColorFilter(prev => { const next = new Set(prev); next.has(idx) ? next.delete(idx) : next.add(idx); return next; }); setSelectedRows(null); }}
                title={`Practice ${label} marked (${count})`}
                disabled={count === 0}
              >
                <span className="cf-dot" style={{ background: color }} />
                {count}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row selection — hidden when color filter active */}
      <div className="row-select-bar" style={hasColorFilter ? { display: 'none' } : {}}>
        <div className="row-select-label">Practice rows:</div>
        <div className="row-select-groups">
          {visibleRowGroups.map((group) => {
            const chars = group.items.map(i => i.char);
            const allSel = selectedRows === null || (selectedRows.length > 0 && chars.every(c => selectedRows.includes(c)));
            return (
              <button
                key={group.label + chars[0]}
                className={`row-select-btn${allSel ? ' row-select-btn--active' : ''}`}
                onClick={() => toggleRow(chars)}
                title={chars.join(' ')}
              >
                <span className="row-btn-kana">{chars[0]}</span>
                <span className="row-btn-romaji">{group.label}</span>
              </button>
            );
          })}
          <button className="row-select-all" onClick={selectAll}>All</button>
        </div>
      </div>

      {/* Flash card / Drawing area */}
      <div className="flashcard-area">
        {hasColorFilter && effectivePool.length === 0 ? (
          <div className="flashcard" style={{ color: 'var(--text-muted)', fontSize: 16, textAlign: 'center', padding: 32 }}>
            No kana marked with the selected color(s).<br />
            <span style={{ fontSize: 13 }}>Mark kana in the Guide tab first.</span>
          </div>
        ) : practiceMode === 'draw' ? (
          <WriteCard
            key={current?.char}
            targetChar={current?.char || ''}
            targetRomaji={current?.romaji || ''}
            onCorrect={() => {
              const newStats = { ...stats, [current.char]: { correct: (stats[current.char]?.correct || 0) + 1, wrong: stats[current.char]?.wrong || 0, lastResult: 'correct' } };
              setStats(newStats);
              setStreak(s => s + 1);
              playCorrectSound();
              if (unseenPoolRef.current) unseenPoolRef.current = unseenPoolRef.current.filter(i => i.char !== current.char);
              advance();
            }}
            onWrong={() => {
              const newStats = { ...stats, [current.char]: { correct: stats[current.char]?.correct || 0, wrong: (stats[current.char]?.wrong || 0) + 1, lastResult: 'wrong' } };
              setStats(newStats);
              if (streak > 0) {
                const currentBest = bestScore?.score || 0;
                if (streak > currentBest) {
                  const newBest = { score: streak, mode, direction: 'Draw', rows: 'Draw' };
                  setBestScore(newBest);
                  saveBestScore(newBest);
                }
              }
              setStreak(0);
              playWrongSound();
              const delay = 2 + Math.floor(Math.random() * 4);
              wrongQueueRef.current.push({ item: current, dueAfter: cardCountRef.current + delay });
              advance();
            }}
            onNext={() => advance()}
          />
        ) : (
          <>
            <div ref={feedbackFocusRef} tabIndex={-1} onKeyDown={handleKeyDown} style={{ outline: 'none', position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />
            <div className={`flashcard${feedback ? ` flashcard--${feedback}` : ""}`}>
              <span className={`flashcard-question${questionIsKana ? " flashcard-question--kana" : " flashcard-question--romaji"}`}>
                {question}
              </span>
              <button className="speak-btn" onClick={() => speakKana(current?.char)} title="Hear pronunciation">🔊</button>
              {feedback === "correct" && (
                <span className="feedback-icon feedback-icon--correct">✓</span>
              )}
              {feedback === "wrong" && (
                <div className="feedback-wrong">
                  <span className="feedback-icon feedback-icon--wrong">✗</span>
                  <span className="correct-answer">
                    Correct: <strong>{correctAnswer}</strong>
                  </span>
                  <div className="wrong-actions">
                    <button className="try-again-btn" onClick={() => { setFeedback(null); setInput(""); setTimeout(() => inputRef.current?.focus(), 50); }}>
                      Try Again
                    </button>
                    <button className="next-btn" onClick={() => advance()}>
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="input-area">
              <input
                ref={inputRef}
                className="kana-input"
                type="text"
                value={input}
                onChange={(e) => { setInput(e.target.value); if (e.target.value.length > input.length) playTypeSound(); }}
                onKeyDown={handleKeyDown}
                placeholder={direction === "Kana → Romaji" ? "Type romaji..." : "Type kana..."}
                disabled={feedback !== null}
                autoComplete="off"
                spellCheck={false}
              />
              {feedback === null && (
                <button className="submit-btn" onClick={handleSubmit}>
                  Check
                </button>
              )}
            </div>
          </>
        )}

        <div className="streak-counter">
          Streak: <strong>{streak}</strong>
          {bestScore && (
            <span className="best-score">
              &nbsp;· Best: <strong>{bestScore.score}</strong>
              <span className="best-score-detail">
                {bestScore.mode} · {bestScore.direction} · {bestScore.rows}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <StatsBar pool={effectivePool} stats={stats} />

      {/* Wrong analysis */}
      <WrongAnalysis
        pool={effectivePool}
        stats={stats}
        onPracticeWrong={(chars) => {
          if (chars.length === 0) return;
          setSelectedRows(chars);
          localStorage.setItem('kana_selected_rows', JSON.stringify(chars));
        }}
        onResetWrong={() => {
          const newStats = {};
          Object.entries(stats).forEach(([char, s]) => {
            newStats[char] = { ...s, wrong: 0 };
          });
          setStats(newStats);
          saveStats(newStats);
        }}
      />

      {/* Study Words section */}
      <StudyWordsSection selectedRows={selectedRows} />
    </div>
  );
}

// ── Study Words Section ────────────────────────────────────────────────────────

function StudyWordsSection({ selectedRows }) {
  const allKanaChars = new Set(ALL_KANA_WITH_VOICED.map(i => i.char));
  const knownChars = selectedRows ? new Set(selectedRows) : new Set();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [quiz, setQuiz] = useState(null);
  const [quizPool, setQuizPool] = useState([]);
  const quizInputRef = useRef(null);
  // selectedWords: Set of kana strings user clicked to select for quiz
  const [selectedWords, setSelectedWords] = useState(new Set());
  // learnedWords: Set of kana strings marked as learned, persisted
  const [learnedWords, setLearnedWords] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('kana_learned_words')) || []); } catch { return new Set(); }
  });

  const filteredWords = WORD_LIST.filter(w => {
    const chars = getWordChars(w.kana);
    if (!chars.every(c => allKanaChars.has(c))) return false;
    if (selectedRows !== null && knownChars.size > 0) {
      if (!chars.every(c => knownChars.has(c))) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      return w.kana.includes(s) || w.romaji.includes(s) || w.meaning.toLowerCase().includes(s);
    }
    return true;
  });

  function toggleWordSelect(kana, e) {
    e.stopPropagation();
    setSelectedWords(prev => {
      const next = new Set(prev);
      if (next.has(kana)) next.delete(kana); else next.add(kana);
      return next;
    });
  }

  function toggleLearned(kana, e) {
    e.stopPropagation();
    setLearnedWords(prev => {
      const next = new Set(prev);
      if (next.has(kana)) next.delete(kana); else next.add(kana);
      localStorage.setItem('kana_learned_words', JSON.stringify([...next]));
      return next;
    });
  }

  function buildShuffledPool(words) {
    return [...words].sort(() => Math.random() - 0.5);
  }

  function startQuiz(words) {
    const pool = buildShuffledPool(words);
    setQuizPool(pool);
    setQuiz({ word: pool[0], input: "", feedback: null, answer: "", idx: 0, baseWords: words });
    setTimeout(() => quizInputRef.current?.focus(), 80);
  }

  function submitQuiz() {
    if (!quiz || quiz.feedback !== null) return;
    const correct = quiz.input.trim().toLowerCase() === quiz.word.romaji.toLowerCase();
    setQuiz(q => ({ ...q, feedback: correct ? "correct" : "wrong", answer: quiz.word.romaji }));
    if (correct) playCorrectSound(); else playWrongSound();
  }

  function nextQuiz() {
    const nextIdx = quiz.idx + 1;
    if (nextIdx >= quizPool.length) {
      // Restart — with a new shuffle
      const pool = buildShuffledPool(quiz.baseWords);
      setQuizPool(pool);
      setQuiz({ word: pool[0], input: "", feedback: null, answer: "", idx: 0, baseWords: quiz.baseWords });
    } else {
      setQuiz(q => ({ ...q, word: quizPool[nextIdx], input: "", feedback: null, answer: "", idx: nextIdx }));
    }
    setTimeout(() => quizInputRef.current?.focus(), 80);
  }

  const quizSource = selectedWords.size > 0
    ? filteredWords.filter(w => selectedWords.has(w.kana))
    : filteredWords;

  return (
    <div className="study-words-section">
      <button className="study-words-toggle" onClick={() => setOpen(o => !o)}>
        <span style={{ marginRight: '0.5rem' }}>{open ? '▲' : '▼'}</span>
        Study Words
        <span className="wrong-analysis-badge" style={{ marginLeft: '0.5rem' }}>{filteredWords.length}</span>
        {selectedWords.size > 0 && (
          <span className="wrong-analysis-badge" style={{ marginLeft: '0.3rem', background: '#2563eb' }}>{selectedWords.size} selected</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#8b949e', fontWeight: 400 }}>
          {selectedRows !== null ? 'filtered' : 'all rows'}
        </span>
      </button>

      {open && (
        <div className="study-words-body">
          {quiz ? (
            <div className="words-quiz">
              <div className="words-quiz-header">
                <button className="reset-btn" onClick={() => setQuiz(null)}>Done</button>
                <span className="words-quiz-progress">{quiz.idx + 1} / {quizPool.length} · ∞</span>
              </div>
              <div className={`flashcard${quiz.feedback ? ` flashcard--${quiz.feedback}` : ""}`}
                style={{ width: '100%', maxWidth: '100%', minHeight: 160, boxSizing: 'border-box' }}>
                <span className="flashcard-question flashcard-question--kana" style={{ fontSize: '3.5rem' }}>{quiz.word.kana}</span>
                <button className="speak-btn" onClick={() => speakKana(quiz.word.kana, 1.0)}>🔊</button>
                {quiz.feedback === "correct" && <span className="feedback-icon feedback-icon--correct">✓</span>}
                {quiz.feedback === "wrong" && (
                  <div className="feedback-wrong">
                    <span className="feedback-icon feedback-icon--wrong">✗</span>
                    <span className="correct-answer">Correct: <strong>{quiz.answer}</strong></span>
                    <div style={{ color: '#8b949e', fontSize: '0.85rem', marginTop: 4 }}>{quiz.word.meaning}</div>
                  </div>
                )}
              </div>
              <div className="input-area" style={{ justifyContent: 'center' }}>
                <input ref={quizInputRef} className="kana-input" type="text"
                  value={quiz.input}
                  onChange={e => setQuiz(q => ({ ...q, input: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") { if (quiz.feedback !== null) nextQuiz(); else submitQuiz(); } }}
                  placeholder="Type romaji..." disabled={quiz.feedback !== null}
                  autoComplete="off" spellCheck={false} />
                {quiz.feedback === null
                  ? <button className="submit-btn" onClick={submitQuiz}>Check</button>
                  : <button className="submit-btn" onClick={nextQuiz}>Next →</button>}
              </div>
              {quiz.feedback !== null && (
                <div style={{ textAlign: 'center', color: '#8b949e', fontSize: '0.9rem', marginTop: '0.5rem' }}>{quiz.word.meaning}</div>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input className="words-search" type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
                <button className="submit-btn" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                  onClick={() => startQuiz(quizSource)} disabled={quizSource.length === 0}>
                  {selectedWords.size > 0 ? `Quiz Selected (${selectedWords.size})` : `Start Quiz (${filteredWords.length})`}
                </button>
                {selectedWords.size > 0 && (
                  <button className="reset-btn" onClick={() => setSelectedWords(new Set())}>Clear Selection</button>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6e7681', marginBottom: '0.25rem' }}>
                Click card: select/deselect &nbsp;·&nbsp; ✓ mark as learned
              </div>
              <div className="words-grid">
                {filteredWords.map(w => {
                  const isSel = selectedWords.has(w.kana);
                  const isLearned = learnedWords.has(w.kana);
                  return (
                    <div key={w.kana}
                      className={`word-card${isSel ? ' word-card--selected' : ''}${isLearned ? ' word-card--learned' : ''}`}
                      onClick={(e) => toggleWordSelect(w.kana, e)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                        <span className="word-kana">{w.kana}</span>
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          <span className="word-learned-btn" onClick={(e) => { e.stopPropagation(); speakKana(w.kana, 1.0); }} title="Listen">🔊</span>
                          <span
                            className={`word-learned-btn${isLearned ? ' word-learned-btn--active' : ''}`}
                            onClick={(e) => toggleLearned(w.kana, e)}
                            title={isLearned ? 'Learned (remove)' : 'Mark as learned'}
                          >✓</span>
                        </div>
                      </div>
                      <span className="word-romaji">{w.romaji}</span>
                      <span className="word-meaning">{w.meaning}</span>
                    </div>
                  );
                })}
                {filteredWords.length === 0 && (
                  <div style={{ color: '#8b949e', padding: '1rem', textAlign: 'center', gridColumn: '1/-1' }}>No words found.</div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Vocabulary Tab ────────────────────────────────────────────────────────────

const VOCAB_CATEGORIES = [
  { key: "all",         label: "All" },
  { key: "greetings",   label: "Greetings",   jp: "挨拶" },
  { key: "expressions", label: "Expressions", jp: "表現" },
  { key: "pronouns",    label: "Pronouns",    jp: "代名詞" },
  { key: "particles",   label: "Particles",   jp: "助詞" },
  { key: "numbers",     label: "Numbers",     jp: "数字" },
  { key: "counters",    label: "Counters",    jp: "助数詞" },
  { key: "colors",      label: "Colors",      jp: "色" },
  { key: "food",        label: "Food",        jp: "食べ物" },
  { key: "animals",     label: "Animals",     jp: "動物" },
  { key: "body",        label: "Body",        jp: "体" },
  { key: "family",      label: "Family",      jp: "家族" },
  { key: "time",        label: "Time",        jp: "時間" },
  { key: "weather",     label: "Weather",     jp: "天気" },
  { key: "nature",      label: "Nature",      jp: "自然" },
  { key: "places",      label: "Places",      jp: "場所" },
  { key: "transport",   label: "Transport",   jp: "交通" },
  { key: "directions",  label: "Directions",  jp: "方向" },
  { key: "school",      label: "School",      jp: "学校" },
  { key: "work",        label: "Work",        jp: "仕事" },
  { key: "shopping",    label: "Shopping",    jp: "買い物" },
  { key: "health",      label: "Health",      jp: "健康" },
  { key: "daily",       label: "Daily Life",  jp: "日常" },
  { key: "hobbies",     label: "Hobbies",     jp: "趣味" },
  { key: "emotions",    label: "Emotions",    jp: "感情" },
  { key: "verbs",       label: "Verbs",       jp: "動詞" },
  { key: "adjectives",  label: "Adjectives",  jp: "形容詞" },
  { key: "conjugation", label: "Conjugation", jp: "活用" },
  { key: "grammar",     label: "Grammar",     jp: "文法" },
  { key: "general",     label: "General" },
  { key: "my_words",    label: "My Words" },
];

const VOCAB_CONJUGATION = [
  // ている / ています forms
  { kana:"すんでいます", romaji:"sunde imasu", meaning:"(I) am living / reside (currently)", category:"conjugation" },
  { kana:"たべています", romaji:"tabete imasu", meaning:"(I) am eating (currently)", category:"conjugation" },
  { kana:"のんでいます", romaji:"nonde imasu", meaning:"(I) am drinking (currently)", category:"conjugation" },
  { kana:"はたらいています", romaji:"hataraite imasu", meaning:"(I) am working (currently)", category:"conjugation" },
  { kana:"べんきょうしています", romaji:"benkyou shite imasu", meaning:"(I) am studying (currently)", category:"conjugation" },
  { kana:"みています", romaji:"mite imasu", meaning:"(I) am watching (currently)", category:"conjugation" },
  { kana:"きいています", romaji:"kiite imasu", meaning:"(I) am listening (currently)", category:"conjugation" },
  { kana:"はなしています", romaji:"hanashite imasu", meaning:"(I) am speaking (currently)", category:"conjugation" },
  { kana:"あるいています", romaji:"aruite imasu", meaning:"(I) am walking (currently)", category:"conjugation" },
  { kana:"はしっています", romaji:"hashitte imasu", meaning:"(I) am running (currently)", category:"conjugation" },
  { kana:"まっています", romaji:"matte imasu", meaning:"(I) am waiting (currently)", category:"conjugation" },
  { kana:"よんでいます", romaji:"yonde imasu", meaning:"(I) am reading (currently)", category:"conjugation" },
  { kana:"かいています", romaji:"kaite imasu", meaning:"(I) am writing (currently)", category:"conjugation" },
  { kana:"つかっています", romaji:"tsukatte imasu", meaning:"(I) am using (currently)", category:"conjugation" },
  { kana:"のっています", romaji:"notte imasu", meaning:"(I) am riding (currently)", category:"conjugation" },
  // ます form (polite present/future)
  { kana:"たべます", romaji:"tabemasu", meaning:"(I) eat / will eat (polite)", category:"conjugation" },
  { kana:"のみます", romaji:"nomimasu", meaning:"(I) drink / will drink (polite)", category:"conjugation" },
  { kana:"いきます", romaji:"ikimasu", meaning:"(I) go / will go (polite)", category:"conjugation" },
  { kana:"きます", romaji:"kimasu", meaning:"(I) come / will come (polite)", category:"conjugation" },
  { kana:"します", romaji:"shimasu", meaning:"(I) do / will do (polite)", category:"conjugation" },
  { kana:"みます", romaji:"mimasu", meaning:"(I) see / will see (polite)", category:"conjugation" },
  { kana:"よみます", romaji:"yomimasu", meaning:"(I) read / will read (polite)", category:"conjugation" },
  { kana:"かきます", romaji:"kakimasu", meaning:"(I) write / will write (polite)", category:"conjugation" },
  { kana:"はなします", romaji:"hanashimasu", meaning:"(I) speak / will speak (polite)", category:"conjugation" },
  { kana:"ねます", romaji:"nemasu", meaning:"(I) sleep / will sleep (polite)", category:"conjugation" },
  { kana:"おきます", romaji:"okimasu", meaning:"(I) wake up / will wake up (polite)", category:"conjugation" },
  { kana:"かえります", romaji:"kaerimasu", meaning:"(I) go home / will go home (polite)", category:"conjugation" },
  { kana:"あいます", romaji:"aimasu", meaning:"(I) meet / will meet (polite)", category:"conjugation" },
  { kana:"かいます", romaji:"kaimasu", meaning:"(I) buy / will buy (polite)", category:"conjugation" },
  // ません form (polite negative)
  { kana:"たべません", romaji:"tabemasen", meaning:"(I) don't eat (polite negative)", category:"conjugation" },
  { kana:"いきません", romaji:"ikimasen", meaning:"(I) don't go (polite negative)", category:"conjugation" },
  { kana:"わかりません", romaji:"wakarimasen", meaning:"(I) don't understand (polite negative)", category:"conjugation" },
  { kana:"しりません", romaji:"shirimasen", meaning:"(I) don't know (polite negative)", category:"conjugation" },
  // ました form (polite past)
  { kana:"たべました", romaji:"tabemashita", meaning:"(I) ate (polite past)", category:"conjugation" },
  { kana:"いきました", romaji:"ikimashita", meaning:"(I) went (polite past)", category:"conjugation" },
  { kana:"きました", romaji:"kimashita", meaning:"(I) came (polite past)", category:"conjugation" },
  { kana:"みました", romaji:"mimashita", meaning:"(I) saw / watched (polite past)", category:"conjugation" },
  { kana:"かいました", romaji:"kaimashita", meaning:"(I) bought (polite past)", category:"conjugation" },
  { kana:"のみました", romaji:"nomimashita", meaning:"(I) drank (polite past)", category:"conjugation" },
  { kana:"しました", romaji:"shimashita", meaning:"(I) did (polite past)", category:"conjugation" },
  { kana:"はなしました", romaji:"hanashimashita", meaning:"(I) spoke (polite past)", category:"conjugation" },
  // て form
  { kana:"たべて", romaji:"tabete", meaning:"eating / after eating (te-form)", category:"conjugation" },
  { kana:"のんで", romaji:"nonde", meaning:"drinking / after drinking (te-form)", category:"conjugation" },
  { kana:"いって", romaji:"itte", meaning:"going / after going (te-form)", category:"conjugation" },
  { kana:"きて", romaji:"kite", meaning:"coming / after coming (te-form)", category:"conjugation" },
  { kana:"して", romaji:"shite", meaning:"doing / after doing (te-form)", category:"conjugation" },
  { kana:"みて", romaji:"mite", meaning:"seeing / after seeing (te-form)", category:"conjugation" },
  { kana:"よんで", romaji:"yonde", meaning:"reading / after reading (te-form)", category:"conjugation" },
  { kana:"かいて", romaji:"kaite", meaning:"writing / after writing (te-form)", category:"conjugation" },
  { kana:"はなして", romaji:"hanashite", meaning:"speaking / after speaking (te-form)", category:"conjugation" },
  { kana:"あるいて", romaji:"aruite", meaning:"walking / after walking (te-form)", category:"conjugation" },
  { kana:"まって", romaji:"matte", meaning:"waiting / after waiting (te-form)", category:"conjugation" },
  // ない form (plain negative)
  { kana:"たべない", romaji:"tabenai", meaning:"don't eat (plain negative)", category:"conjugation" },
  { kana:"いかない", romaji:"ikanai", meaning:"don't go (plain negative)", category:"conjugation" },
  { kana:"こない", romaji:"konai", meaning:"don't come (plain negative)", category:"conjugation" },
  { kana:"しない", romaji:"shinai", meaning:"don't do (plain negative)", category:"conjugation" },
  { kana:"わからない", romaji:"wakaranai", meaning:"don't understand (plain negative)", category:"conjugation" },
  // たい form (want to)
  { kana:"たべたい", romaji:"tabetai", meaning:"want to eat", category:"conjugation" },
  { kana:"いきたい", romaji:"ikitai", meaning:"want to go", category:"conjugation" },
  { kana:"みたい", romaji:"mitai", meaning:"want to see / watch", category:"conjugation" },
  { kana:"かいたい", romaji:"kaitai", meaning:"want to buy", category:"conjugation" },
  { kana:"のみたい", romaji:"nomitai", meaning:"want to drink", category:"conjugation" },
  { kana:"やりたい", romaji:"yaritai", meaning:"want to do", category:"conjugation" },
  { kana:"しりたい", romaji:"shiritai", meaning:"want to know", category:"conjugation" },
  // can / potential
  { kana:"たべられる", romaji:"taberareru", meaning:"can eat (potential)", category:"conjugation" },
  { kana:"いける", romaji:"ikeru", meaning:"can go (potential)", category:"conjugation" },
  { kana:"こられる", romaji:"korareru", meaning:"can come (potential)", category:"conjugation" },
  { kana:"できる", romaji:"dekiru", meaning:"can do / is possible", category:"conjugation" },
  { kana:"はなせる", romaji:"hanaseru", meaning:"can speak (potential)", category:"conjugation" },
  { kana:"よめる", romaji:"yomeru", meaning:"can read (potential)", category:"conjugation" },
  { kana:"みられる", romaji:"mirareru", meaning:"can see (potential)", category:"conjugation" },
];

const VOCAB_GRAMMAR = [
  // です / だ
  { kana:"です", romaji:"desu", meaning:"is / am / are (polite copula)", category:"grammar" },
  { kana:"じゃないです", romaji:"ja nai desu", meaning:"is not / am not (polite negative)", category:"grammar" },
  { kana:"でした", romaji:"deshita", meaning:"was / were (polite past copula)", category:"grammar" },
  { kana:"だ", romaji:"da", meaning:"is / am / are (plain copula)", category:"grammar" },
  { kana:"じゃない", romaji:"ja nai", meaning:"is not (plain negative)", category:"grammar" },
  { kana:"だった", romaji:"datta", meaning:"was / were (plain past)", category:"grammar" },
  // ある / いる
  { kana:"あります", romaji:"arimasu", meaning:"there is / exists (things, polite)", category:"grammar" },
  { kana:"ありません", romaji:"arimasen", meaning:"there is not (things, polite negative)", category:"grammar" },
  { kana:"あった", romaji:"atta", meaning:"there was (things, plain past)", category:"grammar" },
  { kana:"います", romaji:"imasu", meaning:"there is / exists (living things, polite)", category:"grammar" },
  { kana:"いません", romaji:"imasen", meaning:"there is not (living things, polite negative)", category:"grammar" },
  { kana:"いた", romaji:"ita", meaning:"there was (living things, plain past)", category:"grammar" },
  // common patterns
  { kana:"〜てください", romaji:"~te kudasai", meaning:"please do ~ (request)", category:"grammar" },
  { kana:"〜てもいいです", romaji:"~te mo ii desu", meaning:"it's okay to ~ / may I ~?", category:"grammar" },
  { kana:"〜てはいけません", romaji:"~te wa ikemasen", meaning:"must not ~ / not allowed to ~", category:"grammar" },
  { kana:"〜なければなりません", romaji:"~nakereba narimasen", meaning:"must ~ / have to ~", category:"grammar" },
  { kana:"〜たいです", romaji:"~tai desu", meaning:"I want to ~ (polite)", category:"grammar" },
  { kana:"〜ましょう", romaji:"~mashou", meaning:"let's ~ (invitation/suggestion)", category:"grammar" },
  { kana:"〜ませんか", romaji:"~masen ka", meaning:"would you like to ~? / shall we ~?", category:"grammar" },
  { kana:"〜ましょうか", romaji:"~mashou ka", meaning:"shall I ~? / shall we ~?", category:"grammar" },
  { kana:"〜かもしれません", romaji:"~kamo shiremasen", meaning:"might ~ / perhaps ~", category:"grammar" },
  { kana:"〜でしょう", romaji:"~deshou", meaning:"probably ~ / I suppose ~", category:"grammar" },
  { kana:"〜と思います", romaji:"~to omoimasu", meaning:"I think that ~", category:"grammar" },
  { kana:"〜が好きです", romaji:"~ga suki desu", meaning:"I like ~", category:"grammar" },
  { kana:"〜が嫌いです", romaji:"~ga kirai desu", meaning:"I dislike ~", category:"grammar" },
  { kana:"〜がわかります", romaji:"~ga wakarimasu", meaning:"I understand ~", category:"grammar" },
  { kana:"〜がほしいです", romaji:"~ga hoshii desu", meaning:"I want ~ (noun)", category:"grammar" },
  // question words in sentences
  { kana:"なんですか", romaji:"nan desu ka", meaning:"what is it? / what?", category:"grammar" },
  { kana:"どこですか", romaji:"doko desu ka", meaning:"where is it?", category:"grammar" },
  { kana:"いつですか", romaji:"itsu desu ka", meaning:"when is it?", category:"grammar" },
  { kana:"だれですか", romaji:"dare desu ka", meaning:"who is it?", category:"grammar" },
  { kana:"いくらですか", romaji:"ikura desu ka", meaning:"how much is it?", category:"grammar" },
  { kana:"いくつですか", romaji:"ikutsu desu ka", meaning:"how many?", category:"grammar" },
  { kana:"どうですか", romaji:"dou desu ka", meaning:"how is it? / what do you think?", category:"grammar" },
  { kana:"なんじですか", romaji:"nanji desu ka", meaning:"what time is it?", category:"grammar" },
];

const VOCAB_ALL_BUILTIN = [
  ...VOCAB_GREETINGS,
  ...VOCAB_EXPRESSIONS,
  ...VOCAB_PRONOUNS,
  ...VOCAB_PARTICLES,
  ...VOCAB_NUMBERS,
  ...VOCAB_COUNTERS,
  ...VOCAB_COLORS,
  ...VOCAB_FOOD,
  ...VOCAB_FOOD2,
  ...VOCAB_ANIMALS,
  ...VOCAB_BODY,
  ...VOCAB_FAMILY,
  ...VOCAB_TIME,
  ...VOCAB_WEATHER,
  ...VOCAB_NATURE,
  ...VOCAB_PLACES,
  ...VOCAB_TRANSPORT,
  ...VOCAB_DIRECTIONS,
  ...VOCAB_SCHOOL,
  ...VOCAB_WORK,
  ...VOCAB_SHOPPING,
  ...VOCAB_HEALTH,
  ...VOCAB_DAILY,
  ...VOCAB_HOBBIES,
  ...VOCAB_EMOTIONS,
  ...VOCAB_VERBS,
  ...VOCAB_VERBS2,
  ...VOCAB_ADJECTIVES,
  ...VOCAB_ADJECTIVES2,
  ...VOCAB_CONJUGATION,
  ...VOCAB_GRAMMAR,
  ...WORD_LIST,
];

function loadCustomWords() {
  try { return JSON.parse(localStorage.getItem('kana_custom_words')) || []; } catch { return []; }
}
function saveCustomWords(words) {
  localStorage.setItem('kana_custom_words', JSON.stringify(words));
  pushKeyToSupabase('kana_custom_words', words);
}
function loadVocabLearned() {
  try { return new Set(JSON.parse(localStorage.getItem('kana_learned_words')) || []); } catch { return new Set(); }
}
function saveVocabLearned(set) {
  localStorage.setItem('kana_learned_words', JSON.stringify([...set]));
}
function loadVocabSelected() {
  try { return new Set(JSON.parse(localStorage.getItem('kana_selected_vocab')) || []); } catch { return new Set(); }
}
function saveVocabSelected(set) {
  localStorage.setItem('kana_selected_vocab', JSON.stringify([...set]));
}


function VocabularyTab() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "learning" | "learned"
  const [learnedWords, setLearnedWords] = useState(loadVocabLearned);
  const [selectedVocab, setSelectedVocab] = useState(loadVocabSelected);
  const [customWords, setCustomWords] = useState(loadCustomWords);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ kana: "", romaji: "", meaning: "" });
  const [quizState, setQuizState] = useState(null); // null or quiz object
  const [quizMode, setQuizMode] = useState("kana_to_romaji"); // "kana_to_romaji" | "meaning_to_kana"

  const quizInputRef = useRef(null);

  const customWordsWithCat = customWords.map(w => ({ ...w, category: "my_words" }));
  const allWords = [...VOCAB_ALL_BUILTIN, ...customWordsWithCat];

  // Deduplicate by kana (keep first occurrence)
  const seen = new Set();
  const deduped = allWords.filter(w => {
    if (seen.has(w.kana)) return false;
    seen.add(w.kana);
    return true;
  });

  const catCounts = {};
  deduped.forEach(w => {
    catCounts[w.category] = (catCounts[w.category] || 0) + 1;
  });
  const totalCount = deduped.length;

  const filtered = deduped.filter(w => {
    if (activeCategory !== "all" && w.category !== activeCategory) return false;
    if (statusFilter === "learned" && !learnedWords.has(w.kana)) return false;
    if (statusFilter === "learning" && learnedWords.has(w.kana)) return false;
    if (search) {
      const s = search.toLowerCase();
      return w.kana.includes(s) || w.romaji.toLowerCase().includes(s) || w.meaning.toLowerCase().includes(s);
    }
    return true;
  });

  function toggleLearned(kana) {
    setLearnedWords(prev => {
      const next = new Set(prev);
      if (next.has(kana)) next.delete(kana); else next.add(kana);
      saveVocabLearned(next);
      return next;
    });
  }

  function toggleSelected(kana) {
    setSelectedVocab(prev => {
      const next = new Set(prev);
      if (next.has(kana)) next.delete(kana); else next.add(kana);
      saveVocabSelected(next);
      return next;
    });
  }

  function handleAddWord() {
    if (!addForm.kana.trim() || !addForm.romaji.trim() || !addForm.meaning.trim()) return;
    const newWord = { kana: addForm.kana.trim(), romaji: addForm.romaji.trim(), meaning: addForm.meaning.trim() };
    const next = [...customWords, newWord];
    setCustomWords(next);
    saveCustomWords(next);
    setAddForm({ kana: "", romaji: "", meaning: "" });
    setShowAddModal(false);
  }

  function startQuiz(words) {
    if (words.length === 0) return;
    const pool = [...words].sort(() => Math.random() - 0.5);
    setQuizState({ pool, idx: 0, input: "", feedback: null, answer: "", correct: 0, wrong: 0 });
    setTimeout(() => quizInputRef.current?.focus(), 80);
  }

  function submitQuiz() {
    if (!quizState || quizState.feedback !== null) return;
    const word = quizState.pool[quizState.idx];
    const expected = quizMode === "kana_to_romaji" ? word.romaji : word.kana;
    const isCorrect = quizState.input.trim().toLowerCase() === expected.toLowerCase();
    setQuizState(q => ({
      ...q,
      feedback: isCorrect ? "correct" : "wrong",
      answer: expected,
      correct: q.correct + (isCorrect ? 1 : 0),
      wrong: q.wrong + (isCorrect ? 0 : 1),
    }));
    if (isCorrect) playCorrectSound(); else playWrongSound();
  }

  function nextQuiz() {
    const nextIdx = quizState.idx + 1;
    if (nextIdx >= quizState.pool.length) {
      const pool = [...quizState.pool].sort(() => Math.random() - 0.5);
      setQuizState(q => ({ ...q, pool, idx: 0, input: "", feedback: null, answer: "", correct: 0, wrong: 0 }));
    } else {
      setQuizState(q => ({ ...q, idx: nextIdx, input: "", feedback: null, answer: "" }));
    }
    setTimeout(() => quizInputRef.current?.focus(), 80);
  }

  const quizSource = selectedVocab.size > 0
    ? filtered.filter(w => selectedVocab.has(w.kana))
    : filtered;

  if (quizState) {
    const word = quizState.pool[quizState.idx];
    const question = quizMode === "kana_to_romaji" ? word.kana : word.meaning;
    const isKanaQ = quizMode === "kana_to_romaji";
    const progress = Math.round(((quizState.idx) / quizState.pool.length) * 100);

    return (
      <div className="vocab-quiz-area">
        <div className="vocab-quiz-header">
          <button className="reset-btn" onClick={() => setQuizState(null)}>Done</button>
          <div className="vocab-quiz-progress-wrap">
            <div className="vocab-quiz-progress-bar">
              <div className="vocab-quiz-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="vocab-quiz-progress-text">{quizState.idx + 1} / {quizState.pool.length}</span>
          </div>
          <div className="vocab-quiz-score">
            <span style={{ color: '#3fb950' }}>{quizState.correct}✓</span>
            <span style={{ color: '#f85149' }}>{quizState.wrong}✗</span>
          </div>
          <div className="vocab-quiz-mode-toggle">
            <button
              className={`toggle-btn${quizMode === "kana_to_romaji" ? " toggle-btn--active" : ""}`}
              onClick={() => setQuizMode("kana_to_romaji")}
            >Kana → Romaji</button>
            <button
              className={`toggle-btn${quizMode === "meaning_to_kana" ? " toggle-btn--active" : ""}`}
              onClick={() => setQuizMode("meaning_to_kana")}
            >Meaning → Kana</button>
          </div>
        </div>

        <div className={`flashcard vocab-quiz-card${quizState.feedback ? ` flashcard--${quizState.feedback}` : ""}`}>
          <span className={isKanaQ ? "flashcard-question--kana" : "vocab-quiz-meaning-q"}>{question}</span>
          <button className="speak-btn" onClick={() => speakKana(word.kana, 1.0)}>🔊</button>
          {quizState.feedback === "correct" && <span className="feedback-icon feedback-icon--correct">✓</span>}
          {quizState.feedback === "wrong" && (
            <div className="feedback-wrong">
              <span className="feedback-icon feedback-icon--wrong">✗</span>
              <span className="correct-answer">Correct: <strong>{quizState.answer}</strong></span>
              <div style={{ color: '#8b949e', fontSize: '0.85rem', marginTop: 4 }}>{word.meaning}</div>
            </div>
          )}
        </div>

        <div className="input-area" style={{ justifyContent: 'center', marginTop: '1rem' }}>
          <input
            ref={quizInputRef}
            className="kana-input"
            type="text"
            value={quizState.input}
            onChange={e => setQuizState(q => ({ ...q, input: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") { if (quizState.feedback !== null) nextQuiz(); else submitQuiz(); } }}
            placeholder={quizMode === "kana_to_romaji" ? "Type romaji..." : "Type kana..."}
            disabled={quizState.feedback !== null}
            autoComplete="off" spellCheck={false}
          />
          {quizState.feedback === null
            ? <button className="submit-btn" onClick={submitQuiz}>Check</button>
            : <button className="submit-btn" onClick={nextQuiz}>Next →</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="vocab-tab">
      {/* Left panel */}
      <div className="vocab-sidebar">
        <div className="vocab-cat-list">
          <button
            className={`vocab-cat-btn${activeCategory === "all" ? " vocab-cat-btn--active" : ""}`}
            onClick={() => setActiveCategory("all")}
          >
            <span>All</span>
            <span className="vocab-cat-badge">{totalCount}</span>
          </button>
          {VOCAB_CATEGORIES.filter(c => c.key !== "all").map(cat => {
            const count = cat.key === "my_words" ? customWords.length : (catCounts[cat.key] || 0);
            return (
              <button
                key={cat.key}
                className={`vocab-cat-btn${activeCategory === cat.key ? " vocab-cat-btn--active" : ""}`}
                onClick={() => setActiveCategory(cat.key)}
              >
                <span>{cat.label}{cat.jp ? <span className="vocab-cat-jp"> {cat.jp}</span> : null}</span>
                <span className="vocab-cat-badge">{count}</span>
              </button>
            );
          })}
        </div>
        <button className="vocab-add-btn" onClick={() => setShowAddModal(true)}>+ Add Word</button>
      </div>

      {/* Right area */}
      <div className="vocab-main">
        <div className="vocab-toolbar">
          <input
            className="vocab-search"
            type="text"
            placeholder="Search kana, romaji, meaning..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="vocab-status-filters">
            {["all", "learning", "learned"].map(s => (
              <button
                key={s}
                className={`toggle-btn${statusFilter === s ? " toggle-btn--active" : ""}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "All" : s === "learning" ? "Learning" : "Learned"}
              </button>
            ))}
          </div>
          <button
            className="submit-btn"
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={() => startQuiz(quizSource)}
            disabled={quizSource.length === 0}
          >
            {selectedVocab.size > 0
              ? `Quiz Selected (${quizSource.length})`
              : `Quiz All (${filtered.length})`}
          </button>
          {selectedVocab.size > 0 && (
            <button className="reset-btn" onClick={() => { setSelectedVocab(new Set()); saveVocabSelected(new Set()); }}>
              Clear
            </button>
          )}
        </div>

        <div className="vocab-grid">
          {filtered.map(w => {
            const isLearned = learnedWords.has(w.kana);
            const isSel = selectedVocab.has(w.kana);
            return (
              <div
                key={w.kana + w.category}
                className={`vocab-card${isLearned ? " vocab-card--learned" : ""}${isSel ? " vocab-card--selected" : ""}`}
                onClick={() => toggleSelected(w.kana)}
              >

                <div className="vocab-card-top">
                  <span className="vocab-card-kana">{w.kana}</span>
                  <div className="vocab-card-actions">
                    <button
                      className="word-learned-btn"
                      onClick={e => { e.stopPropagation(); speakKana(w.kana, 1.0); }}
                      title="Listen"
                    >🔊</button>
                    <button
                      className={`word-learned-btn${isLearned ? " word-learned-btn--active" : ""}`}
                      onClick={e => { e.stopPropagation(); toggleLearned(w.kana); }}
                      title={isLearned ? "Learned (remove)" : "Mark as learned"}
                    >✓</button>
                    <button
                      className={`word-learned-btn${isSel ? " word-learned-btn--active" : ""}`}
                      style={isSel ? { borderColor: '#2563eb', color: '#2563eb', background: '#1e3a5f' } : {}}
                      onClick={e => { e.stopPropagation(); toggleSelected(w.kana); }}
                      title={isSel ? "Deselect" : "Select for quiz"}
                    >☆</button>
                  </div>
                </div>
                <span className="word-romaji">{w.romaji}</span>
                <span className="word-meaning">{w.meaning}</span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ color: '#8b949e', padding: '2rem', textAlign: 'center', gridColumn: '1/-1' }}>No words found.</div>
          )}
        </div>
      </div>

      {/* Add Word Modal */}
      {showAddModal && (
        <div className="vocab-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="vocab-modal" onClick={e => e.stopPropagation()}>
            <h3 className="vocab-modal-title">Add Word</h3>
            <div className="vocab-modal-fields">
              <input
                className="vocab-modal-input"
                type="text"
                placeholder="Kana (e.g. ねこ)"
                value={addForm.kana}
                onChange={e => setAddForm(f => ({ ...f, kana: e.target.value }))}
              />
              <input
                className="vocab-modal-input"
                type="text"
                placeholder="Romaji (e.g. neko)"
                value={addForm.romaji}
                onChange={e => setAddForm(f => ({ ...f, romaji: e.target.value }))}
              />
              <input
                className="vocab-modal-input"
                type="text"
                placeholder="Meaning (e.g. cat)"
                value={addForm.meaning}
                onChange={e => setAddForm(f => ({ ...f, meaning: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") handleAddWord(); }}
              />
            </div>
            <div className="vocab-modal-actions">
              <button className="submit-btn" onClick={handleAddWord}>Save</button>
              <button className="reset-btn" onClick={() => setShowAddModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export default function JapaneseKana() {
  const [tab, setTab] = useState("Guide");
  const [selectedRows, setSelectedRows] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kana_selected_rows')) || null; } catch { return null; }
  });

  return (
    <div className="japanese-kana">
      <div className="jk-header">
        <div className="jk-tabs">
          {["Guide", "Practice", "Vocabulary"].map((t) => (
            <button
              key={t}
              className={`jk-tab${tab === t ? " jk-tab--active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "Practice" && (
          <button
            className="jk-practice-popup-btn"
            onClick={openKanaPopup}
            title="Open Practice in floating window"
          >
            ⧉ Pop-up
          </button>
        )}
      </div>
      <div className="jk-body" style={tab === "Vocabulary" ? { padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' } : {}}>
        {tab === "Guide" && <GuideTab />}
        {tab === "Practice" && <PracticeTab selectedRows={selectedRows} setSelectedRows={setSelectedRows} />}
        {tab === "Vocabulary" && <VocabularyTab />}
      </div>
    </div>
  );
}
