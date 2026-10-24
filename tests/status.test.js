import { store, sleep, ok, done } from './env.js';
import React from 'react';
import { renderToString } from 'react-dom/server';
const reset = () => Object.keys(store).forEach(k => delete store[k]);

console.log('\n--- who is asked which sections they will use ---');
const ob = await import('../src/utils/onboarding.js');
reset();
ok('a brand-new user is asked', ob.needsSectionPicker() === true);
ob.finishSectionPicker();
ok('once', ob.needsSectionPicker() === false);
reset(); store.todos = JSON.stringify([{ id: 1 }]);
ok('an existing user is not asked', ob.needsSectionPicker() === false);
ok('and is marked done, keeping every section', store.onboarded_v1 === 'existing');
const { default: SectionPicker } = await import('../src/components/SectionPicker.jsx');
const h = renderToString(React.createElement(SectionPicker, { sections: [{ id: 'notes', label: 'Notes', icon: 'N' }, { id: 'fitness', label: 'Fitness', icon: 'F' }], onDone() {} }));
ok('the picker explains each section and where to change it later', h.includes('Notes with formatting') && h.includes('Settings → Pages') && h.includes('Only the Dashboard for now'));

console.log('\n--- the sync indicator ---');
reset();
const sync = await import('../src/sync.js');
const seen = [];
sync.subscribeSyncStatus(s => seen.push(s));
const cloud = () => globalThis.__cloud;
cloud().rows = [{ user_id: 'user-1', key: 'todos', value: [], updated_at: new Date().toISOString() }];
store.todos = '[]';
ok('before the first pull: connecting', sync.getSyncStatus().kind === 'connecting');
await sync.startupSync();
await sleep(100);
ok('after it: synced', sync.getSyncStatus().kind === 'synced' && !!sync.getSyncStatus().lastOk);
localStorage.setItem('todos', JSON.stringify([{ id: 1, text: 'x' }]));
ok('a write shows as sending at once', sync.getSyncStatus().kind === 'sending');
await sleep(1000);
ok('and as synced once it lands', sync.getSyncStatus().kind === 'synced' && sync.getSyncStatus().unsent === 0);

cloud().failAll = true;
localStorage.setItem('todos', JSON.stringify([{ id: 1, text: 'y' }]));
await sleep(1000);
let s = sync.getSyncStatus();
ok('network gone: offline, with the change counted', s.kind === 'offline' && s.unsent === 1);
cloud().failAll = false;
await sync.syncNow(() => {});
await sleep(800);
s = sync.getSyncStatus();
ok('network back: the waiting change goes and it reads synced', s.kind === 'synced' && s.unsent === 0);

console.log('\n--- another device ---');
// The other machine's clock is an hour behind; its row's own stamp says nothing useful.
const hourAgo = new Date(Date.now() - 3600000).toISOString();
cloud().rows.push({ user_id: 'user-1', key: '__status:mac1', value: { platform: 'mac', app: '4.9.6' }, updated_at: hourAgo });
await sleep(30500);   // the indicator looks every half minute
s = sync.getSyncStatus();
ok('first look, stamp an hour old: not called open yet', s.others.length === 1 && s.others[0].active === false);
cloud().rows.find(r => r.key === '__status:mac1').updated_at = new Date(Date.now() - 3599000).toISOString();
await sleep(30500);
s = sync.getSyncStatus();
ok('its row changed while we watched: open, despite the skewed clock', s.others[0].active === true && s.others[0].platform === 'mac');
ok('carries its version', s.others[0].app === '4.9.6');

const { default: SyncStatus } = await import('../src/components/SyncStatus.jsx');
done();
