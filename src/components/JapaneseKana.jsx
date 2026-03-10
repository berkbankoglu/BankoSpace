import { useState, useEffect, useCallback, useRef } from "react";
import "./JapaneseKana.css";

function speakKana(char) {
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(char);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.5;
    utterance.pitch = 1.0;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  } catch {}
}

let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playCorrectSound() {
  try {
    const ctx = getAudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.setValueAtTime(520, ctx.currentTime);
    o.frequency.setValueAtTime(660, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    o.start(); o.stop(ctx.currentTime + 0.35);
  } catch {}
}

function playWrongSound() {
  try {
    const ctx = getAudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sawtooth'; o.frequency.setValueAtTime(220, ctx.currentTime);
    o.frequency.setValueAtTime(160, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.start(); o.stop(ctx.currentTime + 0.3);
  } catch {}
}

function playTypeSound() {
  try {
    const ctx = getAudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
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

// ── Spaced-repetition helper ──────────────────────────────────────────────────

function getWeight(stat) {
  if (!stat) return 4; // unseen: medium priority
  const correct = stat.correct || 0;
  const wrong = stat.wrong || 0;
  if (wrong === 0 && correct > 0) return 1; // known well → rare
  return Math.max(2, 1 + wrong * 4 - correct);
}

function pickWeightedRandom(pool, stats, excludeChar) {
  // Exclude last shown card (unless pool has only 1 item)
  const candidates = pool.length > 1 ? pool.filter(i => i.char !== excludeChar) : pool;
  const weights = candidates.map((item) => getWeight(stats[item.char]));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
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

function PracticeTab() {
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
  const [selectedRows, setSelectedRows] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kana_selected_rows')) || null; } catch { return null; }
  });

  const inputRef = useRef(null);
  const feedbackFocusRef = useRef(null);
  const advanceTimerRef = useRef(null);
  const lastCharRef = useRef(null);

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

  // Pick next card
  const advance = useCallback(
    (currentStats) => {
      const nextStats = currentStats || stats;
      const next = pickWeightedRandom(effectivePool, nextStats, lastCharRef.current);
      lastCharRef.current = next.char;
      setCurrent(next);
      setInput("");
      setFeedback(null);
      setCorrectAnswer("");
      setTimeout(() => { inputRef.current?.focus(); }, 80);
    },
    [pool, stats]
  );

  // When pool changes, reset current card
  useEffect(() => {
    clearTimeout(advanceTimerRef.current);
    advance(stats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, direction, selectedRows]);

  // Initial card
  useEffect(() => {
    if (!current) advance(stats);
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
      playCorrectSound();
      setFeedback("correct");
      setStreak((s) => s + 1);
      advanceTimerRef.current = setTimeout(() => advance(newStats), 600);
    } else {
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
      advance(stats);
    }
  }

  function resetStats() {
    clearTimeout(advanceTimerRef.current);
    const empty = {};
    setStats(empty);
    saveStats(empty);
    setStreak(0);
    advance(empty);
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
        <div className="toggle-group">
          {["Kana → Romaji", "Romaji → Kana"].map((d) => (
            <button
              key={d}
              className={`toggle-btn${direction === d ? " toggle-btn--active" : ""}`}
              onClick={() => setDirectionAndReset(d)}
            >
              {d}
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
                <button className="next-btn" onClick={() => advance(stats)}>
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
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export default function JapaneseKana() {
  const [tab, setTab] = useState("Guide");

  return (
    <div className="japanese-kana">
      <div className="jk-header">
        <h2 className="jk-title">Japanese Kana</h2>
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
        {tab === "Guide" ? <GuideTab /> : <PracticeTab />}
      </div>
    </div>
  );
}
