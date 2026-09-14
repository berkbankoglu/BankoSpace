import { useEffect, useRef } from 'react';

// One shared timeline rather than a stack per feature: Ctrl+Z should undo the
// last thing you did, whatever part of the app it happened in. Each entry
// remembers which scope changed and both sides of the change, so undo and redo
// are the same operation in opposite directions.
const LIMIT = 30;

const past = [];
const future = [];
const scopes = new Map(); // key -> apply(value)
// The exact value each scope is being set to by an undo/redo. The scope's
// change effect matches against it, so the write the undo causes is never
// recorded as a new step. This replaced a flag cleared on a setTimeout, which
// could expire before React ran the effect — the undo then landed on the
// timeline as a fresh change, forked it, and the next Ctrl+Z re-applied the
// very thing that had just been undone.
const pendingApply = new Map();

export function isApplyingHistory() { return pendingApply.size > 0; }

function apply(key, value) {
  const fn = scopes.get(key);
  if (!fn) return false;
  pendingApply.set(key, value);
  fn(value);
  return true;
}

export function undo() {
  while (past.length) {
    const entry = past.pop();
    if (apply(entry.key, entry.prev)) {
      future.push(entry);
      if (future.length > LIMIT) future.shift();
      return true;
    }
    // Scope is gone (its view unmounted) — drop the entry and keep looking.
  }
  return false;
}

export function redo() {
  while (future.length) {
    const entry = future.pop();
    if (apply(entry.key, entry.next)) {
      past.push(entry);
      if (past.length > LIMIT) past.shift();
      return true;
    }
  }
  return false;
}

export function clearHistory() {
  past.length = 0;
  future.length = 0;
}

// Tracks one piece of state: register how to put a value back, and every later
// change to it becomes an undoable step.
export function useUndoScope(key, value, applyValue) {
  const prevRef = useRef(value);
  const applyRef = useRef(applyValue);
  applyRef.current = applyValue;

  useEffect(() => {
    scopes.set(key, (v) => applyRef.current(v));
    return () => { if (scopes.get(key)) scopes.delete(key); };
  }, [key]);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (pendingApply.has(key) && pendingApply.get(key) === value) {
      pendingApply.delete(key);    // this change IS an undo/redo
      return;
    }
    if (prev === value) return;
    if (JSON.stringify(prev) === JSON.stringify(value)) return;
    pendingApply.delete(key);      // a real change supersedes a stale apply
    past.push({ key, prev, next: value });
    if (past.length > LIMIT) past.shift();
    future.length = 0;             // a fresh change forks the timeline
  }, [key, value]);
}

// Inputs that hold typed text keep the browser's own undo. Checkboxes, radios
// and buttons don't: ticking a task leaves focus on its checkbox, and treating
// that as "typing" is what made Ctrl+Z do nothing right after a completion.
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);
function isTextEntry(el) {
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return !NON_TEXT_INPUTS.has((el.type || 'text').toLowerCase());
}

// Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y), app-wide.
export function useUndoHotkeys() {
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      if (isTextEntry(document.activeElement)) return;
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo(); else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
