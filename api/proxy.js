// Web build's equivalent of the Rust `fetch_get`/`fetch_post` Tauri commands
// (src-tauri/src/main.rs) — routes a request server-side so the browser page
// never has to satisfy the target's CORS policy itself. Mirrors the same
// host allowlist as the Rust side; keep the two in sync.
function isAllowedHost(host) {
  return host === 'api.anthropic.com' || host === 'github.com' || host.endsWith('.supabase.co');
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return ''; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
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
    const upstream = await fetch(url, {
      method: method.toUpperCase(),
      headers,
      body: method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD' ? undefined : body,
    });
    const text = await upstream.text();
    res.status(upstream.ok ? 200 : upstream.status).send(text);
  } catch (e) {
    res.status(502).send(e?.message || 'Upstream request failed');
  }
}
