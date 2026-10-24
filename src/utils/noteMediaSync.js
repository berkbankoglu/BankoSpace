import { supabase, getUserId, getCachedUserId } from '../supabase';
import { nativeSet } from './nativeStorage';
import { readMediaLocal, writeMediaLocal, mediaEpoch, MEDIA_EVENT } from './imageStore';

// Separate rows use the same per-user RLS as notes. No public bucket or new
// server credentials are needed, and image bytes never enter localStorage.
export const MEDIA_PREFIX = '__media:';
const DIRTY = '__note_media_dirty';
const SEEN = '__note_media_seen';
let timer;
let running = null;
let uploading = 0;
let failed = false;
const transfers = new Map();
const read = key => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
const keyFor = (kind, id) => `${MEDIA_PREFIX}${kind}:${id}`;
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,150}$/.test(id);
const notify = () => window.dispatchEvent(new Event('note-media-sync-status'));

export function collectNoteMediaIds(notes) {
  const ids = new Set();
  const visit = note => {
    if (!note || typeof note !== 'object') return;
    for (const match of String(note.content || '').matchAll(/\bdata-img-id\s*=\s*(["'])(.*?)\1/g)) {
      if (validId(match[2])) ids.add(match[2]);
    }
    for (const image of note.canvasImages || []) if (validId(image?.imgId)) ids.add(image.imgId);
    for (const sub of note.subNotes || []) visit(sub);
  };
  if (Array.isArray(notes)) notes.forEach(visit);
  return [...ids];
}

export function getMediaSyncStatus() {
  const owner = getCachedUserId();
  return { pending: Object.values(read(DIRTY)).filter(v => v.owner === owner).length, uploading, failed };
}

export function markMediaDirty(kind, id, owner) {
  if (!validId(id) || !owner || owner !== getCachedUserId()) return;
  const dirty = read(DIRTY);
  dirty[keyFor(kind, id)] = { kind, id, owner, revision: `${Date.now()}:${Math.random()}` };
  nativeSet(DIRTY, JSON.stringify(dirty));
  notify();
  clearTimeout(timer);
  timer = setTimeout(() => { syncNoteMedia(); }, 700);
}

export function cancelMediaSync() {
  clearTimeout(timer);
  running = null;
  failed = false;
}

function stillOwns(owner, generation) {
  return generation === mediaEpoch() && owner === getCachedUserId();
}

export async function loadMediaFromCloud(kind, id, expectedOwner, expectedEpoch) {
  if (!validId(id)) return null;
  const generation = expectedEpoch ?? mediaEpoch();
  const owner = expectedOwner || await getUserId();
  if (!owner || !stillOwns(owner, generation)) return null;
  const key = keyFor(kind, id);
  const transferKey = `${owner}:${generation}:${key}`;
  if (transfers.has(transferKey)) return transfers.get(transferKey);
  const work = (async () => {
    const { data, error } = await supabase.from('user_data')
      .select('key, value, updated_at').eq('user_id', owner).eq('key', key);
    if (error) throw error;
    if (!stillOwns(owner, generation)) return null;
    const row = data?.[0];
    if (!row || row.value == null) return null;
    if (read(DIRTY)[key]) return readMediaLocal(kind, id);
    if ((kind === 'image' && (typeof row.value !== 'string' || !row.value.startsWith('data:image/'))) ||
        (kind === 'strokes' && !Array.isArray(row.value))) throw new Error('Invalid note media in the cloud.');
    if (!await writeMediaLocal(kind, id, row.value, generation)) return null;
    if (!stillOwns(owner, generation)) return null;
    nativeSet(SEEN, JSON.stringify({ ...read(SEEN), [key]: row.updated_at }));
    window.dispatchEvent(new CustomEvent(MEDIA_EVENT, { detail: { id, kind } }));
    return row.value;
  })();
  transfers.set(transferKey, work);
  try { return await work; } finally { transfers.delete(transferKey); }
}

async function uploadPending(owner, generation) {
  for (const [key, item] of Object.entries(read(DIRTY))) {
    if (item.owner !== owner || !stillOwns(owner, generation)) continue;
    const value = await readMediaLocal(item.kind, item.id);
    if (value === null) throw new Error('A note image is waiting to upload but is missing locally.');
    if (!stillOwns(owner, generation)) return;
    const updated_at = new Date().toISOString();
    const { error } = await supabase.from('user_data').upsert({ user_id: owner, key, value, updated_at });
    if (error) throw error;
    if (!stillOwns(owner, generation)) return;
    const dirty = read(DIRTY);
    if (dirty[key]?.revision === item.revision) delete dirty[key];
    nativeSet(DIRTY, JSON.stringify(dirty));
    nativeSet(SEEN, JSON.stringify({ ...read(SEEN), [key]: updated_at }));
    notify();
  }
}

// Called at startup, on manual sync, and by the poller. A persistent dirty
// manifest makes offline uploads survive a quit; immutable image ids allow
// old local media to be migrated without rewriting the notes themselves.
export async function syncNoteMedia() {
  const generation = mediaEpoch();
  const owner = await getUserId();
  if (!owner || !stillOwns(owner, generation)) return false;
  let notes;
  try { notes = JSON.parse(localStorage.getItem('notes') || '[]'); } catch { return false; }
  const ids = collectNoteMediaIds(notes);
  if (!ids.length && !getMediaSyncStatus().pending) {
    if (failed) { failed = false; notify(); }
    return true;
  }
  if (running?.owner === owner && running.generation === generation) return running.promise;
  const run = { owner, generation };
  running = run;
  run.promise = (async () => {
    uploading++;
    notify();
    try {
      failed = false;
      await uploadPending(owner, generation);
      if (!ids.length || !stillOwns(owner, generation)) return true;
      const remote = new Map();
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from('user_data').select('key, updated_at')
          .eq('user_id', owner).like('key', MEDIA_PREFIX + '%').order('key').range(offset, offset + 499);
        if (error) throw error;
        for (const row of data || []) remote.set(row.key, row.updated_at);
        if (!data || data.length < 500) break;
        if (!stillOwns(owner, generation)) return false;
      }
      if (!stillOwns(owner, generation)) return false;
      for (const id of ids) {
        for (const kind of ['image', 'strokes']) {
          if (!stillOwns(owner, generation)) return false;
          const key = keyFor(kind, id);
          if (remote.has(key) && read(SEEN)[key] === remote.get(key) && !read(DIRTY)[key]) continue;
          const local = await readMediaLocal(kind, id);
          if (!remote.has(key)) {
            if (kind === 'image' && local === null) throw new Error('A referenced note image is unavailable on this device and in the cloud.');
            if (local !== null && !read(DIRTY)[key]) markMediaDirty(kind, id, owner);
          } else if (!read(DIRTY)[key] && (local === null || (kind === 'strokes' && read(SEEN)[key] !== remote.get(key)))) {
            await loadMediaFromCloud(kind, id, owner, generation);
          }
        }
      }
      await uploadPending(owner, generation);
      return stillOwns(owner, generation);
    } catch (error) {
      if (stillOwns(owner, generation)) failed = true;
      console.warn('Note media sync will retry:', error?.message || error);
      return false;
    } finally {
      uploading--;
      if (running === run) running = null;
      notify();
    }
  })();
  return run.promise;
}
