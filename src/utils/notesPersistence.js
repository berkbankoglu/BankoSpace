// An intentionally empty list is valid data, not a reason to resurrect a backup.
export function readSavedNotes() {
  for (const key of ['notes', 'notes_local_backup']) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try { const value = JSON.parse(raw); if (Array.isArray(value)) return value; } catch { /* try backup */ }
  }
  return [];
}

export function persistNotes(notes) {
  const serialized = JSON.stringify(notes);
  localStorage.setItem('notes', serialized);
  localStorage.setItem('notes_local_backup', serialized);
}
