// Quick sign-up: an account that works the moment it is created, with no email
// round-trip.
//
// Normal sign-up stays email-verified; this is the second door. It has to run
// on the server because only the service-role key can create a user that is
// already confirmed — doing it from the app would mean shipping that key inside
// every copy of BankoSpace.
//
// The account's auth identity is a placeholder address built from the username
// (<handle>@quick.bankospace.invalid). `.invalid` is reserved and can never
// receive mail, which is the point: nothing is ever sent, the username is
// unique because the address is, and the app can sign in with just the
// username by rebuilding the same address. The email the person typed is kept
// on the profile for contact only.
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function → Via
// Editor → name it `quick-signup` → paste this file → Deploy.

import { createClient } from 'npm:@supabase/supabase-js@2';

const QUICK_DOMAIN = 'quick.bankospace.invalid';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// An endpoint that creates confirmed accounts is an obvious target for bulk
// sign-ups. This per-address limit lives in the function instance's memory, so
// it resets when the instance is recycled — it stops casual scripting, not a
// determined attacker.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();
function allow(ip: string) {
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) { recent.set(ip, hits); return false; }
  hits.push(now);
  recent.set(ip, hits);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (!allow(ip)) return json({ error: 'Too many accounts created from here. Try again in a few minutes.' }, 429);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  const username = String(body.username ?? '').trim();
  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '');

  if (!/^[A-Za-z0-9._-]{3,24}$/.test(username)) {
    return json({ error: 'Usernames are 3–24 characters: letters, numbers, dots, dashes and underscores.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Enter a valid email address.' }, 400);
  }
  if (password.length < 6) {
    return json({ error: 'Passwords need at least 6 characters.' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Login is case-insensitive, so the address uses the lowercased handle; the
  // name as typed is what the app displays.
  const { data, error } = await admin.auth.admin.createUser({
    email: `${username.toLowerCase()}@${QUICK_DOMAIN}`,
    password,
    email_confirm: true,
    user_metadata: { username, contact_email: email, quick: true },
  });

  if (error) {
    const taken = /already|registered|exists/i.test(error.message);
    return json(
      { error: taken ? 'That username is taken.' : `Could not create the account: ${error.message}` },
      taken ? 409 : 400,
    );
  }

  return json({ ok: true, id: data.user?.id });
});
