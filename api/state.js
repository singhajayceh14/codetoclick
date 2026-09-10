/* Everything the app needs to draw itself, for the signed-in user's org.
   Read only - nothing here can change a figure. */
import { currentUser } from '../lib/auth.js';
import { loadState } from '../lib/state.js';

export default async function handler(req, res) {
  try {
    const me = await currentUser(req);
    if (!me) return res.status(401).json({ error: 'not_signed_in' });
    const state = await loadState(me.org_id);
    res.status(200).json({
      user: { email: me.email, name: me.full_name, role: me.role },
      state
    });
  } catch (e) {
    console.error('state failed:', e.message);
    res.status(500).json({ error: 'server', message: 'Could not load your data.' });
  }
}
