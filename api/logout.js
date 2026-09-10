/* Sign out. Revokes the session row, so the token is dead server-side even if
   a copy of the cookie survives somewhere. Clearing the cookie is the tidy-up,
   not the security. */
import { db, tokenFrom, clearSession, onlyMethod } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!onlyMethod(req, res, 'POST')) return;
  const token = tokenFrom(req);
  try {
    if (token) await db()`select c2c.logout(${token})`;
  } catch (e) {
    console.error('logout failed:', e.message);   /* still clear the cookie */
  }
  clearSession(res);
  res.status(200).json({ ok: true });
}
