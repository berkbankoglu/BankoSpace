import { useEffect, useState } from 'react';
import WidgetFrame, { WidgetEmpty } from './WidgetFrame';
import NoteQuickEdit from './NoteQuickEdit';
import { isTauri } from '../../platform';
import { openNoteWindow } from '../../utils/noteWindow';

// Pinned notes first, then the ones touched most recently. A click on a row
// folds its pages open beneath it — the main page and every sub-note, each
// opening on its own page. The button at the row's right opens the note
// itself: its own window in the desktop app, a card over the page on the web.
// ↗ in the header opens Notes as it was.
const read = () => { try { return JSON.parse(localStorage.getItem('notes')) || []; } catch { return []; } };
const plain = (html) => String(html || '')
  .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

function when(iso) {
  const t = Date.parse(iso);
  if (!t) return '';
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export const MAX_ROWS = 6;

// Which notes have their sub-notes listed. Per device: it is how this
// dashboard is arranged, not data.
const OPEN_KEY = 'notesWidgetOpen_v1';
const readOpen = () => { try { return JSON.parse(localStorage.getItem(OPEN_KEY)) || {}; } catch { return {}; } };
const pages = (k) => `${k} page${k === 1 ? '' : 's'}`;

export function notesToShow(notes) {
  return [...notes]
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
      || (Date.parse(b.updatedAt || 0) || 0) - (Date.parse(a.updatedAt || 0) || 0))
    .slice(0, MAX_ROWS);
}

export default function NotesWidget({ collapsed, onToggle, onOpenNotes }) {
  const [notes, setNotes] = useState(read);
  const [quick, setQuick] = useState(null); // { id, subId, rect }
  const [open, setOpen] = useState(readOpen);
  const toggle = (id) => setOpen(prev => {
    const next = { ...prev };
    if (next[id]) delete next[id]; else next[id] = true;
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const openNote = (n, subId, el) => {
    if (isTauri) { openNoteWindow(n, subId); return; }
    setQuick({ id: n.id, subId, rect: el.getBoundingClientRect() });
  };

  useEffect(() => {
    const reload = () => setNotes(read());
    window.addEventListener('notes-updated', reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener('notes-updated', reload);
      window.removeEventListener('storage', reload);
    };
  }, []);

  const shown = notesToShow(notes);

  return (
    <>
    <WidgetFrame
      title="Notes"
      badge={notes.length || null}
      collapsed={collapsed}
      onToggle={onToggle}
      onOpen={() => onOpenNotes()}
      openTitle="Open Notes"
    >
      {shown.length === 0 ? (
        <WidgetEmpty action="Write a note" onAction={() => onOpenNotes()}>No notes yet.</WidgetEmpty>
      ) : shown.map(n => {
        const subs = n.subNotes || [];
        const isOpen = !!open[n.id];
        return (
          <div key={n.id} className="wg-note">
            <div
              role="button"
              tabIndex={0}
              className="wg-row"
              style={{ '--wg-accent': n.color || 'var(--border)' }}
              onClick={() => toggle(n.id)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(n.id); }
              }}
              title={isOpen ? 'Hide pages' : 'Show pages'}
              aria-expanded={isOpen}
            >
              <div className="wg-row-main">
                <span className="wg-row-name">{n.title || 'Untitled'}</span>
                <span className="wg-row-sub">
                  {plain(n.content).slice(0, 120) || (subs.length ? pages(subs.length) : 'Empty note')}
                </span>
              </div>
              <span className="wg-row-meta">{n.pinned ? 'Pinned' : when(n.updatedAt)}</span>
              <button
                className="wg-note-open"
                onClick={(e) => { e.stopPropagation(); openNote(n, null, e.currentTarget.closest('.wg-row')); }}
                title="Open in a window"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="7" width="13" height="13" rx="2" /><path d="M10 4h10v10M20 4l-8 8" /></svg>
              </button>
            </div>
            {/* Folds open with the same grid-row movement as the panels. */}
            <div className={`wg-note-fold${isOpen ? ' open' : ''}`}>
              <div>
                <div className="wg-note-subs">
                  <button
                    className="wg-note-sub"
                    tabIndex={isOpen ? 0 : -1}
                    onClick={(e) => openNote(n, null, e.currentTarget)}
                    title="Open the main page"
                  >
                    <span className="wg-note-sub-name">Main page</span>
                    <span className="wg-note-sub-text">{plain(n.content).slice(0, 80) || 'Empty'}</span>
                  </button>
                  {subs.map(sn => (
                    <button
                      key={sn.id}
                      className="wg-note-sub"
                      tabIndex={isOpen ? 0 : -1}
                      onClick={(e) => openNote(n, sn.id, e.currentTarget)}
                      title={sn.title || 'Sub Note'}
                    >
                      <span className="wg-note-sub-name">{sn.title || 'Sub Note'}</span>
                      <span className="wg-note-sub-text">{plain(sn.content).slice(0, 80)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </WidgetFrame>
    {quick && (
      <NoteQuickEdit
        noteId={quick.id}
        initialSubId={quick.subId}
        fromRect={quick.rect}
        onClose={() => setQuick(null)}
        onOpenInNotes={() => { const id = quick.id; setQuick(null); onOpenNotes(id); }}
      />
    )}
    </>
  );
}
