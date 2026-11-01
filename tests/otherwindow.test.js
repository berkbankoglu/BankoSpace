// A note written in its own window: that window has no sync layer and only
// changes the shared storage. The main window hears it as a storage event and
// must send it up like its own edit, and refresh Notes.
import { store, sleep, ok, done } from './env.js';
const fired = [];
globalThis.dispatchEvent = (e) => { fired.push(e.type); return true; };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
globalThis.StorageEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };
const listeners = {};
globalThis.addEventListener = (t, f) => { (listeners[t] ||= []).push(f); };
const sync = await import('../src/sync.js');
const { nativeSet } = await import('../src/utils/nativeStorage.js');
const cloud = () => globalThis.__cloud;

cloud().rows = [{ user_id: 'user-1', key: 'notes', value: [{ id: 1, content: '' }], updated_at: new Date(Date.now() - 50000).toISOString() }];
store.notes = JSON.stringify([{ id: 1, content: '' }]);
await sync.startupSync();
const stop = sync.startPolling(() => {}, 150);
await sleep(300);

const fromOther = (key, value) => {
  nativeSet(key, value); // the other window's write: storage changes, no wrapper here
  (listeners.storage || []).forEach(f => f({ type: 'storage', storageArea: localStorage, key, newValue: value }));
};
const upserts = (key) => cloud().calls.filter(c => c[0] === 'upsert' && c[1].key === key);

const typed = JSON.stringify([{ id: 1, content: '<div>written in the note window</div>' }]);
const before = upserts('notes').length;
fromOther('notes', typed);
ok('Notes here is told to re-read', fired.includes('notes-updated'));
await sleep(1200);
const sent = upserts('notes');
ok('the edit is sent to the cloud', sent.length === before + 1);
ok('with what was typed', JSON.stringify(sent[sent.length - 1]?.[1].value).includes('written in the note window'));

const n = upserts('notes').length;
(listeners.storage || []).forEach(f => f({ type: 'storage', key: 'notes' })); // this window's own synthetic event
fromOther('__sync_dirty', '[]');                                             // bookkeeping, not data
await sleep(1000);
ok('synthetic events and unsynced keys send nothing', upserts('notes').length === n && upserts('__sync_dirty').length === 0);

fromOther('notes', typed);
await sleep(1000);
ok('the same value again is not an edit', upserts('notes').length === n);
stop();
done();
