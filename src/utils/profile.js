import { pushKeyToSupabase } from '../supabase';

const STORAGE_KEY = 'profile_v1';
export const PROFILE_EVENT = 'profile-updated';

// The display name and avatar colour, kept apart from the auth record so
// changing either is instant and offline — the account's own email stays the
// identity.

// Ten grounds for the initials, dark enough that white letters stay legible on
// every one of them.
export const AVATAR_COLORS = [
  '#4f46e5', '#7c3aed', '#be185d', '#b91c1c', '#c2410c',
  '#a16207', '#15803d', '#0f766e', '#0369a1', '#4b5563',
];

export function getProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) || {};
      return { username: p.username || '', color: p.color || '' };
    }
  } catch { /* fall through */ }
  return { username: '', color: '' };
}

// Nobody should have to pick before their avatar looks deliberate, so an
// unchosen colour is derived from the name rather than left blank.
export function avatarColor(profile, name) {
  if (profile?.color) return profile.color;
  const key = String(name || '');
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function setProfile(patch) {
  const next = { ...getProfile(), ...patch };
  const val = JSON.stringify(next);
  localStorage.setItem(STORAGE_KEY, val);
  pushKeyToSupabase(STORAGE_KEY, val);
  window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: next }));
  return next;
}

// What to actually show. Accounts created before usernames existed fall back to
// the part of the email before the @, which is what was shown all along.
export function displayName(session) {
  const p = getProfile();
  if (p.username) return p.username;
  const fromSignup = session?.user?.user_metadata?.username;
  if (fromSignup) return fromSignup;
  const email = session?.user?.email;
  return email ? email.split('@')[0] : 'BankoSpace';
}

export function initials(name) {
  const parts = String(name || '').trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return 'B';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Usernames are what other people would see, so keep them to something that
// reads as a name rather than a free-text field.
export function validateUsername(value) {
  const v = String(value || '').trim();
  if (v.length < 2) return 'Pick something at least 2 characters long.';
  if (v.length > 24) return 'Keep it to 24 characters or fewer.';
  if (!/^[\p{L}\p{N} ._-]+$/u.test(v)) return 'Letters, numbers, spaces, dots, dashes and underscores only.';
  return null;
}

// Quick accounts (supabase/functions/quick-signup) sign in with a username,
// which maps to a placeholder address on a reserved domain that can never
// receive mail — so nothing is ever sent to them.
export const QUICK_DOMAIN = 'quick.bankospace.invalid';

export function isQuickEmail(email) {
  return String(email || '').toLowerCase().endsWith(`@${QUICK_DOMAIN}`);
}

// What the sign-in box turns into an address: an email stays as typed, a bare
// username becomes that account's placeholder address.
export function loginEmailFor(identifier) {
  const v = String(identifier || '').trim();
  return v.includes('@') ? v : `${v.toLowerCase()}@${QUICK_DOMAIN}`;
}

// The line under a name. A placeholder address means nothing to a person, so a
// quick account shows as @handle, with its contact email when there is one.
export function accountSubtitle(email, contactEmail) {
  if (isQuickEmail(email)) {
    const handle = String(email).split('@')[0];
    return contactEmail ? `@${handle} · ${contactEmail}` : `@${handle}`;
  }
  return email || '';
}

// Login handles are stricter than display names: they become part of an
// address, so no spaces or accents.
export function validateHandle(value) {
  const v = String(value || '').trim();
  if (!/^[A-Za-z0-9._-]{3,24}$/.test(v)) {
    return 'Usernames are 3–24 characters: letters, numbers, dots, dashes and underscores.';
  }
  return null;
}
