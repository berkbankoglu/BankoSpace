// IndexedDB-backed store for note images.
//
// Why this exists: note images used to be embedded as base64 directly inside
// the note HTML. That HTML is serialized to localStorage and synced to Supabase
// on every change, so a few screenshots ballooned the payload to several MB and
// made JSON.stringify / setItem / network sync block the main thread — the app
// "froze out of nowhere". Keeping the heavy base64 out of the notes JSON (only a
// short id reference stays in the HTML) keeps every hot path tiny and fast.

const DB_NAME = 'bankospace';
const STORE = 'note_images';
const DB_VERSION = 1;

let dbPromise = null;
const memCache = new Map(); // id -> dataUrl, avoids repeat IDB reads on hover

// LRU cap: dataUrl'ler megabaytlarca olabiliyor; sınırsız cache uzun oturumlarda
// renderer'ı OOM'a sürükleyip beyaz ekran/çökmeye neden oluyordu. En eski girdiler
// atılır — görsel zaten IndexedDB'de, tekrar okunur.
const MEM_CACHE_MAX = 40;
function cacheSet(id, dataUrl) {
  if (memCache.has(id)) memCache.delete(id); // yeniden ekleyerek en sona taşı (LRU)
  memCache.set(id, dataUrl);
  while (memCache.size > MEM_CACHE_MAX) {
    memCache.delete(memCache.keys().next().value);
  }
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export function newImageId() {
  return 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Store a data URL under an id. Resolves once written (memcache is updated
// synchronously so reads right after a paste are instant).
export async function putImage(id, dataUrl) {
  if (!id || !dataUrl) return;
  cacheSet(id, dataUrl);
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(dataUrl, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('imageStore.putImage failed', e);
  }
}

// Resolve a data URL by id (null if missing). Uses the in-memory cache first.
export async function getImage(id) {
  if (!id) return null;
  if (memCache.has(id)) {
    const val = memCache.get(id);
    cacheSet(id, val); // LRU: erişileni en sona taşı
    return val;
  }
  try {
    const db = await openDB();
    const val = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
    if (val) cacheSet(id, val);
    return val;
  } catch (e) {
    console.error('imageStore.getImage failed', e);
    return null;
  }
}

// Returns the resolved data URL for an embed span, supporting both the new
// id-based references and the legacy inline base64 (data-img="data:...").
export async function resolveEmbed(el) {
  if (!el) return null;
  const legacy = el.getAttribute('data-img');
  if (legacy && legacy.startsWith('data:')) return legacy;
  return getImage(el.getAttribute('data-img-id'));
}

// ── Annotation strokes ──────────────────────────────────────────────────
// Freehand drawings made over a canvas image, stored next to the image bytes
// under 'strokes_<imgId>'. Vector data (normalized 0..1 coords) so it scales
// to any display size; tiny compared to the image itself. Not memcached —
// the LRU cache assumes dataUrl strings.

export async function putStrokes(id, strokes) {
  if (!id) return;
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(strokes, 'strokes_' + id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('imageStore.putStrokes failed', e);
  }
}

export async function getStrokes(id) {
  if (!id) return null;
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get('strokes_' + id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  } catch (e) {
    console.error('imageStore.getStrokes failed', e);
    return null;
  }
}
