// Runs every *.test.js in this folder: bundles each with esbuild (so the app's
// own source, JSX included, runs under Node), then executes it.
//
//   npm test                 all suites
//   npm test -- layer dash   only the ones named
//
// Storage-touching suites run twice: once with Chromium's localStorage rules
// and once with WebKit's (WEBKIT=1), where assigning a property on the storage
// object stores an item instead of replacing a method. That difference is what
// silently stopped the Mac from sending anything in 4.9.3; both must pass.
//
// The Supabase client is replaced by tests/stub/supabase-js.js, an in-memory
// table (or a shared file, CLOUD_FILE, for multi-process runs) that stores the
// timestamps clients send, the way the real table does.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, '.build');
mkdirSync(out, { recursive: true });

// Suites that exercise localStorage run under both engines' rules.
const BOTH_ENGINES = new Set(['layer', 'offline', 'skew', 'live_keys', 'deletions', 'backup', 'media', 'notes_persistence']);
const WEBKIT_ONLY = new Set(['webkit']);

const only = process.argv.slice(2);
const suites = readdirSync(here)
  .filter(f => f.endsWith('.test.js'))
  .map(f => f.replace(/\.test\.js$/, ''))
  .filter(n => !only.length || only.includes(n))
  .sort();

let failed = 0;
for (const name of suites) {
  const outfile = path.join(out, `${name}.mjs`);
  await build({
    entryPoints: [path.join(here, `${name}.test.js`)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    nodePaths: [path.join(root, 'node_modules')],
    alias: { '@supabase/supabase-js': path.join(here, 'stub', 'supabase-js.js') },
    external: ['@tauri-apps/*'],
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'https://stub.co', VITE_SUPABASE_KEY: 'k' }),
    },
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
    logLevel: 'error',
  });
  const engines = WEBKIT_ONLY.has(name) ? ['1'] : BOTH_ENGINES.has(name) ? ['0', '1'] : ['0'];
  for (const webkit of engines) {
    const label = `${name}${engines.length > 1 || webkit === '1' ? (webkit === '1' ? ' [webkit]' : ' [chromium]') : ''}`;
    const r = spawnSync(process.execPath, [outfile], { env: { ...process.env, WEBKIT: webkit }, encoding: 'utf8' });
    const summary = (r.stdout.match(/\d+ passed, \d+ failed/) || ['no summary'])[0];
    const ok = r.status === 0;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(22)} ${summary}`);
    if (!ok) {
      failed++;
      console.log(r.stdout.split('\n').filter(l => /FAIL|Error/.test(l)).map(l => '      ' + l).join('\n'));
      if (r.stderr) console.log(r.stderr.split('\n').slice(0, 8).map(l => '      ' + l).join('\n'));
    }
  }
}
process.exit(failed ? 1 : 0);
