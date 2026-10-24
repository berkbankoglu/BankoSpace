import { store, ok, done } from './env.js';
import './media-env.js';
import { SYNC_KEYS } from '../src/supabase';
import { createBackup, restoreBackup, BACKUP_KEYS } from '../src/utils/backup';
import { putImage, putStrokes, getImage, getStrokes, clearAllMedia } from '../src/utils/imageStore';
ok('every synced field is part of the backup schema', SYNC_KEYS.every(k => BACKUP_KEYS.includes(k)));
store.planner_blocks = '[{"id":1}]';
store.meds_v1 = '[{"id":2}]';
store.reviews_v1 = '[{"id":3}]';
store.anthropic_api_key = 'never-export';
store['anthropic_api_key:user-1'] = 'never-export';
store.accounts_v1 = '[{"refreshToken":"never-export"}]';
const image = 'data:image/png;base64,c3ludGhldGlj';
store.notes = JSON.stringify([{ id: 4, content: '<span data-img-id="img_backup">Screenshot</span>', canvasImages: [{ imgId: 'img_backup' }], subNotes: [] }]);
await putImage('img_backup', image);
await putStrokes('img_backup', [{ x: 0.1 }]);
const backup = await createBackup('all');
ok('export all includes calendar, medications and reviews', backup.planner_blocks[0].id === 1 && backup.meds_v1[0].id === 2 && backup.reviews_v1[0].id === 3);
ok('export all includes image bytes and annotations', backup._media.img_backup.dataUrl === image && backup._media.img_backup.strokes[0].x === 0.1);
ok('no authentication or API secrets are exported', !JSON.stringify(backup).includes('never-export'));
await clearAllMedia();
for (const key of Object.keys(store)) delete store[key];
await restoreBackup(backup);
ok('a backup alone restores notes and images on a clean device', JSON.parse(store.notes)[0].id === 4 && await getImage('img_backup') === image);
ok('annotations survive a backup round trip', (await getStrokes('img_backup'))[0].x === 0.1);
ok('calendar data survives a backup round trip', JSON.parse(store.planner_blocks)[0].id === 1);
ok('section-specific exports omit other data', !Object.hasOwn(await createBackup('calendar'), 'notes'));

await restoreBackup({ _bankospace: true, _section: 'todos', todos: [{ id: 8 }] });
ok('legacy backups remain importable', JSON.parse(store.todos)[0].id === 8);
let rejected = false;
try { await restoreBackup({ ...backup, _media: {} }); } catch { rejected = true; }
ok('missing image bytes are rejected before overwriting notes', rejected && JSON.parse(store.notes)[0].id === 4);
rejected = false;
try { await restoreBackup({ _bankospace: true, _section: 'all', notes: {} }); } catch { rejected = true; }
ok('invalid note data is rejected before restoring', rejected);

await restoreBackup({ _bankospace: true, _version: 2, _section: 'notes', notes: [], _media: {}, _missing: [] });
ok('an empty notes backup also clears the local backup', store.notes === '[]' && store.notes_local_backup === '[]');
await restoreBackup({ _bankospace: true, _version: 2, _section: 'notes', _media: {}, _missing: ['notes'] });
ok('restoring intentionally absent notes removes their stale backup', localStorage.getItem('notes') === null && localStorage.getItem('notes_local_backup') === null);
done();
