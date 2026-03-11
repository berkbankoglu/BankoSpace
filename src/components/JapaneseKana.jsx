import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getAudioContext, getMasterGain, getVolume } from "../utils/sounds";
import "./JapaneseKana.css";

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

// ── Word list ─────────────────────────────────────────────────────────────────
// { kana, romaji, meaning, chars: [hiragana chars used] }
const WORD_LIST = [
  { kana:"あお", romaji:"ao", meaning:"blue/green" },
  { kana:"あか", romaji:"aka", meaning:"red" },
  { kana:"あき", romaji:"aki", meaning:"autumn" },
  { kana:"あさ", romaji:"asa", meaning:"morning" },
  { kana:"あし", romaji:"ashi", meaning:"leg/foot" },
  { kana:"あに", romaji:"ani", meaning:"older brother" },
  { kana:"あね", romaji:"ane", meaning:"older sister" },
  { kana:"あめ", romaji:"ame", meaning:"rain / candy" },
  { kana:"あり", romaji:"ari", meaning:"ant" },
  { kana:"いえ", romaji:"ie", meaning:"house" },
  { kana:"いか", romaji:"ika", meaning:"squid" },
  { kana:"いけ", romaji:"ike", meaning:"pond" },
  { kana:"いぬ", romaji:"inu", meaning:"dog" },
  { kana:"いま", romaji:"ima", meaning:"now / living room" },
  { kana:"いも", romaji:"imo", meaning:"potato" },
  { kana:"いわ", romaji:"iwa", meaning:"rock" },
  { kana:"うえ", romaji:"ue", meaning:"above/up" },
  { kana:"うし", romaji:"ushi", meaning:"cow" },
  { kana:"うた", romaji:"uta", meaning:"song" },
  { kana:"うみ", romaji:"umi", meaning:"sea/ocean" },
  { kana:"うら", romaji:"ura", meaning:"back/reverse" },
  { kana:"えき", romaji:"eki", meaning:"station" },
  { kana:"おか", romaji:"oka", meaning:"hill" },
  { kana:"おと", romaji:"oto", meaning:"sound" },
  { kana:"おに", romaji:"oni", meaning:"demon/ogre" },
  { kana:"おや", romaji:"oya", meaning:"parent" },
  { kana:"かお", romaji:"kao", meaning:"face" },
  { kana:"かぜ", romaji:"kaze", meaning:"wind / cold" },
  { kana:"かた", romaji:"kata", meaning:"shoulder / person" },
  { kana:"かに", romaji:"kani", meaning:"crab" },
  { kana:"かね", romaji:"kane", meaning:"money / bell" },
  { kana:"かみ", romaji:"kami", meaning:"paper / god / hair" },
  { kana:"から", romaji:"kara", meaning:"from / empty" },
  { kana:"かわ", romaji:"kawa", meaning:"river / skin" },
  { kana:"き", romaji:"ki", meaning:"tree" },
  { kana:"きた", romaji:"kita", meaning:"north" },
  { kana:"くさ", romaji:"kusa", meaning:"grass" },
  { kana:"くち", romaji:"kuchi", meaning:"mouth" },
  { kana:"くに", romaji:"kuni", meaning:"country" },
  { kana:"くま", romaji:"kuma", meaning:"bear" },
  { kana:"くも", romaji:"kumo", meaning:"cloud / spider" },
  { kana:"くる", romaji:"kuru", meaning:"to come" },
  { kana:"けさ", romaji:"kesa", meaning:"this morning" },
  { kana:"こえ", romaji:"koe", meaning:"voice" },
  { kana:"こな", romaji:"kona", meaning:"powder / flour" },
  { kana:"こめ", romaji:"kome", meaning:"rice (uncooked)" },
  { kana:"さかな", romaji:"sakana", meaning:"fish" },
  { kana:"さくら", romaji:"sakura", meaning:"cherry blossom" },
  { kana:"さむい", romaji:"samui", meaning:"cold (weather)" },
  { kana:"しお", romaji:"shio", meaning:"salt" },
  { kana:"した", romaji:"shita", meaning:"below/under" },
  { kana:"しま", romaji:"shima", meaning:"island" },
  { kana:"しろ", romaji:"shiro", meaning:"white / castle" },
  { kana:"すな", romaji:"suna", meaning:"sand" },
  { kana:"すみ", romaji:"sumi", meaning:"corner / ink" },
  { kana:"そら", romaji:"sora", meaning:"sky" },
  { kana:"たに", romaji:"tani", meaning:"valley" },
  { kana:"ちから", romaji:"chikara", meaning:"power/strength" },
  { kana:"つき", romaji:"tsuki", meaning:"moon / month" },
  { kana:"つち", romaji:"tsuchi", meaning:"soil/earth" },
  { kana:"てき", romaji:"teki", meaning:"enemy" },
  { kana:"てら", romaji:"tera", meaning:"temple" },
  { kana:"とき", romaji:"toki", meaning:"time" },
  { kana:"とり", romaji:"tori", meaning:"bird" },
  { kana:"なか", romaji:"naka", meaning:"inside/middle" },
  { kana:"なつ", romaji:"natsu", meaning:"summer" },
  { kana:"なみ", romaji:"nami", meaning:"wave" },
  { kana:"にく", romaji:"niku", meaning:"meat" },
  { kana:"にし", romaji:"nishi", meaning:"west" },
  { kana:"にわ", romaji:"niwa", meaning:"garden" },
  { kana:"ねこ", romaji:"neko", meaning:"cat" },
  { kana:"ねつ", romaji:"netsu", meaning:"fever / heat" },
  { kana:"のり", romaji:"nori", meaning:"seaweed / glue" },
  { kana:"はな", romaji:"hana", meaning:"flower / nose" },
  { kana:"はし", romaji:"hashi", meaning:"chopsticks / bridge" },
  { kana:"はる", romaji:"haru", meaning:"spring" },
  { kana:"ひかり", romaji:"hikari", meaning:"light" },
  { kana:"ひと", romaji:"hito", meaning:"person" },
  { kana:"ひま", romaji:"hima", meaning:"free time" },
  { kana:"ふね", romaji:"fune", meaning:"ship/boat" },
  { kana:"ふゆ", romaji:"fuyu", meaning:"winter" },
  { kana:"ほし", romaji:"hoshi", meaning:"star" },
  { kana:"まち", romaji:"machi", meaning:"town" },
  { kana:"まつ", romaji:"matsu", meaning:"pine tree / to wait" },
  { kana:"みず", romaji:"mizu", meaning:"water" },
  { kana:"みち", romaji:"michi", meaning:"road/path" },
  { kana:"みなみ", romaji:"minami", meaning:"south" },
  { kana:"むし", romaji:"mushi", meaning:"insect/bug" },
  { kana:"めし", romaji:"meshi", meaning:"meal/rice (casual)" },
  { kana:"もり", romaji:"mori", meaning:"forest" },
  { kana:"やま", romaji:"yama", meaning:"mountain" },
  { kana:"ゆき", romaji:"yuki", meaning:"snow" },
  { kana:"よる", romaji:"yoru", meaning:"night" },
  { kana:"らく", romaji:"raku", meaning:"comfortable/easy" },
  { kana:"りく", romaji:"riku", meaning:"land/shore" },
  { kana:"るす", romaji:"rusu", meaning:"absence/away from home" },
  { kana:"わたし", romaji:"watashi", meaning:"I/me" },
  { kana:"をとこ", romaji:"otoko", meaning:"man (archaic)" },
  { kana:"かなた", romaji:"kanata", meaning:"far away / beyond" },
  { kana:"さかた", romaji:"sakata", meaning:"(place name)" },
  { kana:"なかま", romaji:"nakama", meaning:"friend/companion" },
  { kana:"たのしい", romaji:"tanoshii", meaning:"fun/enjoyable" },
  { kana:"おいしい", romaji:"oishii", meaning:"delicious" },
  { kana:"あたらしい", romaji:"atarashii", meaning:"new" },
  { kana:"あかるい", romaji:"akarui", meaning:"bright/cheerful" },
  { kana:"むらさき", romaji:"murasaki", meaning:"purple" },
  { kana:"しずか", romaji:"shizuka", meaning:"quiet/calm" },
  { kana:"はやい", romaji:"hayai", meaning:"fast/early" },
  { kana:"おおきい", romaji:"ookii", meaning:"big" },
  { kana:"ちいさい", romaji:"chiisai", meaning:"small" },
  { kana:"あい", romaji:"ai", meaning:"love" },
  { kana:"あいこ", romaji:"aiko", meaning:"tie/draw (game)" },
  { kana:"あおい", romaji:"aoi", meaning:"blue/pale" },
  { kana:"あおぞら", romaji:"aozora", meaning:"blue sky" },
  { kana:"あかい", romaji:"akai", meaning:"red (adjective)" },
  { kana:"あかね", romaji:"akane", meaning:"madder red / name" },
  { kana:"あくび", romaji:"akubi", meaning:"yawn" },
  { kana:"あさひ", romaji:"asahi", meaning:"morning sun" },
  { kana:"あした", romaji:"ashita", meaning:"tomorrow" },
  { kana:"あたま", romaji:"atama", meaning:"head" },
  { kana:"あなた", romaji:"anata", meaning:"you" },
  { kana:"あひる", romaji:"ahiru", meaning:"duck" },
  { kana:"いいえ", romaji:"iie", meaning:"no" },
  { kana:"いきる", romaji:"ikiru", meaning:"to live" },
  { kana:"いくら", romaji:"ikura", meaning:"how much / salmon roe" },
  { kana:"いし", romaji:"ishi", meaning:"stone / will" },
  { kana:"いたい", romaji:"itai", meaning:"painful / ouch" },
  { kana:"いつ", romaji:"itsu", meaning:"when" },
  { kana:"いのち", romaji:"inochi", meaning:"life" },
  { kana:"いろ", romaji:"iro", meaning:"color" },
  { kana:"うさぎ", romaji:"usagi", meaning:"rabbit" },
  { kana:"うそ", romaji:"uso", meaning:"lie / falsehood" },
  { kana:"うたう", romaji:"utau", meaning:"to sing" },
  { kana:"うどん", romaji:"udon", meaning:"udon noodles" },
  { kana:"うなぎ", romaji:"unagi", meaning:"eel" },
  { kana:"えがお", romaji:"egao", meaning:"smiling face" },
  { kana:"おいしい", romaji:"oishii", meaning:"delicious" },
  { kana:"おかし", romaji:"okashi", meaning:"sweets / snack" },
  { kana:"おかね", romaji:"okane", meaning:"money" },
  { kana:"おきる", romaji:"okiru", meaning:"to wake up" },
  { kana:"おこめ", romaji:"okome", meaning:"rice (uncooked)" },
  { kana:"おそい", romaji:"osoi", meaning:"slow / late" },
  { kana:"おちる", romaji:"ochiru", meaning:"to fall" },
  { kana:"おとな", romaji:"otona", meaning:"adult" },
  { kana:"おなか", romaji:"onaka", meaning:"stomach / belly" },
  { kana:"おにぎり", romaji:"onigiri", meaning:"rice ball" },
  { kana:"おはよう", romaji:"ohayou", meaning:"good morning" },
  { kana:"おふろ", romaji:"ofuro", meaning:"bath" },
  { kana:"おもい", romaji:"omoi", meaning:"heavy / feeling" },
  { kana:"おもしろい", romaji:"omoshiroi", meaning:"interesting / funny" },
  { kana:"おやすみ", romaji:"oyasumi", meaning:"good night" },
  { kana:"かいわ", romaji:"kaiwa", meaning:"conversation" },
  { kana:"かける", romaji:"kakeru", meaning:"to hang / to run / to call" },
  { kana:"かこ", romaji:"kako", meaning:"the past" },
  { kana:"かさ", romaji:"kasa", meaning:"umbrella" },
  { kana:"かのじょ", romaji:"kanojo", meaning:"she / girlfriend" },
  { kana:"かべ", romaji:"kabe", meaning:"wall" },
  { kana:"かもめ", romaji:"kamome", meaning:"seagull" },
  { kana:"からす", romaji:"karasu", meaning:"crow" },
  { kana:"かれ", romaji:"kare", meaning:"he / boyfriend" },
  { kana:"かわいい", romaji:"kawaii", meaning:"cute" },
  { kana:"きいろ", romaji:"kiiro", meaning:"yellow" },
  { kana:"きえる", romaji:"kieru", meaning:"to disappear" },
  { kana:"きく", romaji:"kiku", meaning:"to listen / chrysanthemum" },
  { kana:"きこえる", romaji:"kikoeru", meaning:"to be audible" },
  { kana:"きせつ", romaji:"kisetsu", meaning:"season" },
  { kana:"きつね", romaji:"kitsune", meaning:"fox" },
  { kana:"きのう", romaji:"kinou", meaning:"yesterday" },
  { kana:"きょう", romaji:"kyou", meaning:"today" },
  { kana:"きらい", romaji:"kirai", meaning:"dislike" },
  { kana:"きれい", romaji:"kirei", meaning:"pretty / clean" },
  { kana:"くだもの", romaji:"kudamono", meaning:"fruit" },
  { kana:"くらい", romaji:"kurai", meaning:"dark / about (approx.)" },
  { kana:"くれる", romaji:"kureru", meaning:"to give (to me)" },
  { kana:"けしき", romaji:"keshiki", meaning:"scenery" },
  { kana:"けむり", romaji:"kemuri", meaning:"smoke" },
  { kana:"こころ", romaji:"kokoro", meaning:"heart / mind" },
  { kana:"こたえ", romaji:"kotae", meaning:"answer" },
  { kana:"こども", romaji:"kodomo", meaning:"child" },
  { kana:"こまる", romaji:"komaru", meaning:"to be troubled" },
  { kana:"こわい", romaji:"kowai", meaning:"scary" },
  { kana:"さがす", romaji:"sagasu", meaning:"to search" },
  { kana:"さびしい", romaji:"sabishii", meaning:"lonely" },
  { kana:"さよなら", romaji:"sayonara", meaning:"goodbye" },
  { kana:"さる", romaji:"saru", meaning:"monkey" },
  { kana:"しあわせ", romaji:"shiawase", meaning:"happiness" },
  { kana:"しごと", romaji:"shigoto", meaning:"work / job" },
  { kana:"しずく", romaji:"shizuku", meaning:"droplet" },
  { kana:"した", romaji:"shita", meaning:"below / under" },
  { kana:"すごい", romaji:"sugoi", meaning:"amazing / wow" },
  { kana:"すずめ", romaji:"suzume", meaning:"sparrow" },
  { kana:"せかい", romaji:"sekai", meaning:"world" },
  { kana:"そうじ", romaji:"souji", meaning:"cleaning / sweeping" },
  { kana:"そと", romaji:"soto", meaning:"outside" },
  { kana:"たいこ", romaji:"taiko", meaning:"drum" },
  { kana:"たいよう", romaji:"taiyou", meaning:"sun" },
  { kana:"たから", romaji:"takara", meaning:"treasure" },
  { kana:"たこ", romaji:"tako", meaning:"octopus / kite" },
  { kana:"たすける", romaji:"tasukeru", meaning:"to help / to rescue" },
  { kana:"ただしい", romaji:"tadashii", meaning:"correct / right" },
  { kana:"たびびと", romaji:"tabibito", meaning:"traveller" },
  { kana:"たまご", romaji:"tamago", meaning:"egg" },
  { kana:"たまねぎ", romaji:"tamanegi", meaning:"onion" },
  { kana:"ちかい", romaji:"chikai", meaning:"near / close" },
  { kana:"ちかてつ", romaji:"chikatetsu", meaning:"subway" },
  { kana:"ちず", romaji:"chizu", meaning:"map" },
  { kana:"つくえ", romaji:"tsukue", meaning:"desk" },
  { kana:"つばめ", romaji:"tsubame", meaning:"swallow (bird)" },
  { kana:"つよい", romaji:"tsuyoi", meaning:"strong" },
  { kana:"てがみ", romaji:"tegami", meaning:"letter (mail)" },
  { kana:"てんき", romaji:"tenki", meaning:"weather" },
  { kana:"とうふ", romaji:"toufu", meaning:"tofu" },
  { kana:"とかげ", romaji:"tokage", meaning:"lizard" },
  { kana:"としょかん", romaji:"toshokan", meaning:"library" },
  { kana:"ともだち", romaji:"tomodachi", meaning:"friend" },
  { kana:"とんぼ", romaji:"tonbo", meaning:"dragonfly" },
  { kana:"なおす", romaji:"naosu", meaning:"to fix / to cure" },
  { kana:"なつかしい", romaji:"natsukashii", meaning:"nostalgic" },
  { kana:"なまえ", romaji:"namae", meaning:"name" },
  { kana:"ならう", romaji:"narau", meaning:"to learn" },
  { kana:"なわ", romaji:"nawa", meaning:"rope" },
  { kana:"にじ", romaji:"niji", meaning:"rainbow" },
  { kana:"にほん", romaji:"nihon", meaning:"Japan" },
  { kana:"ねがい", romaji:"negai", meaning:"wish / hope" },
  { kana:"ねむい", romaji:"nemui", meaning:"sleepy" },
  { kana:"のむ", romaji:"nomu", meaning:"to drink" },
  { kana:"はいる", romaji:"hairu", meaning:"to enter" },
  { kana:"はこ", romaji:"hako", meaning:"box" },
  { kana:"はじめ", romaji:"hajime", meaning:"beginning" },
  { kana:"はたらく", romaji:"hataraku", meaning:"to work" },
  { kana:"はなし", romaji:"hanashi", meaning:"story / talk" },
  { kana:"はる", romaji:"haru", meaning:"spring" },
  { kana:"ひこうき", romaji:"hikouki", meaning:"airplane" },
  { kana:"ひだり", romaji:"hidari", meaning:"left" },
  { kana:"ひつじ", romaji:"hitsuji", meaning:"sheep" },
  { kana:"ひみつ", romaji:"himitsu", meaning:"secret" },
  { kana:"ふじさん", romaji:"fujisan", meaning:"Mt. Fuji" },
  { kana:"ふたり", romaji:"futari", meaning:"two people" },
  { kana:"ふとい", romaji:"futoi", meaning:"fat / thick" },
  { kana:"まいにち", romaji:"mainichi", meaning:"every day" },
  { kana:"まきずし", romaji:"makizushi", meaning:"rolled sushi" },
  { kana:"まくら", romaji:"makura", meaning:"pillow" },
  { kana:"まける", romaji:"makeru", meaning:"to lose (a match)" },
  { kana:"まつり", romaji:"matsuri", meaning:"festival" },
  { kana:"まど", romaji:"mado", meaning:"window" },
  { kana:"みぎ", romaji:"migi", meaning:"right" },
  { kana:"みじかい", romaji:"mijikai", meaning:"short" },
  { kana:"みせ", romaji:"mise", meaning:"shop / store" },
  { kana:"みそしる", romaji:"misoshiru", meaning:"miso soup" },
  { kana:"みつける", romaji:"mitsukeru", meaning:"to find" },
  { kana:"みなと", romaji:"minato", meaning:"harbor / port" },
  { kana:"むかし", romaji:"mukashi", meaning:"long ago / old times" },
  { kana:"むずかしい", romaji:"muzukashii", meaning:"difficult" },
  { kana:"むら", romaji:"mura", meaning:"village" },
  { kana:"めがね", romaji:"megane", meaning:"glasses / spectacles" },
  { kana:"もみじ", romaji:"momiji", meaning:"autumn leaves / maple" },
  { kana:"もも", romaji:"momo", meaning:"peach / thigh" },
  { kana:"やさい", romaji:"yasai", meaning:"vegetable" },
  { kana:"やさしい", romaji:"yasashii", meaning:"kind / gentle" },
  { kana:"やせる", romaji:"yaseru", meaning:"to lose weight / to be thin" },
  { kana:"ゆうき", romaji:"yuuki", meaning:"courage" },
  { kana:"ゆき", romaji:"yuki", meaning:"snow" },
  { kana:"ゆめ", romaji:"yume", meaning:"dream" },
  { kana:"よい", romaji:"yoi", meaning:"good" },
  { kana:"よこ", romaji:"yoko", meaning:"side / horizontal" },
  { kana:"よむ", romaji:"yomu", meaning:"to read" },
  { kana:"よる", romaji:"yoru", meaning:"night" },
  { kana:"らいねん", romaji:"rainen", meaning:"next year" },
  { kana:"りょうり", romaji:"ryouri", meaning:"cooking / cuisine" },
  { kana:"れきし", romaji:"rekishi", meaning:"history" },
  { kana:"わかる", romaji:"wakaru", meaning:"to understand" },
  { kana:"わかれ", romaji:"wakare", meaning:"parting / farewell" },
  { kana:"わらう", romaji:"warau", meaning:"to laugh / to smile" },
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

function KanaTable({ rows, title, colLabels = COL_LABELS }) {
  const grid = buildTransposedGrid(rows);
  return (
    <div className="kana-table-wrapper">
      <h3 className="kana-table-title">{title}</h3>
      <div className="kana-grid" style={{ gridTemplateColumns: `28px repeat(${colLabels.length}, 1fr)` }}>
        {/* Header row */}
        <div className="kana-grid-row">
          <span className="kana-vowel-label" />
          {colLabels.map((c) => (
            <span key={c} className="kana-col-label">{c}</span>
          ))}
        </div>
        {/* Vowel rows */}
        {grid.map((row, vi) => (
          <div key={vi} className="kana-grid-row">
            <span className="kana-vowel-label">{VOWEL_LABELS[vi]}</span>
            {row.map((p, ci) =>
              p ? (
                <div key={ci} className="kana-cell kana-cell--clickable" onClick={() => speakKana(p.char)} title="Click to hear">
                  <span className="kana-char">{p.char}</span>
                  <span className="kana-romaji">{p.romaji}</span>
                  <span className="kana-speak-icon">🔊</span>
                </div>
              ) : (
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
  return (
    <div className="guide-tab">
      <div className="guide-section-label">Basic (清音)</div>
      <KanaTable rows={HIRAGANA_ROWS} title="Hiragana" />
      <KanaTable rows={KATAKANA_ROWS} title="Katakana" />
      <div className="guide-section-label">Voiced &amp; Semi-voiced (濁音・半濁音)</div>
      <KanaTable rows={HIRAGANA_VOICED_ROWS} title="Hiragana voiced" colLabels={VOICED_COL_LABELS} />
      <KanaTable rows={KATAKANA_VOICED_ROWS} title="Katakana voiced" colLabels={VOICED_COL_LABELS} />
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
        Yanlış Analizi
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
                  <span className="wa-char" onClick={() => speakKana(item.char)} title="Dinle">{item.char}</span>
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
              Yalnızca Yanlışları Çalış ({wrongItems.length})
            </button>
            <button
              className="practice-wrong-btn"
              style={{ background: '#374151', flex: '0 0 auto' }}
              onClick={onResetWrong}
            >
              Sıfırla
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

function PracticeTab({ selectedRows, setSelectedRows }) {
  const prefs = loadPrefs();

  const [mode, setMode] = useState(prefs.mode || "Hiragana");
  const [direction, setDirection] = useState(prefs.direction || "Kana → Romaji");
  const [includeVoiced, setIncludeVoiced] = useState(() => prefs.includeVoiced ?? false);
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

  // Derive base pool from mode + voiced toggle
  const baseBasic = mode === "Hiragana" ? HIRAGANA : mode === "Katakana" ? KATAKANA : ALL_KANA;
  const baseVoiced = mode === "Hiragana" ? HIRAGANA_VOICED : mode === "Katakana" ? KATAKANA_VOICED : [...HIRAGANA_VOICED, ...KATAKANA_VOICED];
  const basePool = includeVoiced ? [...baseBasic, ...baseVoiced] : baseBasic;

  // Filter by selected rows if any
  const pool = selectedRows === null
    ? basePool
    : basePool.filter(item => selectedRows.includes(item.char));
  const effectivePool = pool.length > 0 ? pool : basePool;

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
      const allSelected = chars.every(c => prev ? prev.includes(c) : true);
      let next;
      if (prev === null) {
        // Start from all selected, remove this row
        const allChars = basePool.map(i => i.char);
        next = allSelected ? allChars.filter(c => !chars.includes(c)) : [...allChars, ...chars.filter(c => !allChars.includes(c))];
      } else {
        next = allSelected ? prev.filter(c => !chars.includes(c)) : [...new Set([...prev, ...chars])];
      }
      if (next.length === basePool.length) next = null; // all = no filter
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
    unseenPoolRef.current = [...(newPool || effectivePool)];
    wrongQueueRef.current = [];
    cardCountRef.current = 0;
    lastCharRef.current = null;
  }

  // Pick next card
  const advance = useCallback(
    () => {
      cardCountRef.current += 1;
      const count = cardCountRef.current;

      // Initialize unseen pool on first call
      if (unseenPoolRef.current === null) {
        unseenPoolRef.current = [...effectivePool];
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
        unseenPoolRef.current = [...effectivePool];
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
    [effectivePool]
  );

  // When pool changes, reset round
  useEffect(() => {
    clearTimeout(advanceTimerRef.current);
    initRound(effectivePool);
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, direction, selectedRows, includeVoiced]);

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
        <button className="reset-btn" onClick={resetStats}>
          Reset Stats
        </button>
      </div>

      {/* Row selection */}
      <div className="row-select-bar">
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

      {/* Flash card */}
      <div className="flashcard-area">
        <div ref={feedbackFocusRef} tabIndex={-1} onKeyDown={handleKeyDown} style={{ outline: 'none', position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />
        <div
          className={`flashcard${feedback ? ` flashcard--${feedback}` : ""}`}
        >
          <span
            className={`flashcard-question${
              questionIsKana ? " flashcard-question--kana" : " flashcard-question--romaji"
            }`}
          >
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
            placeholder={
              direction === "Kana → Romaji" ? "Type romaji..." : "Type kana..."
            }
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
      // Tekrar başlat — yeni shuffle ile
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
          <span className="wrong-analysis-badge" style={{ marginLeft: '0.3rem', background: '#2563eb' }}>{selectedWords.size} seçili</span>
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
                <button className="reset-btn" onClick={() => setQuiz(null)}>Bitti</button>
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
                <input className="words-search" type="text" placeholder="Ara..." value={search} onChange={e => setSearch(e.target.value)} />
                <button className="submit-btn" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                  onClick={() => startQuiz(quizSource)} disabled={quizSource.length === 0}>
                  {selectedWords.size > 0 ? `Seçilileri Quiz (${selectedWords.size})` : `Quiz Başlat (${filteredWords.length})`}
                </button>
                {selectedWords.size > 0 && (
                  <button className="reset-btn" onClick={() => setSelectedWords(new Set())}>Seçimi Temizle</button>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6e7681', marginBottom: '0.25rem' }}>
                Karta tıkla: seç/kaldır &nbsp;·&nbsp; ✓ öğrendim işareti
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
                          <span className="word-learned-btn" onClick={(e) => { e.stopPropagation(); speakKana(w.kana, 1.0); }} title="Dinle">🔊</span>
                          <span
                            className={`word-learned-btn${isLearned ? ' word-learned-btn--active' : ''}`}
                            onClick={(e) => toggleLearned(w.kana, e)}
                            title={isLearned ? 'Öğrenildi (kaldır)' : 'Öğrendim'}
                          >✓</span>
                        </div>
                      </div>
                      <span className="word-romaji">{w.romaji}</span>
                      <span className="word-meaning">{w.meaning}</span>
                    </div>
                  );
                })}
                {filteredWords.length === 0 && (
                  <div style={{ color: '#8b949e', padding: '1rem', textAlign: 'center', gridColumn: '1/-1' }}>Kelime bulunamadı.</div>
                )}
              </div>
            </>
          )}
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
          {["Guide", "Practice"].map((t) => (
            <button
              key={t}
              className={`jk-tab${tab === t ? " jk-tab--active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

      </div>

      <div className="jk-body">
        {tab === "Guide" ? <GuideTab /> : <PracticeTab selectedRows={selectedRows} setSelectedRows={setSelectedRows} />}
      </div>
    </div>
  );
}
