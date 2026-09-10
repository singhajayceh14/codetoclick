/* Every change the app makes arrives here as {op, args}.
   One endpoint rather than ten REST routes: the operations map exactly onto
   the app's own data module, and having a single place for the permission
   check means a new operation cannot accidentally ship without one. */
import { db, currentUser, onlyMethod } from '../lib/auth.js';
import { OPS, WRITE_ROLES, OWNER_ONLY, OWNER_ROLES } from '../lib/state.js';

export default async function handler(req, res) {
  if (!onlyMethod(req, res, 'POST')) return;

  const me = await currentUser(req);
  if (!me) return res.status(401).json({ error: 'not_signed_in' });

  const { op, args } = req.body || {};
  const run = Object.prototype.hasOwnProperty.call(OPS, op) ? OPS[op] : null;
  if (!run) return res.status(400).json({ error: 'unknown_op', message: `Unknown operation: ${op}` });

  /* A read-only user is stopped here, not by a hidden button. */
  if (!WRITE_ROLES.includes(me.role)) {
    return res.status(403).json({ error: 'read_only', message: 'Your account has read-only access.' });
  }
  if (OWNER_ONLY.includes(op) && !OWNER_ROLES.includes(me.role)) {
    return res.status(403).json({ error: 'not_permitted', message: 'That change needs an owner or finance account.' });
  }

  try {
    await run(db(), me.org_id, args || {});
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('mutate', op, 'failed:', e.message);
    /* The database's own rules speak plainly - pass them through rather than
       inventing a second set of messages that can drift out of step. */
    const known = /over 100%|is closed|already|duplicate|violates|No clients|No projects|No employees|backup/i.test(e.message);
    res.status(known ? 409 : 500).json({
      error: known ? 'rejected' : 'server',
      message: known ? e.message : 'That change could not be saved.'
    });
  }
}
