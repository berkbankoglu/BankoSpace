// Writing in a note opened from the dashboard saves into the saved notes —
// the note's own page or one of its sub-notes — and tells Notes about it.
import { store, ok, done } from './env.js';

const events = [];
globalThis.window = globalThis.window || {};
globalThis.window.dispatchEvent = (e) => events.push(e.type);
globalThis.Event = globalThis.Event || class { constructor(t) { this.type = t; } };

const { patchNote } = await import('../src/components/widgets/NoteQuickEdit.jsx');

store.notes = JSON.stringify([
  { id: 1, title: 'Japonya', content: '', updatedAt: '2026-01-01T00:00:00.000Z',
    subNotes: [{ id: 11, title: 'Plan', content: 'old' }] },
  { id: 2, title: 'Other', content: 'keep', updatedAt: '2026-01-01T00:00:00.000Z' },
]);

patchNote(1, null, { content: '<div>hello</div>' });
let notes = JSON.parse(store.notes);
ok('the note\'s own page gets the text', notes[0].content === '<div>hello</div>');
ok('it is marked as just changed', notes[0].updatedAt > '2026-01-01');
ok('other notes are untouched', notes[1].content === 'keep' && notes[1].updatedAt === '2026-01-01T00:00:00.000Z');
ok('the backup copy follows', store.notes_local_backup === store.notes);
ok('Notes and the widget are told', events.includes('notes-updated'));

patchNote(1, 11, { content: 'new' });
notes = JSON.parse(store.notes);
ok('a sub-note gets its own text', notes[0].subNotes[0].content === 'new');
ok('without touching the main page', notes[0].content === '<div>hello</div>');

patchNote(1, null, { title: 'Japan' });
ok('the title can be renamed', JSON.parse(store.notes)[0].title === 'Japan');

const same = store.notes;
patchNote(1, null, { content: '<div>hello</div>' });
patchNote(1, 11, { content: 'new' });
ok('saving an unchanged page writes nothing (opening a note does not reorder the list)', store.notes === same);

const before = store.notes;
patchNote(99, null, { content: 'x' });
ok('a note deleted meanwhile is not recreated', store.notes === before);
done();
