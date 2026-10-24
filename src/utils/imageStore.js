// Images and annotation strokes stay out of the hot localStorage notes payload.
import { getUserId, getCachedUserId } from '../supabase';
import { markMediaDirty, loadMediaFromCloud, cancelMediaSync } from './noteMediaSync';

const STORE = 'note_images';
let dbPromise = null;
let epoch = 0;
const memCache = new Map();
export const MEDIA_EVENT = 'note-media-updated';
export const mediaEpoch = () => epoch;

function cacheSet(id, value) {
  memCache.delete(id);
  memCache.set(id, value);
  while (memCache.size > 40) memCache.delete(memCache.keys().next().value);
}

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('bankospace', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(error => { dbPromise = null; throw error; });
  }
  return dbPromise;
}

export function newImageId() {
  return 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export async function readMediaLocal(kind, id) {
  if (!id) return null;
  if (kind === 'image' && memCache.has(id)) return memCache.get(id);
  const generation = epoch;
  const db = await openDB();
  if (generation !== epoch) return null;
  const value = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(kind === 'image' ? id : 'strokes_' + id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  if (generation !== epoch) return null;
  if (kind === 'image' && value) cacheSet(id, value);
  return value;
}

// Cloud hydration bypasses dirty tracking, just like nativeStorage on a pull.
export async function writeMediaLocal(kind, id, value, generation = epoch) {
  const db = await openDB();
  if (generation !== epoch) return false;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, kind === 'image' ? id : 'strokes_' + id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  if (generation !== epoch) return false;
  if (kind === 'image') cacheSet(id, value);
  return true;
}

async function putMedia(kind, id, value) {
  const generation = epoch;
  const owner = await getUserId();
  if (generation !== epoch) return;
  if (await writeMediaLocal(kind, id, value, generation)) {
    if (owner && owner === getCachedUserId()) markMediaDirty(kind, id, owner);
  }
}

export async function putImage(id, dataUrl) {
  if (id && dataUrl) await putMedia('image', id, dataUrl);
}
export async function putStrokes(id, strokes) {
  if (id) await putMedia('strokes', id, strokes);
}

async function getMedia(kind, id) {
  if (!id) return null;
  try {
    return await readMediaLocal(kind, id) ?? await loadMediaFromCloud(kind, id);
  } catch (error) {
    console.error('Could not read note media:', error);
    return null;
  }
}
export const getImage = id => getMedia('image', id);
export const getStrokes = id => getMedia('strokes', id);

export async function resolveEmbed(el) {
  if (!el) return null;
  const legacy = el.getAttribute('data-img');
  return legacy?.startsWith('data:') ? legacy : getImage(el.getAttribute('data-img-id'));
}

export async function clearAllMedia() {
  epoch++;
  cancelMediaSync();
  memCache.clear();
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const names = Array.from(db.objectStoreNames);
      if (!names.length) { resolve(); return; }
      const tx = db.transaction(names, 'readwrite');
      names.forEach(name => tx.objectStore(name).clear());
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (error) {
    // No database is normal on a device that never stored media.
    if (typeof indexedDB !== 'undefined') throw error;
  }
}
