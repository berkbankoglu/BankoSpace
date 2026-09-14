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

// Every key the app keeps per account. Cleared on a switch so the incoming
// account's data is pulled fresh from the cloud rather than merged into
// whatever the previous one left behind.
export function clearAccountData(syncKeys) {
  syncKeys.forEach(key => localStorage.removeItem(key));
  // Makes the next load run its initial pull instead of assuming this tab is
  // already in sync.
  try { sessionStorage.removeItem('supabase_synced'); } catch { /* ignore */ }
}
