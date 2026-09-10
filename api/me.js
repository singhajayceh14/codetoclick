/* Who is signed in? The page asks this on load instead of trusting whatever
   the browser has lying around. The server decides, every time. */
import { currentUser } from '../lib/auth.js';

export default async function handler(req, res) {
  try {
    const u = await currentUser(req);
    if (!u) return res.status(401).json({ error: 'not_signed_in' });
    res.status(200).json({
      user: { email: u.email, name: u.full_name, role: u.role, orgId: u.org_id }
    });
  } catch (e) {
    console.error('me failed:', e.message);
    res.status(500).json({ error: 'server' });
  }
}
