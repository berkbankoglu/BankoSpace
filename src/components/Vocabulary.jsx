import { useState, useEffect, useRef, useCallback } from 'react';
import { pushKeyToSupabase } from '../supabase';
import './Vocabulary.css';

const COLORS = ['#5c7cfa','#7ee787','#f85149','#d29922','#bc8cff','#ff7b72','#79c0ff','#ffa657'];
const pad = (n) => String(n).padStart(2, '0');

function load(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
}

export default function Vocabulary() {
  const [groups,      setGroups]      = useState(() => load('vocab_groups', []));
  const [words,       setWords]       = useState(() => load('vocab_words',  []));
  const [selectedGid, setSelectedGid] = useState(null);
  const [editingGid,  setEditingGid]  = useState(null);
  const [editingGname,setEditingGname]= useState('');
  const [newGname,    setNewGname]    = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [wordInput,   setWordInput]   = useState('');
  const [transInput,  setTransInput]  = useState('');
  const [editingWid,  setEditingWid]  = useState(null);
  const [editWword,   setEditWword]   = useState('');
  const [editWtrans,  setEditWtrans]  = useState('');
  const [studyMode,   setStudyMode]   = useState(false);
  const [studyQueue,  setStudyQueue]  = useState([]);
  const [studyIdx,    setStudyIdx]    = useState(0);
  const [answer,      setAnswer]      = useState('');
  const [feedback,    setFeedback]    = useState(null); // null | 'correct' | 'wrong'
  const [score,       setScore]       = useState({ correct: 0, wrong: 0 });
  const [studyDone,   setStudyDone]   = useState(false);
  const [direction,   setDirection]   = useState('word'); // 'word' = show word type translation | 'trans' = reverse

  const wordInputRef = useRef(null);
  const answerRef    = useRef(null);

  useEffect(() => {
    localStorage.setItem('vocab_groups', JSON.stringify(groups));
    pushKeyToSupabase('vocab_groups', JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    localStorage.setItem('vocab_words', JSON.stringify(words));
    pushKeyToSupabase('vocab_words', JSON.stringify(words));
  }, [words]);

  useEffect(() => {
    if (studyMode && answerRef.current) answerRef.current.focus();
  }, [studyMode, studyIdx]);

  const selectedGroup = groups.find(g => g.id === selectedGid);
  const groupWords    = words.filter(w => w.groupId === selectedGid);

  /* ── Group ops ─────────────────────────────── */
  const addGroup = () => {
    const name = newGname.trim();
    if (!name) return;
    const ng = { id: Date.now(), name, color: COLORS[groups.length % COLORS.length] };
    setGroups(prev => [...prev, ng]);
    setSelectedGid(ng.id);
    setNewGname('');
    setAddingGroup(false);
  };

  const deleteGroup = (gid) => {
    setGroups(prev => prev.filter(g => g.id !== gid));
    setWords(prev => prev.filter(w => w.groupId !== gid));
    if (selectedGid === gid) setSelectedGid(null);
  };

  const renameGroup = () => {
    const name = editingGname.trim();
    if (!name) { setEditingGid(null); return; }
    setGroups(prev => prev.map(g => g.id === editingGid ? { ...g, name } : g));
    setEditingGid(null);
  };

  /* ── Word ops ──────────────────────────────── */
  const addWord = () => {
    const w = wordInput.trim();
    const t = transInput.trim();
    if (!w || !t || !selectedGid) return;
    setWords(prev => [...prev, { id: Date.now(), groupId: selectedGid, word: w, translation: t }]);
    setWordInput('');
    setTransInput('');
    wordInputRef.current?.focus();
  };

  const deleteWord = (wid) => setWords(prev => prev.filter(w => w.id !== wid));

  const saveEditWord = () => {
    const w = editWword.trim();
    const t = editWtrans.trim();
    if (!w || !t) return;
    setWords(prev => prev.map(x => x.id === editingWid ? { ...x, word: w, translation: t } : x));
    setEditingWid(null);
  };

  /* ── Study ops ─────────────────────────────── */
  const startStudy = (dir = direction) => {
    if (groupWords.length === 0) return;
    const shuffled = [...groupWords].sort(() => Math.random() - 0.5);
    setStudyQueue(shuffled);
    setStudyIdx(0);
    setAnswer('');
    setFeedback(null);
    setScore({ correct: 0, wrong: 0 });
    setStudyDone(false);
    setDirection(dir);
    setStudyMode(true);
  };

  const submitAnswer = useCallback(() => {
    if (feedback) return;
    const current = studyQueue[studyIdx];
    const correct  = direction === 'word' ? current.translation : current.word;
    const isRight  = answer.trim().toLowerCase() === correct.trim().toLowerCase();
    setFeedback(isRight ? 'correct' : 'wrong');
    setScore(s => isRight ? { ...s, correct: s.correct + 1 } : { ...s, wrong: s.wrong + 1 });
    setTimeout(() => {
      if (studyIdx + 1 >= studyQueue.length) {
        setStudyDone(true);
      } else {
        setStudyIdx(i => i + 1);
        setAnswer('');
        setFeedback(null);
      }
    }, 900);
  }, [feedback, studyQueue, studyIdx, answer, direction]);

  const skipWord = () => {
    if (studyIdx + 1 >= studyQueue.length) setStudyDone(true);
    else { setStudyIdx(i => i + 1); setAnswer(''); setFeedback(null); }
  };

  const current = studyQueue[studyIdx];
  const prompt  = current ? (direction === 'word' ? current.word : current.translation) : '';
  const totalScore = score.correct + score.wrong;

  /* ── Render ────────────────────────────────── */
  return (
    <div className="vocab-wrap">

      {/* Left: group list */}
      <div className="vocab-sidebar">
        <div className="vocab-sidebar-header">
          <span className="vocab-sidebar-title">Groups</span>
          <button className="vocab-add-group-btn" onClick={() => setAddingGroup(true)} title="New group">+</button>
        </div>

        {addingGroup && (
          <div className="vocab-new-group-row">
            <input
              className="vocab-group-input"
              placeholder="Group name..."
              value={newGname}
              onChange={e => setNewGname(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addGroup(); if (e.key === 'Escape') { setAddingGroup(false); setNewGname(''); } }}
              autoFocus
            />
            <button className="vocab-group-confirm" onClick={addGroup}>✓</button>
          </div>
        )}

        <div className="vocab-group-list">
          {groups.length === 0 && <div className="vocab-empty-hint">No groups yet</div>}
          {groups.map(g => {
            const cnt = words.filter(w => w.groupId === g.id).length;
            return (
              <div
                key={g.id}
                className={`vocab-group-item${selectedGid === g.id ? ' active' : ''}`}
                onClick={() => { setSelectedGid(g.id); setStudyMode(false); }}
              >
                <span className="vocab-group-dot" style={{ background: g.color }} />
                {editingGid === g.id ? (
                  <input
                    className="vocab-group-rename"
                    value={editingGname}
                    onChange={e => setEditingGname(e.target.value)}
                    onBlur={renameGroup}
                    onKeyDown={e => { if (e.key === 'Enter') renameGroup(); if (e.key === 'Escape') setEditingGid(null); e.stopPropagation(); }}
                    onClick={e => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span
                    className="vocab-group-name"
                    onDoubleClick={e => { e.stopPropagation(); setEditingGid(g.id); setEditingGname(g.name); }}
                  >{g.name}</span>
                )}
                <span className="vocab-group-count">{cnt}</span>
                <button className="vocab-group-del" onClick={e => { e.stopPropagation(); deleteGroup(g.id); }} title="Delete">×</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div className="vocab-main">
        {!selectedGid && (
          <div className="vocab-placeholder">
            <div className="vocab-placeholder-icon">📚</div>
            <div className="vocab-placeholder-text">Select or create a group to start</div>
          </div>
        )}

        {selectedGid && !studyMode && (
          <>
            {/* Header */}
            <div className="vocab-main-header">
              <div className="vocab-main-title" style={{ color: selectedGroup?.color }}>{selectedGroup?.name}</div>
              <div className="vocab-main-actions">
                {groupWords.length > 0 && (
                  <>
                    <button className="vocab-study-btn" onClick={() => startStudy('word')}>
                      Study (Word → Trans)
                    </button>
                    <button className="vocab-study-btn vocab-study-btn-rev" onClick={() => startStudy('trans')}>
                      Study (Trans → Word)
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Add word row */}
            <div className="vocab-add-row">
              <input
                ref={wordInputRef}
                className="vocab-word-input"
                placeholder="Word / term..."
                value={wordInput}
                onChange={e => setWordInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); document.getElementById('vocab-trans-input')?.focus(); } if (e.key === 'Enter') addWord(); }}
              />
              <span className="vocab-add-arrow">→</span>
              <input
                id="vocab-trans-input"
                className="vocab-word-input"
                placeholder="Translation / meaning..."
                value={transInput}
                onChange={e => setTransInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addWord(); }}
              />
              <button className="vocab-add-word-btn" onClick={addWord} disabled={!wordInput.trim() || !transInput.trim()}>Add</button>
            </div>

            {/* Word list */}
            <div className="vocab-word-list">
              {groupWords.length === 0 && <div className="vocab-empty-hint" style={{ padding: '20px' }}>Add your first word above</div>}
              {groupWords.map((w, i) => (
                <div key={w.id} className="vocab-word-row">
                  {editingWid === w.id ? (
                    <>
                      <span className="vocab-word-idx">{i + 1}</span>
                      <input className="vocab-word-edit-input" value={editWword} onChange={e => setEditWword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEditWord(); if (e.key === 'Escape') setEditingWid(null); }} autoFocus />
                      <span className="vocab-add-arrow">→</span>
                      <input className="vocab-word-edit-input" value={editWtrans} onChange={e => setEditWtrans(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEditWord(); if (e.key === 'Escape') setEditingWid(null); }} />
                      <button className="vocab-word-save-btn" onClick={saveEditWord}>✓</button>
                      <button className="vocab-word-cancel-btn" onClick={() => setEditingWid(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      <span className="vocab-word-idx">{i + 1}</span>
                      <span className="vocab-word-text">{w.word}</span>
                      <span className="vocab-add-arrow">→</span>
                      <span className="vocab-trans-text">{w.translation}</span>
                      <button className="vocab-word-edit-btn" onClick={() => { setEditingWid(w.id); setEditWword(w.word); setEditWtrans(w.translation); }} title="Edit">✎</button>
                      <button className="vocab-word-del-btn" onClick={() => deleteWord(w.id)} title="Delete">×</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Study mode */}
        {selectedGid && studyMode && !studyDone && current && (
          <div className="vocab-study">
            <div className="vocab-study-top">
              <button className="vocab-study-exit" onClick={() => setStudyMode(false)}>✕ Exit</button>
              <div className="vocab-study-progress-bar">
                <div className="vocab-study-progress-fill" style={{ width: `${(studyIdx / studyQueue.length) * 100}%` }} />
              </div>
              <span className="vocab-study-counter">{studyIdx + 1} / {studyQueue.length}</span>
            </div>

            <div className={`vocab-study-card${feedback ? ` ${feedback}` : ''}`}>
              <div className="vocab-study-dir-label">{direction === 'word' ? 'Type the translation' : 'Type the word'}</div>
              <div className="vocab-study-prompt">{prompt}</div>

              {feedback && (
                <div className="vocab-study-answer-reveal">
                  {feedback === 'wrong' && (
                    <div className="vocab-correct-answer">
                      Correct: <strong>{direction === 'word' ? current.translation : current.word}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="vocab-study-input-row">
              <input
                ref={answerRef}
                className={`vocab-study-input${feedback ? ` ${feedback}` : ''}`}
                placeholder="Type your answer..."
                value={answer}
                onChange={e => { if (!feedback) setAnswer(e.target.value); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitAnswer();
                  if (e.key === 'Tab') { e.preventDefault(); skipWord(); }
                }}
                disabled={!!feedback}
              />
              <button className="vocab-study-check-btn" onClick={submitAnswer} disabled={!!feedback || !answer.trim()}>
                Check
              </button>
              <button className="vocab-study-skip-btn" onClick={skipWord} title="Skip (Tab)">Skip</button>
            </div>
            <div className="vocab-study-hint">Enter to check · Tab to skip</div>

            <div className="vocab-study-score-row">
              <span className="vocab-score-correct">✓ {score.correct}</span>
              <span className="vocab-score-wrong">✗ {score.wrong}</span>
            </div>
          </div>
        )}

        {/* Study done */}
        {selectedGid && studyMode && studyDone && (
          <div className="vocab-study-results">
            <div className="vocab-results-title">Session Complete</div>
            <div className="vocab-results-stats">
              <div className="vocab-results-stat correct">
                <span className="vocab-results-num">{score.correct}</span>
                <span className="vocab-results-label">Correct</span>
              </div>
              <div className="vocab-results-stat wrong">
                <span className="vocab-results-num">{score.wrong}</span>
                <span className="vocab-results-label">Wrong</span>
              </div>
              <div className="vocab-results-stat total">
                <span className="vocab-results-num">{Math.round((score.correct / studyQueue.length) * 100)}%</span>
                <span className="vocab-results-label">Score</span>
              </div>
            </div>
            <div className="vocab-results-actions">
              <button className="vocab-study-btn" onClick={() => startStudy(direction)}>Study Again</button>
              <button className="vocab-study-btn vocab-study-btn-rev" onClick={() => startStudy(direction === 'word' ? 'trans' : 'word')}>Reverse</button>
              <button className="vocab-study-exit" onClick={() => setStudyMode(false)}>Back to List</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
