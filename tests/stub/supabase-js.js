// Stand-in for the real client. The table lives in memory and every call is
// recorded, so a test can say "the network failed here" and see what the code
// does next.
import fs from 'fs';
// One process is one app launch. A file stands in for the shared database so
// two "machines" — two processes — can talk to the same cloud.
const CLOUD_FILE = process.env.CLOUD_FILE;
globalThis.__cloud = { rows: [], failNextUpsert: false, failAll: false, calls: [] };
if (CLOUD_FILE && fs.existsSync(CLOUD_FILE)) globalThis.__cloud.rows = JSON.parse(fs.readFileSync(CLOUD_FILE, 'utf8'));
const persist = () => { if (CLOUD_FILE) fs.writeFileSync(CLOUD_FILE, JSON.stringify(globalThis.__cloud.rows)); };
let clock = Date.parse('2026-01-01T00:00:00Z');
const stamp = () => new Date(clock += 1000).toISOString();
const authListeners = new Set();

function chain(table) {
  const q = {
    _filters: {},
    select() { return q; },
    eq(col, val) { q._filters[col] = val; return q; },
    not(col, operator, pattern) { q._not = { col, prefix: pattern.replace(/%$/, '') }; return q; },
    order(col, { ascending = true } = {}) { q._order = { col, ascending }; return q; },
    limit(n) { q._limit = n; return q; },
    range(from, to) { q._range = { from, to }; return q; },
    like(col, pat) { const parts = pat.split('%'); q._like = { col, test: (v) => { let pos = 0; if (!String(v).startsWith(parts[0])) return false; pos = parts[0].length; for (let j = 1; j < parts.length; j++) { const at = String(v).indexOf(parts[j], pos); if (at < 0) return false; pos = at + parts[j].length; } return parts[parts.length-1] === '' || String(v).endsWith(parts[parts.length-1]); } }; return q; },
    async then(res) { return res(await q._run()); },
    _run: async () => {
      if (globalThis.__cloud.failAll) return { data: null, error: { message: 'offline' } };
      // Another process may have written since: read the shared cloud afresh.
      if (CLOUD_FILE && fs.existsSync(CLOUD_FILE)) globalThis.__cloud.rows = JSON.parse(fs.readFileSync(CLOUD_FILE, 'utf8'));
      let rows = globalThis.__cloud.rows.filter(r =>
        Object.entries(q._filters).every(([k, v]) => r[k] === v));
      if (q._like) rows = rows.filter(r => q._like.test(r[q._like.col]));
      if (q._not) rows = rows.filter(r => !String(r[q._not.col]).startsWith(q._not.prefix));
      if (q._order) {
        const { col, ascending } = q._order;
        rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (ascending ? 1 : -1));
      }
      if (q._limit != null) rows = rows.slice(0, q._limit);
      if (q._range) rows = rows.slice(q._range.from, q._range.to + 1);
      return { data: rows, error: null };
    },
    async upsert(payload) {
      if (globalThis.__cloud.delayNextUpsert) {
        const delay = globalThis.__cloud.delayNextUpsert;
        globalThis.__cloud.delayNextUpsert = 0;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      if (CLOUD_FILE && fs.existsSync(CLOUD_FILE)) globalThis.__cloud.rows = JSON.parse(fs.readFileSync(CLOUD_FILE, 'utf8'));
      globalThis.__cloud.calls.push(['upsert', payload]);
      if (globalThis.__cloud.failAll) return { error: { message: 'offline' } };
      if (globalThis.__cloud.failNextUpsert) {
        globalThis.__cloud.failNextUpsert = false;
        return { error: { message: 'network down' } };
      }
      const list = Array.isArray(payload) ? payload : [payload];
      list.forEach(row => {
        // Like the real table: the stamp is whatever the client sent.
        const r2 = { ...row, updated_at: row.updated_at || stamp() };
        const i = globalThis.__cloud.rows.findIndex(r => r.user_id === row.user_id && r.key === row.key);
        if (i >= 0) globalThis.__cloud.rows[i] = r2; else globalThis.__cloud.rows.push(r2);
      });
      persist();
      return { error: null };
    },
    delete() {
      const dq = {
        _f: {},
        eq(col, val) { dq._f[col] = val; return dq; },
        then(res) {
          globalThis.__cloud.calls.push(['delete', { ...dq._f }]);
          globalThis.__cloud.rows = globalThis.__cloud.rows.filter(r =>
            !Object.entries(dq._f).every(([k, v]) => r[k] === v));
          persist();
          return Promise.resolve({ error: null }).then(res);
        },
      };
      return dq;
    },
  };
  q.table = table;
  return q;
}

export function createClient() {
  return {
    from: (t) => chain(t),
    auth: {
      getSession: async () => ({ data: { session: globalThis.__session || null } }),
      getUser: async () => ({ data: { user: globalThis.__session?.user || null } }),
      setSession: async session => {
        globalThis.__session = session;
        authListeners.forEach(cb => cb('SIGNED_IN', session));
        return { data: { session }, error: null };
      },
      onAuthStateChange: callback => {
        authListeners.add(callback);
        return { data: { subscription: { unsubscribe() { authListeners.delete(callback); } } } };
      },
    },
  };
}
