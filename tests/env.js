// A browser-ish world for one "launch" of the app. Storage works the way it
// does in a browser: methods live on Storage.prototype. With WEBKIT=1 the
// object behaves as WebKit and Firefox do — assigning a property on it stores
// an ITEM of that name (the spec's named-property setter) instead of
// replacing anything. Chromium lets the assignment through; that difference
// is the bug being tested.
const makeStorage = () => {
  const data = {};
  return { data };
};
class Storage {
  constructor(data) { Object.defineProperty(this, '__d', { value: data }); }
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.__d, k) ? this.__d[k] : null; }
  setItem(k, v) { this.__d[k] = String(v); }
  removeItem(k) { delete this.__d[k]; }
  key(i) { return Object.keys(this.__d)[i] ?? null; }
  get length() { return Object.keys(this.__d).length; }
}
globalThis.Storage = Storage;
export const store = {};
const local = new Storage(store);
const webkit = process.env.WEBKIT === '1';
globalThis.localStorage = webkit
  ? new Proxy(local, {
      set(t, p, v) { if (typeof p === 'string') { Storage.prototype.setItem.call(globalThis.localStorage, p, v); return true; } return Reflect.set(t, p, v); },
    })
  : local;
export const sessionData = {};
globalThis.sessionStorage = new Storage(sessionData);
globalThis.window = globalThis;
export const events = [];
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = (e) => { events.push(e.key); return true; };
globalThis.StorageEvent = class { constructor(t, o) { Object.assign(this, o, { type: t }); } };
globalThis.document = { activeElement: null, hasFocus: () => true };
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: webkit ? 'Macintosh AppleWebKit' : 'Windows Chrome' }, configurable: true });
globalThis.__session = { user: { id: 'user-1' } };
export const reloads = { n: 0 };
globalThis.location = { reload() { reloads.n++; } };
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
export const ok = (n, c) => { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };
export const done = () => { console.log(`\n${pass} passed, ${fail} failed\n`); process.exit(fail ? 1 : 0); };
