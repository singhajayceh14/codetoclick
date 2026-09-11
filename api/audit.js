/* The audit trail, read only.

   Deliberately not part of /api/state: that call returns everything the app
   needs to draw itself and is loaded on every sign-in, while this table grows
   without bound. It is paged, newest first, and filterable by month. */
import { currentUser, onlyMethod } from '../lib/auth.js';
import { loadAudit } from '../lib/state.js';

export default async function handler(req, res) {
  if (!onlyMethod(req, res, 'GET')) return;

  try {
    const me = await currentUser(req);
    if (!me) return res.status(401).json({ error: 'not_signed_in' });

    /* Who changed a salary is not something a read-only account should read. */
    if (!['owner', 'finance'].includes(me.role)) {
      return res.status(403).json({ error: 'not_permitted', message: 'The activity log needs an owner or finance account.' });
    }

    const q = req.query || {};
    const rows = await loadAudit(me.org_id, {
      month: typeof q.month === 'string' && /^\d{4}-\d{2}$/.test(q.month) ? q.month : null,
      limit: Math.min(200, Math.max(1, parseInt(q.limit, 10) || 100)),
      before: /^\d+$/.test(q.before || '') ? q.before : null
    });
    res.status(200).json({ rows });
  } catch (e) {
    console.error('audit failed:', e.message);
    res.status(500).json({ error: 'server', message: 'Could not load the activity log.' });
  }
}
