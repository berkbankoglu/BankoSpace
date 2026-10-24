// Asynchronous IndexedDB test double. Uses the same transaction completion and
// request-success boundaries the production store waits for, without a browser.
const disk = new Map();
export const mediaDisk = disk;
const database = {
  objectStoreNames: Object.assign(['note_images'], { contains: name => name === 'note_images' }),
  createObjectStore() {},
  transaction() {
    const tx = { objectStore: () => ({
      put(value, key) {
        setTimeout(() => { disk.set(key, structuredClone(value)); tx.oncomplete?.(); }, 0);
      },
      get(key) {
        const request = {};
        setTimeout(() => { request.result = structuredClone(disk.get(key)); request.onsuccess?.(); }, 0);
        return request;
      },
      clear() { setTimeout(() => { disk.clear(); tx.oncomplete?.(); }, 0); },
    }) };
    return tx;
  },
};
globalThis.indexedDB = {
  open() {
    const request = {};
    setTimeout(() => { request.result = database; request.onsuccess?.(); }, 0);
    return request;
  },
};
globalThis.CustomEvent = class extends Event {
  constructor(name, options = {}) { super(name); this.detail = options.detail; }
};
