import { store, ok, done } from './env.js';
import { mediaDisk } from './media-env.js';
import { supabase } from '../src/supabase';
import { putImage, getImage, putStrokes, getStrokes, clearAllMedia } from '../src/utils/imageStore';
import { syncNoteMedia, getMediaSyncStatus } from '../src/utils/noteMediaSync';
const cloud = globalThis.__cloud;
const image = 'data:image/png;base64,c3ludGhldGlj';
store.notes = JSON.stringify([{ id: 1, content: '<span data-img-id="img_test">Image</span>', canvasImages: [{ imgId: 'img_test' }] }]);
await putImage('img_test', image);
await putStrokes('img_test', [{ x: 0.2, y: 0.4 }]);
ok('image bytes never enter the notes localStorage payload', !store.notes.includes('base64'));
ok('new media is durably queued', getMediaSyncStatus().pending === 2);
ok('the first sync uploads images and annotations', await syncNoteMedia());
ok('cloud rows belong to the current account', cloud.rows.filter(r => r.key.startsWith('__media:')).every(r => r.user_id === 'user-1'));
ok('uploaded images have their own row', cloud.rows.some(r => r.key === '__media:image:img_test' && r.value === image));
ok('the upload queue clears only after success', getMediaSyncStatus().pending === 0);

await clearAllMedia();
delete store.__note_media_seen;
ok('a new device downloads image bytes', await getImage('img_test') === image);
ok('a new device downloads annotations', (await getStrokes('img_test'))[0].x === 0.2);

cloud.failAll = true;
await putStrokes('img_test', []);
ok('offline uploads are reported as failed', await syncNoteMedia() === false);
ok('offline changes retain a durable dirty record', getMediaSyncStatus().pending === 1);
cloud.failAll = false;
ok('reconnecting retries the pending media', await syncNoteMedia());
ok('clearing annotations propagates as an empty array', cloud.rows.find(r => r.key === '__media:strokes:img_test').value.length === 0);

const strokesRow = cloud.rows.find(r => r.key === '__media:strokes:img_test');
strokesRow.value = [{ x: 0.8 }];
strokesRow.updated_at = '2040-01-01T00:00:00Z';
await syncNoteMedia();
ok('a remote annotation update refreshes the local store', (await getStrokes('img_test'))[0].x === 0.8);

// Switching accounts drops the former account's cache and cannot fetch a row
// by id from that account, even if a note on the new account names that id.
await clearAllMedia();
delete store.__note_media_seen;
delete store.__note_media_dirty;
await supabase.auth.setSession({ user: { id: 'user-2' } });
ok('media from another account is inaccessible', await getImage('img_test') === null);
ok('the previous cache was cleared', mediaDisk.size === 0);
ok('no media was uploaded under the second account', !cloud.rows.some(r => r.user_id === 'user-2'));
done();
