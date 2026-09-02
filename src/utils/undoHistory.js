import { useEffect, useRef } from 'react';

// One shared timeline rather than a stack per feature: Ctrl+Z should undo the
// last thing you did, whatever part of the app it happened in. Each entry
// remembers which scope changed and both sides of the change, so undo and redo
// are the same operation in opposite directions.
const LIMIT = 30;

const past = [];
const future = [];
const scopes = new Map(); // key -> apply(value)
let applying = false;

export function isApplyingHistory() { return applying; }

function apply(key, value) {
  const fn = scopes.get(key);
  if (!fn) return false;
  applying = true;
  try { fn(value); } finally {
    // Cleared after the state write has been queued, so the change the apply
    // itself causes isn't recorded as a new step.
    setTimeout(() => { applying = false; }, 0);
  }
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
    if (applying) return;          // this change IS an undo/redo
    if (prev === value) return;
    if (JSON.stringify(prev) === JSON.stringify(value)) return;
    past.push({ key, prev, next: value });
    if (past.length > LIMIT) past.shift();
    future.length = 0;             // a fresh change forks the timeline
  }, [key, value]);
}

// Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y). Left alone while typing so text
// fields keep their own native undo.
export function useUndoHotkeys() {
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo(); else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
