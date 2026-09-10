/* Sign in. The password is checked by PostgreSQL (bcrypt), never here, and
   never reaches the browser again. The browser gets a cookie it cannot read. */
import { db, setSession, onlyMethod } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!onlyMethod(req, res, 'POST')) return;

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'missing', message: 'Enter your email and password.' });
  }

  try {
    const agent = (req.headers['user-agent'] || '').slice(0, 300);
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;

    const rows = await db()`
      select * from c2c.login(${String(email).trim()}, ${String(password)}, ${agent}, ${ip}::inet)`;

    /* No rows means wrong password OR unknown email. One message for both, so
       this endpoint cannot be used to discover who has an account. */
    if (!rows.length) {
      return res.status(401).json({
        error: 'invalid',
        message: 'That email and password do not match an account.'
      });
    }

    const u = rows[0];
    setSession(res, u.token);
    res.status(200).json({
      user: { email: u.email, name: u.full_name, role: u.role, orgId: u.org_id }
    });
  } catch (e) {
    console.error('login failed:', e.message);
    res.status(500).json({ error: 'server', message: 'Sign in is unavailable right now.' });
  }
}
