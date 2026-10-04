// Web build's equivalent of the Rust `fetch_get`/`fetch_post` Tauri commands
// (src-tauri/src/main.rs) — routes a request server-side so the browser page
// never has to satisfy the target's CORS policy itself. Mirrors the same
// host allowlist as the Rust side; keep the two in sync.
function isAllowedHost(host) {
  return host === 'api.anthropic.com' || host === 'github.com' || host.endsWith('.supabase.co');
}

// Only the app's own pages may use this relay. Without the check, anyone on
// the internet could post to it and use the deployment as an anonymising proxy
// to the allowlisted hosts.
function isSameOrigin(req) {
  const { origin, host } = req.headers;
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

// Headers the upstream APIs actually need. Anything else the caller sets -
// cookies, forwarding headers, a different Host - is dropped rather than
// relayed.
const FORWARDED_HEADERS = new Set([
  'authorization', 'apikey', 'x-api-key', 'x-client-info',
  'anthropic-version', 'anthropic-beta',
  'content-type', 'accept', 'accept-profile', 'content-profile',
  'prefer', 'range', 'range-unit', 'x-upsert',
]);

function hostOf(url) {
  try { return new URL(url).host; } catch { return ''; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  if (!isSameOrigin(req)) {
    res.status(403).send('Forbidden');
    return;
  }

  const { url, method = 'GET', headers = {}, body } = req.body || {};
  if (typeof url !== 'string' || !url) {
    res.status(400).send('Missing url');
    return;
  }

  const host = hostOf(url);
  if (!isAllowedHost(host)) {
    res.status(403).send(`Host not allowed: ${host}`);
    return;
  }

  try {
    const safeHeaders = Object.fromEntries(
      Object.entries(headers).filter(([k]) => FORWARDED_HEADERS.has(k.toLowerCase())),
    );
    const upstream = await fetch(url, {
      method: method.toUpperCase(),
      headers: safeHeaders,
      body: method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD' ? undefined : body,
    });
    const text = await upstream.text();
    // Passed through as-is: Supabase's clients read both to tell success from
    // failure and JSON from text.
    const type = upstream.headers.get('content-type');
    if (type) res.setHeader('content-type', type);
    res.status(upstream.status).send(text);
  } catch (e) {
    res.status(502).send(e?.message || 'Upstream request failed');
  }
}
