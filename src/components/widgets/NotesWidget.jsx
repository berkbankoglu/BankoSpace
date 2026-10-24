import { useEffect, useState } from 'react';
import WidgetFrame, { WidgetEmpty } from './WidgetFrame';

// Pinned notes first, then the ones touched most recently. A row opens that
// note; ↗ opens Notes as it was.
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

export function notesToShow(notes) {
  return [...notes]
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
      || (Date.parse(b.updatedAt || 0) || 0) - (Date.parse(a.updatedAt || 0) || 0))
    .slice(0, MAX_ROWS);
}

export default function NotesWidget({ collapsed, onToggle, onOpenNotes }) {
  const [notes, setNotes] = useState(read);

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
      ) : shown.map(n => (
        <button
          key={n.id}
          className="wg-row"
          style={{ '--wg-accent': n.color || 'var(--border)' }}
          onClick={() => onOpenNotes(n.id)}
          title={n.title || 'Untitled'}
        >
          <div className="wg-row-main">
            <span className="wg-row-name">{n.title || 'Untitled'}</span>
            <span className="wg-row-sub">{plain(n.content).slice(0, 120) || 'Empty note'}</span>
          </div>
          <span className="wg-row-meta">{n.pinned ? 'Pinned' : when(n.updatedAt)}</span>
        </button>
      ))}
    </WidgetFrame>
  );
}
