import { useState } from 'react';
import { SECTION_BLURBS } from '../utils/onboarding';
import './SectionPicker.css';

// Shown once, to someone new: which parts of the app they mean to use. The
// rest are hidden from the sidebar — not removed; Settings → Pages turns any
// of them back on — so the first look at the app is the handful of things
// they came for, not every feature it has.
export default function SectionPicker({ sections, onDone }) {
  const [chosen, setChosen] = useState(() => new Set());
  const toggle = (id) => setChosen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="sp-backdrop">
      <div className="sp-card" role="dialog" aria-labelledby="sp-title">
        <h2 id="sp-title" className="sp-title">What will you use?</h2>
        <p className="sp-lead">
          Pick the sections you want in the sidebar. The others are hidden, not
          deleted — turn any of them on later in Settings → Pages.
        </p>
        <div className="sp-grid">
          {sections.map(s => {
            const on = chosen.has(s.id);
            return (
              <button
                key={s.id}
                className={`sp-option${on ? ' on' : ''}`}
                onClick={() => toggle(s.id)}
                aria-pressed={on}
              >
                <span className="sp-icon">{s.icon}</span>
                <span className="sp-text">
                  <span className="sp-name">{s.label}</span>
                  <span className="sp-blurb">{SECTION_BLURBS[s.id] || ''}</span>
                </span>
                <span className="sp-tick">{on ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>
        <div className="sp-foot">
          <span className="sp-count">
            {chosen.size === 0 ? 'Only the Dashboard for now' : `${chosen.size} section${chosen.size === 1 ? '' : 's'} + Dashboard`}
          </span>
          <button className="sp-continue" onClick={() => onDone(chosen)}>Continue</button>
        </div>
      </div>
    </div>
  );
}
