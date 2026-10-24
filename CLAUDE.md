# BankoSpace

A personal productivity desktop app — tasks, calendar, notes, habits and
medications, payments, Japanese study, fitness — built with **Tauri v2 + React
(Vite)**. Data lives in `localStorage` and syncs between the owner's machines
(Windows and an Apple Silicon Mac) through **Supabase** (`user_data` table,
one row per user and key).

## Commands

```bash
npm install --legacy-peer-deps
npm run build          # Vite → dist/
npm test               # all suites in tests/ (see "Tests")
npm test -- layer dash # only the named suites
cd src-tauri && cargo build   # desktop binary (Windows/macOS hosts)
```

The build needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (see
`.env.example`). Never commit `.env`.

**The desktop binary embeds the frontend at compile time.** After any frontend
change, run `npm run build` *and* `cargo build`, or the app shows the old UI.

## Releasing

1. Bump the version in three places: `package.json`, `src-tauri/tauri.conf.json`,
   and `APP_VERSION` in `src/App.jsx`. The sidebar shows `APP_VERSION`; do not
   add any separate cosmetic counter.
2. Commit, push `main`, then push an annotated tag `vX.Y.Z`.
3. `.github/workflows/release.yml` builds Windows (x64 NSIS) and macOS
   (aarch64 only — there is no Intel build) and publishes the release with a
   signed `latest.json` for the in-app updater.
4. `releases/latest/download/latest.json` can serve a stale copy for a few
   minutes after the second job finishes; check the asset through the API
   before assuming a platform is missing.

Only commit, push or release when the owner asks. Commit messages end with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## Sync — read this before touching `src/sync.js` or `src/supabase.js`

Every rule below exists because breaking it caused real data loss or two
machines silently holding different data.

- **Never assign properties onto the `localStorage` object.** In WebKit (the
  macOS app) `localStorage.setItem = fn` stores an *item* called "setItem"
  instead of replacing the method; Chromium allows it. That is why nothing
  typed on the Mac was ever sent up to 4.9.3. Writes are intercepted on
  `Storage.prototype` (guarded by `this === localStorage`). Writes that must
  not count as user edits — applying a pull, sync bookkeeping, wiping the
  device for an account switch — go through `src/utils/nativeStorage.js`.
- **Pull before mount.** `AppWrapper` runs `startupSync()` before rendering
  `App`, so React state starts from data both sides agree on. Do not move the
  first pull back into an effect.
- **Unsent changes are marked in `__sync_dirty`** (persisted). A pull never
  overwrites a marked key; the mark is cleared only once the cloud holds the
  current local value. Failed pushes are retried when the cloud is reachable
  again.
- **`lastSynced`** records the value both sides last agreed on; a re-save of
  the same data is not an edit and is not pushed.
- **Change detection is a fingerprint of every row's `updated_at`**, not the
  newest stamp. Stamps come from each client's clock, and a machine whose
  clock runs behind never produces the newest one.
- **Applying remote changes never reloads the window.** `todos` and the App
  settings in `HOT_KEYS` are re-read through `rehydrate`; keys in
  `LIVE_EVENTS` raise the event their section already listens for; everything
  else is written to storage and shows the next time its section opens.
- **Clearing the device must not delete cloud data** (`clearAccountData` uses
  the native `removeItem`).
- Each device files a status row `__status:<deviceId>` (platform, version,
  last pull/push result, unsent keys, last 15 sync events). These are not in
  `SYNC_KEYS` and are never written into localStorage. They are how one
  machine can see what another did with an edit.
- A new synced key must be added to `SYNC_KEYS` in `src/supabase.js`. If a
  section shows it and can refresh itself, add it to `LIVE_EVENTS` in
  `src/sync.js` with that section's event name.
- Deletion is a durable `user_data` row whose value is the JSON string
  `"null"` (compatible with a SQL NOT NULL constraint). Do not physically
  delete synced rows: a device seeing a key for the first time cannot tell
  a deletion from data that was never uploaded. Empty arrays/objects are
  authoritative values unless a local dirty mark protects an unsent edit.
- Note images and drawings are private per-user `__media:image:<id>` and
  `__media:strokes:<id>` rows in the same table. `noteMediaSync.js` transfers
  them separately from notes; `__note_media_dirty` persists offline work.
  Never put media bytes back into the localStorage notes payload.
- `utils/backup.js` owns the backup sections and versioned import/export.
  Every SYNC_KEYS entry is covered; media is included in `_media`. Auth
  sessions and API keys are excluded. Notes must persist an empty array too;
  an empty live list must never fall back to an older notes backup.

The desktop build does not register a service worker (it could only ever
serve an older copy of the embedded frontend); `src/main.jsx` removes any left
behind. The web build keeps its PWA service worker.

## Dashboard

The user builds it from widgets (`src/utils/dashLayout.js` holds the
registry and the layout model; `src/components/DashColumns.jsx` renders it,
including edit mode and the widget library). Layout is synced
(`dashLayout_v1`). Existing users were migrated to exactly their old layout;
a brand-new user starts empty. New widgets live in
`src/components/widgets/` and use `WidgetFrame` so they match the existing
panels. A brand-new user is also asked once which sidebar sections to keep
(`SectionPicker`, `onboarded_v1`, synced); Settings → Pages toggles them later.

## Tests

`tests/run.mjs` bundles each `*.test.js` with esbuild and runs it under Node.
Supabase is replaced by `tests/stub/supabase-js.js` (in-memory, or a shared
file via `CLOUD_FILE` for multi-process runs; it stores client-sent
timestamps like the real table). `tests/env.js` gives a browser-like
`Storage`; with `WEBKIT=1` it follows the spec's named-property setter, so
the WebKit-only failure can be reproduced. Storage-touching suites run under
both. Add a negative control when testing a fix: show the old code fails the
same test.

## Constraints

- No account's data may appear in another account. Switching accounts wipes
  local data except the allow-list in `src/utils/accounts.js`.
- The Anthropic API key is per account, stored under the account id, and is
  never synced, shared or exported.
- Kana Guide content is static and bundled: no runtime AI calls.
- House style is the noir palette tokens; new UI uses the existing CSS
  variables (`--bg-base`, `--bg-card`, `--border`, `--text-*`, `--accent`).
- UI copy is English.

## Desktop-only diagnostics

The app appends a timeline to `%USERPROFILE%\bankospace-diag.log` (`RUST:`
HTTP lines include the path; `SYNC` lines show pulls, ticks, pushes and other
devices' status). WebView2 data is under
`%LOCALAPPDATA%\com.berkbankoglu.bankospace\EBWebView` — when clearing caches
there, never delete `Local Storage`.

## Known open items

- No Intel Mac build.
- Month-view tap-to-place schedules the selected task at 9 AM; the arm bar
  states the time. Day/week views keep the tapped time slot.
- Password reset is code-based; no custom SMTP for sign-up mail.
- Narrow layouts of Settings and Login were not checked on screen.
- Sync is last-writer-wins per key: the same list edited on two machines
  within seconds keeps only one side's change (notes keep the note open in
  the editor). Item-level merging for `todos`/`notes` would fix it.
- `src/components/Goals.jsx`, `QuickNote.jsx`, `SilkroadCalc.jsx` are not
  rendered anywhere.
