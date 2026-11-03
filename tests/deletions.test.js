import { store, sleep, ok, done } from './env.js';
const sync = await import('../src/sync.js');
const sb = await import('../src/supabase.js');
const cloud = globalThis.__cloud;
const row = key => cloud.rows.find(r => r.key === key);
cloud.rows = ['todos', 'goals'].map(key => ({ user_id: 'user-1', key, value: [{ id: 1 }], updated_at: new Date().toISOString() }));
await sync.startupSync();

row('todos').value = [];
await sb.pullFromSupabase();
await sb.pushDirtyToSupabase();
ok('another device clearing its last item stays empty', row('todos').value.length === 0 && store.todos === '[]');

cloud.rows = cloud.rows.filter(r => r.key !== 'goals');
await sb.pullFromSupabase();
await sb.pushDirtyToSupabase();
ok('a previously synced key removed elsewhere is not uploaded again', !row('goals') && localStorage.getItem('goals') === null);

localStorage.setItem('reviews_v1', '[{"id":2}]');
localStorage.removeItem('reviews_v1');
await sleep(1000);
ok('a removal cancels the previous debounced write', row('reviews_v1')?.value === 'null' && localStorage.getItem('reviews_v1') === null);
ok('a deletion remains represented in the cloud', !!row('reviews_v1') && row('reviews_v1').value === 'null');
store.reviews_v1 = '[{"id":2}]'; // an old copy on a second device
await sb.pullFromSupabase();
ok('a deletion tombstone clears an old local copy', localStorage.getItem('reviews_v1') === null);

// A slow old write must finish before a newer deletion, even for callers
// that bypass the debounce layer and call pushKeyToSupabase directly.
cloud.delayNextUpsert = 120;
await Promise.all([
  sb.pushKeyToSupabase('quickNotes', '["old"]'),
  sb.pushKeyToSupabase('quickNotes', null),
]);
ok('the latest operation wins for concurrent writes to the same key', row('quickNotes')?.value === 'null');
done();
