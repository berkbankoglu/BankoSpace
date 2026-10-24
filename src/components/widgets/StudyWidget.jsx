import { useEffect, useState } from 'react';
import WidgetFrame, { WidgetEmpty } from './WidgetFrame';

// What is waiting to be studied, and one click into practice. Flash cards have
// no review schedule, so "to review" means every card not yet marked known —
// said that way on the widget rather than dressed up as "due today".
const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };

export function studySummary() {
  const cards = read('flashCards', []);
  const best = read('kana_best_score', null);
  const stats = read('kana_stats', {});
  const learned = read('kana_learned_words', []);
  return {
    cards: cards.length,
    toReview: cards.filter(c => c.known !== true).length,
    known: cards.filter(c => c.known === true).length,
    bestStreak: best?.score || 0,
    practised: stats && typeof stats === 'object' ? Object.keys(stats).length : 0,
    learnedWords: Array.isArray(learned) ? learned.length : 0,
  };
}

export default function StudyWidget({ collapsed, onToggle, onOpenStudy }) {
  const [s, setS] = useState(studySummary);

  useEffect(() => {
    const reload = () => setS(studySummary());
    window.addEventListener('flashcards-updated', reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener('flashcards-updated', reload);
      window.removeEventListener('storage', reload);
    };
  }, []);

  const nothingYet = s.cards === 0 && s.practised === 0;

  return (
    <WidgetFrame
      title="Study"
      collapsed={collapsed}
      onToggle={onToggle}
      onOpen={() => onOpenStudy('guide')}
      openTitle="Open Language Learn"
    >
      {nothingYet ? (
        <WidgetEmpty action="Start with kana" onAction={() => onOpenStudy('practice')}>Nothing studied yet.</WidgetEmpty>
      ) : (
        <>
          <div className="wg-stats">
            <div className="wg-stat">
              <div className="wg-stat-value">{s.toReview}</div>
              <div className="wg-stat-label">cards to review</div>
            </div>
            <div className="wg-stat">
              <div className="wg-stat-value">{s.known}</div>
              <div className="wg-stat-label">cards known</div>
            </div>
            <div className="wg-stat">
              <div className="wg-stat-value">{s.bestStreak}</div>
              <div className="wg-stat-label">best kana streak</div>
            </div>
            {s.learnedWords > 0 && (
              <div className="wg-stat">
                <div className="wg-stat-value">{s.learnedWords}</div>
                <div className="wg-stat-label">words learned</div>
              </div>
            )}
          </div>
          <div className="wg-actions">
            <button className="wg-btn" onClick={() => onOpenStudy('flashcards')} disabled={!s.cards}>Practise cards</button>
            <button className="wg-btn" onClick={() => onOpenStudy('practice')}>Practise kana</button>
          </div>
        </>
      )}
    </WidgetFrame>
  );
}
