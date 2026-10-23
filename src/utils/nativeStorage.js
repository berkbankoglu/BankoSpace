// localStorage's own setItem and removeItem, captured before the sync layer
// wraps them.
//
// The wrapping is done on Storage.prototype, because assigning to the
// localStorage object itself is not portable: in WebKit (the macOS app) and
// Firefox, `localStorage.setItem = fn` is a named-property write — it stores
// an ITEM called "setItem" and leaves the method untouched. Chromium lets the
// assignment replace the method, which is why the old approach worked on
// Windows and silently did nothing on the Mac: not one edit made there was
// ever sent.
//
// Code that must write without being treated as an edit — the pull applying
// what the cloud sent, the sync bookkeeping, emptying the device for an
// account switch — goes through these.
const protoSet = Storage.prototype.setItem;
const protoRemove = Storage.prototype.removeItem;

export const nativeSet = (key, value) => protoSet.call(localStorage, key, value);
export const nativeRemove = (key) => protoRemove.call(localStorage, key);
export const originals = { setItem: protoSet, removeItem: protoRemove };
