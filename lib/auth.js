/* Shared by every endpoint that needs the database or the session cookie.
   One place, so the cookie rules can never drift between login and logout. */
import { neon } from '@neondatabase/serverless';

export const COOKIE = 'c2c_session';

/* 12 hours - matches sessions.expires_at in the schema. Change both or neither. */
const MAX_AGE = 12 * 60 * 60;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  return neon(process.env.DATABASE_URL);
}

/* httpOnly: the page's own JavaScript cannot read this, so a script injected
   into the app cannot steal a session. Secure: HTTPS only. SameSite=Lax: not
   sent from other sites, which blocks the basic cross-site request forgery. */
export function setSession(res, token) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`);
}

export function clearSession(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

export function tokenFrom(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

/* Who is calling, or null. Every endpoint that touches money will start here. */
export async function currentUser(req) {
  const token = tokenFrom(req);
  if (!token) return null;
  const rows = await db()`select * from c2c.session_lookup(${token})`;
  return rows[0] || null;
}

export function onlyMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  res.status(405).json({ error: 'method_not_allowed' });
  return false;
}
