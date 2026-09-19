// The accounts signed in on this machine, so switching between them doesn't
// mean typing a password every time.
//
// Deliberately NOT in SYNC_KEYS: it holds the refresh token for each account,
// and uploading one account's token to another account's cloud row would hand
// every device on either account the keys to both. It stays on this machine —
// the same place the Supabase client already keeps the live session.
const KEY = 'accounts_v1';

export const ACCOUNTS_EVENT = 'accounts-updated';

// How many accounts one device keeps signed in for switching.
export const MAX_ACCOUNTS = 3;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(a => a && a.id) : [];
  } catch { return []; }
}

function write(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(ACCOUNTS_EVENT, { detail: list }));
  return list;
}

export function listAccounts() {
  return read();
}

// Called whenever we hold a live session, because Supabase rotates the refresh
// token as it goes — a copy taken once at sign-in would stop working.
export function rememberAccount(session, profile) {
  const user = session?.user;
  if (!user?.id || !session.refresh_token) return read();
  const entry = {
    id: user.id,
    email: user.email || '',
    contactEmail: user.user_metadata?.contact_email || '',
    username: profile?.username || user.user_metadata?.username || '',
    color: profile?.color || '',
    accessToken: session.access_token || '',
    refreshToken: session.refresh_token,
    savedAt: Date.now(),
  };
  let list = read();
  const i = list.findIndex(a => a.id === entry.id);
  if (i === -1) list.push(entry);
  else list[i] = { ...list[i], ...entry };
  // Add account is disabled at the limit, but signing in from the login screen
  // can still bring a fourth. Keep the most recently used ones — savedAt is
  // refreshed on every use — and never drop the account that just signed in.
  if (list.length > MAX_ACCOUNTS) {
    const others = list.filter(a => a.id !== entry.id).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    const keep = new Set([entry.id, ...others.slice(0, MAX_ACCOUNTS - 1).map(a => a.id)]);
    list = list.filter(a => keep.has(a.id));
  }
  return write(list);
}

export function forgetAccount(id) {
  return write(read().filter(a => a.id !== id));
}

// Everything on this device belongs to the account that is signed in, so a
// switch clears all of it and lets the incoming account's data come down from
// the cloud. Written as "keep these, drop the rest" on purpose: the previous
// version cleared a list of known keys, and anything missing from that list
// survived the switch. That is how one account's notes turned up in the next
// one — Notes keeps an unsynced `notes_local_backup` and restores from it when
// it holds more than the live copy, so the cleared notes came straight back.
const KEEP_EXACT = new Set([
  'accounts_v1',                 // the switcher itself
  'appVersion',                  // which release this install last ran
  'apiKeyPurgedFromCloud',
  'supabase_sync_enabled',
  'updateSkippedVersion',
  'updateButtonHiddenVersion',
]);

// Kept across a switch:
// - the live Supabase session (cleared here, it would sign out the account
//   that was just switched to);
// - each account's own API key, stored under its account id. Only the signed-in
//   account's is ever read (src/utils/apiKey.js), so keeping them means switching
//   back doesn't ask for the key again, without any account seeing another's.
const KEEP_PREFIXES = ['sb-', 'supabase.auth', 'anthropic_api_key:'];

export async function clearAccountData() {
  const doomed = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (KEEP_EXACT.has(key)) continue;
    if (KEEP_PREFIXES.some(p => key.startsWith(p))) continue;
    doomed.push(key);
  }
  // Logged because a leak between accounts is invisible after the fact: this
  // says exactly what was on the device at the moment it was handed over.
  const sizeOf = (k) => (localStorage.getItem(k) || '').length;
  const before = `notes=${sizeOf('notes')} notes_local_backup=${sizeOf('notes_local_backup')} todos=${sizeOf('todos')}`;
  doomed.forEach(key => localStorage.removeItem(key));
  const after = `notes=${sizeOf('notes')} notes_local_backup=${sizeOf('notes_local_backup')} todos=${sizeOf('todos')}`;
  if (window.__diag) window.__diag(`ACCOUNT: wiped ${doomed.length} keys | before ${before} | after ${after}`);

  // Note images and drawings live in IndexedDB, keyed from inside the notes.
  const { clearAllMedia } = await import('./imageStore');
  await clearAllMedia();

  // The undo timeline holds earlier copies of todos and planner blocks, which
  // is content. Every switch reloads the page, so this is belt and braces.
  const { clearHistory } = await import('./undoHistory');
  clearHistory();

  // Makes the next load run its initial pull instead of assuming this tab is
  // already in sync.
  try { sessionStorage.removeItem('supabase_synced'); } catch { /* ignore */ }
}
