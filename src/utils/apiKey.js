import { getCachedUserId } from '../supabase';

// The Anthropic API key belongs to the account that entered it.
//
// It is stored under that account's id, so another account signed in on the
// same device never sees or uses it. It is never synced to the cloud and is
// not part of any export, so it cannot travel to another account either. When
// an account signs out or is removed from this device, its key goes with it.
//
// Every read and write goes through here — nothing should touch the storage
// keys directly, or the per-account guarantee is only as strong as the one
// call site that forgot.
const PREFIX = 'anthropic_api_key:';

// The pre-4.6.3 location: one key shared by every account on the device.
const LEGACY_KEY = 'anthropic_api_key';

function slotFor(userId) {
  return userId ? PREFIX + userId : null;
}

export function getApiKey() {
  const slot = slotFor(getCachedUserId());
  return slot ? (localStorage.getItem(slot) || '') : '';
}

// An empty value removes the key. With no account signed in there is nowhere
// it could belong, so nothing is written.
export function setApiKey(value) {
  const slot = slotFor(getCachedUserId());
  if (!slot) return;
  const v = String(value || '').trim();
  if (v) localStorage.setItem(slot, v);
  else localStorage.removeItem(slot);
}

export function forgetApiKey(userId) {
  const slot = slotFor(userId);
  if (slot) localStorage.removeItem(slot);
}

// One-time hand-over of the old device-wide key to the account signed in when
// this version first runs. It is deleted from the shared slot either way, so
// no other account can pick it up afterwards.
export function claimLegacyApiKey(userId) {
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy === null) return;
  const slot = slotFor(userId);
  if (!slot) return;
  if (!localStorage.getItem(slot) && legacy.trim()) localStorage.setItem(slot, legacy.trim());
  localStorage.removeItem(LEGACY_KEY);
}
