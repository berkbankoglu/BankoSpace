import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RichTextEditor } from '../Notes';
import { readSavedNotes, persistNotes } from '../../utils/notesPersistence';
import './NoteQuickEdit.css';

// A note opened from the dashboard: just that note, in the same editor Notes
// uses. In the desktop app it is its own window (note.html, opened by
// utils/noteWindow.js); on the web, where there are no windows, it floats over
// the page. Writes go straight to the saved notes and are announced with
// 'notes-updated', the event Notes and the widget already listen for. From a
// separate window the main window hears them as a storage event and sends them
// up (src/sync.js).

const findNote = (id) => readSavedNotes().find(n => n.id === id) || null;

// subId null is the note's own page; otherwise one of its sub-notes.
export function patchNote(id, subId, patch) {
  const notes = readSavedNotes();
  const note = notes.find(n => n.id === id);
  if (!note) return;
  // The editor also reports on close; an unchanged page is not an edit and
  // must not move the note to the top of the list.
  const target = subId == null ? note : (note.subNotes || []).find(sn => sn.id === subId);
  if (!target || Object.keys(patch).every(k => (target[k] ?? '') === (patch[k] ?? ''))) return;
  const now = new Date().toISOString();
  persistNotes(notes.map(n => {
    if (n.id !== id) return n;
    if (subId == null) return { ...n, ...patch, updatedAt: now };
    return { ...n, updatedAt: now, subNotes: (n.subNotes || []).map(sn => (sn.id === subId ? { ...sn, ...patch } : sn)) };
  }));
  window.dispatchEvent(new Event('notes-updated'));
}

// An editor that was opened and left empty still saves "<div><br></div>".
const isBlank = (html) => !String(html || '').replace(/<(?!img|canvas)[^>]*>/gi, '').replace(/&nbsp;/g, ' ').trim()
  && !/<(img|canvas)|data-img/i.test(String(html || ''));

const CLOSE_MS = 180;

export default function NoteQuickEdit({ noteId, initialSubId = null, fromRect, onClose, onOpenInNotes, onDragStart, asWindow = false }) {
  const [note, setNote] = useState(() => findNote(noteId));
  const [closing, setClosing] = useState(false);
  // Set once the closing animation has played: the editor unmounts, which
  // saves whatever was typed in its last few hundred milliseconds, and only
  // then does the window go.
  const [gone, setGone] = useState(null);
  const [title, setTitle] = useState(note?.title || '');
  // Opens on the note's own page, or on its first sub-note when that page is
  // empty and the writing lives in the sub-notes.
  // A sub-note asked for by the dashboard opens on that page.
  const [subId, setSubId] = useState(() => {
    if (initialSubId != null && note?.subNotes?.some(sn => sn.id === initialSubId)) return initialSubId;
    return (isBlank(note?.content) && note?.subNotes?.length) ? note.subNotes[0].id : null;
  });

  // The window is already open and another of its pages was picked.
  useEffect(() => {
    const onPick = (e) => setSubId(e.detail ?? null);
    window.addEventListener('nq-select-sub', onPick);
    return () => window.removeEventListener('nq-select-sub', onPick);
  }, []);
  const cardRef = useRef(null);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // The same note changed elsewhere — Notes, the other machine, or another
  // window — while this is open.
  useEffect(() => {
    const reload = () => {
      const n = findNote(noteId);
      if (!n) { onCloseRef.current(); return; }
      setNote(n);
    };
    const onStorage = (e) => { if (e.key === 'notes') reload(); };
    window.addEventListener('notes-updated', reload);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('notes-updated', reload);
      window.removeEventListener('storage', onStorage);
    };
  }, [noteId]);

  const close = (then) => {
    if (closingRef.current) return;
    closingRef.current = true;
    // A window just goes; over the page the card plays its way out first.
    if (asWindow) { setGone(() => then || onCloseRef.current); return; }
    setClosing(true);
    setTimeout(() => setGone(() => then || onCloseRef.current), CLOSE_MS);
  };

  useEffect(() => { if (gone) gone(); }, [gone]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Caret at the end of the note, ready to type.
  useEffect(() => {
    const t = setTimeout(() => {
      const ed = cardRef.current?.querySelector('[contenteditable]');
      if (!ed) return;
      ed.focus();
      const r = document.createRange();
      r.selectNodeContents(ed);
      r.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }, asWindow ? 0 : 60);
    return () => clearTimeout(t);
  }, []);

  if (!note || gone) return null;

  // Over the page, the card starts small over the clicked row and grows into
  // place. As a window it grows from just under its title bar.
  const origin = fromRect
    ? {
        '--nq-dx': `${fromRect.left + fromRect.width / 2 - window.innerWidth / 2}px`,
        '--nq-dy': `${fromRect.top + fromRect.height / 2 - window.innerHeight / 2}px`,
      }
    : {};

  const saveTitle = () => {
    const t = title.trim() || 'Untitled';
    if (t !== note.title) patchNote(noteId, null, { title: t });
  };

  const subs = note.subNotes || [];
  const page = subId == null ? null : subs.find(sn => sn.id === subId);
  const content = (page ? page.content : note.content) || '';

  const card = (
    <div
      ref={cardRef}
      className="nq-card"
      style={{ ...origin, '--nq-accent': note.color || 'var(--border)' }}
      role="dialog"
      aria-label={note.title || 'Note'}
    >
      <div
        className="nq-head"
        // The whole top bar moves the window, except the title field itself
        // and the buttons.
        onMouseDown={(e) => {
          if (!asWindow || !onDragStart || e.button !== 0 || e.target.closest('button, input')) return;
          e.preventDefault();
          onDragStart();
        }}
      >
        <span className="nq-dot" />
        <input
          size={Math.max(6, title.length + 1)}
          className="nq-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              saveTitle();
              cardRef.current?.querySelector('[contenteditable]')?.focus();
            }
          }}
          placeholder="Untitled"
        />
        <span className="nq-grab" />
        <button className="nq-btn" onClick={() => close(onOpenInNotes)} title="Open in Notes">↗</button>
        <button className="nq-btn" onClick={() => close()} title="Close (Esc)">✕</button>
      </div>
      <div className="nq-main">
        {/* The note's pages down the left, the open one beside them. */}
        {subs.length > 0 && (
          <nav className="nq-pages">
            <button className={`nq-tab${subId == null ? ' active' : ''}`} onClick={() => setSubId(null)} title={note.title || 'Main'}>Main</button>
            {subs.map(sn => (
              <button key={sn.id} className={`nq-tab${subId === sn.id ? ' active' : ''}`} onClick={() => setSubId(sn.id)} title={sn.title || 'Sub Note'}>
                {sn.title || 'Sub Note'}
              </button>
            ))}
          </nav>
        )}
        <div className="nq-body">
          <RichTextEditor
            key={subId ?? 'main'}
            content={content}
            placeholder="Start writing..."
            onChange={(html) => patchNote(noteId, subId, { content: html })}
          />
        </div>
      </div>
    </div>
  );

  if (asWindow) {
    return <div className={`nq-window${closing ? ' closing' : ''}`}>{card}</div>;
  }

  // On <body>, so no transformed dashboard column can trap the fixed overlay.
  // React still bubbles events from a portal to the widget, so they stop here
  // and cannot start a dashboard drag or toggle the panel.
  return createPortal(
    <div
      className={`nq-overlay${closing ? ' closing' : ''}`}
      onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) close(); }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {card}
    </div>,
    document.body,
  );
}
