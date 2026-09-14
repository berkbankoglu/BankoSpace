import { pushKeyToSupabase } from '../supabase';

const STORAGE_KEY = 'betaFeatures_v1';
export const BETA_EVENT = 'beta-features-changed';

// The release that introduced opt-in features. An install last opened on an
// older version was already using all of these, so it keeps them.
const LABS_VERSION = [4, 6, 0];

// Sections kept out of the default experience: each is genuinely useful but
// specific enough to one person's routine that having it on for everyone
// makes the app read as something other than what it is.
export const BETA_FEATURES = [
  {
    id: 'japanesekana',
    label: 'Language Learn',
    sidebarId: 'japanesekana',
    description: 'Japanese kana guide, practice drills, a vocabulary list and flash cards.',
  },
  {
    id: 'review',
    label: 'Review',
    sidebarId: 'review',
    description: 'A rated library of the films, series, books and videos you have finished.',
  },
  {
    id: 'activity',
    label: 'Activity graphs',
    sidebarId: null,
    description: 'The GitHub and BankoSpace contribution heatmaps on the dashboard.',
  },
];

const ALL_OFF = Object.fromEntries(BETA_FEATURES.map(f => [f.id, false]));
const ALL_ON = Object.fromEntries(BETA_FEATURES.map(f => [f.id, true]));

function isOlderThanLabs(version) {
  if (!version) return false;
  const parts = String(version).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < LABS_VERSION.length; i++) {
    const a = parts[i] ?? 0;
    if (a !== LABS_VERSION[i]) return a < LABS_VERSION[i];
  }
  return false;
}

// Runs once at module load — before anything renders, and crucially before
// App's version-check effect overwrites `appVersion` with the current one.
//
// The version is what decides, not whether there is data: an install that
// predates Labs turns everything on and keeps the user's setup exactly as it
// was, while a fresh install starts lean and cannot later flip itself on just
// because it has accumulated todos. A brand-new device on an existing account
// writes nothing here, so the value the cloud sync pulls down wins.
function migrate() {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;
    if (isOlderThanLabs(localStorage.getItem('appVersion'))) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ALL_ON));
    }
  } catch { /* private mode / storage disabled — fall back to the defaults */ }
}
migrate();

export function getBetaFlags() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Spread over ALL_OFF so a feature added after this install was set up
    // arrives switched off rather than undefined.
    if (raw) return { ...ALL_OFF, ...(JSON.parse(raw) || {}) };
  } catch { /* fall through */ }
  return { ...ALL_OFF };
}

export function isBetaEnabled(id) {
  return !!getBetaFlags()[id];
}

export function setBetaFlag(id, on) {
  const next = { ...getBetaFlags(), [id]: !!on };
  const val = JSON.stringify(next);
  localStorage.setItem(STORAGE_KEY, val);
  pushKeyToSupabase(STORAGE_KEY, val);
  window.dispatchEvent(new CustomEvent(BETA_EVENT, { detail: next }));
  return next;
}
