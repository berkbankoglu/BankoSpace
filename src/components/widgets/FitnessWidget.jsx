import { useEffect, useState } from 'react';
import WidgetFrame, { WidgetEmpty } from './WidgetFrame';

// Today's calories against the target, with the macros. The target itself is
// worked out on the Fitness page (from the profile and the goal) and left in
// `ft_goal_kcal`; the widget only reads it, so the two can never disagree.
const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
// The Fitness page files meals under the UTC date; so does this.
const todayKey = () => new Date().toISOString().slice(0, 10);

export function fitnessToday() {
  const meals = read('ft_meals', {});
  const day = Array.isArray(meals?.[todayKey()]) ? meals[todayKey()] : [];
  const sum = (f) => Math.round(day.reduce((t, m) => t + (Number(m?.[f]) || 0), 0));
  const goal = Number(localStorage.getItem('ft_goal_kcal')) || null;
  return { meals: day.length, kcal: sum('kcal'), p: sum('p'), c: sum('c'), f: sum('f'), goal };
}

export default function FitnessWidget({ collapsed, onToggle, onOpenFitness }) {
  const [d, setD] = useState(fitnessToday);

  useEffect(() => {
    const reload = () => setD(fitnessToday());
    window.addEventListener('storage', reload);
    const iv = setInterval(reload, 60000);
    return () => { window.removeEventListener('storage', reload); clearInterval(iv); };
  }, []);

  const pct = d.goal ? Math.min(100, Math.round((d.kcal / d.goal) * 100)) : 0;
  const left = d.goal ? d.goal - d.kcal : null;

  return (
    <WidgetFrame
      title="Fitness"
      badge={d.goal ? `${d.kcal} / ${d.goal}` : (d.kcal || null)}
      collapsed={collapsed}
      onToggle={onToggle}
      onOpen={onOpenFitness}
      openTitle="Open Fitness"
    >
      {d.meals === 0 && !d.goal ? (
        <WidgetEmpty action="Log a meal" onAction={onOpenFitness}>Nothing logged today.</WidgetEmpty>
      ) : (
        <>
          {d.goal ? (
            <>
              <div className="wg-meter"><div className={`wg-meter-fill${d.kcal > d.goal ? ' over' : ''}`} style={{ width: `${pct}%` }} /></div>
              <div className="wg-meter-caption">
                <span>{d.kcal} kcal eaten</span>
                <span>{left >= 0 ? `${left} left` : `${-left} over`}</span>
              </div>
            </>
          ) : (
            <div className="wg-meter-caption"><span>{d.kcal} kcal today</span><span>Set a goal on the Fitness page</span></div>
          )}
          <div className="wg-stats">
            <div className="wg-stat"><div className="wg-stat-value">{d.p}g</div><div className="wg-stat-label">protein</div></div>
            <div className="wg-stat"><div className="wg-stat-value">{d.c}g</div><div className="wg-stat-label">carbs</div></div>
            <div className="wg-stat"><div className="wg-stat-value">{d.f}g</div><div className="wg-stat-label">fat</div></div>
          </div>
        </>
      )}
    </WidgetFrame>
  );
}
