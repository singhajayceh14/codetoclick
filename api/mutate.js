/* Every change the app makes arrives here as {op, args}.
   One endpoint rather than ten REST routes: the operations map exactly onto
   the app's own data module, and having a single place for the permission
   check means a new operation cannot accidentally ship without one. */
import { db, currentUser, onlyMethod } from '../lib/auth.js';
import { OPS, WRITE_ROLES, OWNER_ONLY, OWNER_ROLES, OWNER_STRICT, SELF_SERVICE } from '../lib/state.js';

export default async function handler(req, res) {
  if (!onlyMethod(req, res, 'POST')) return;

  const me = await currentUser(req);
  if (!me) return res.status(401).json({ error: 'not_signed_in' });

  const { op, args } = req.body || {};
  const run = Object.prototype.hasOwnProperty.call(OPS, op) ? OPS[op] : null;
  if (!run) return res.status(400).json({ error: 'unknown_op', message: `Unknown operation: ${op}` });

  /* Changing your own password is not a write against the company's figures,
     so it is the one thing a viewer may do. Everything below still applies. */
  const selfService = SELF_SERVICE.includes(op);

  /* A read-only user is stopped here, not by a hidden button. */
  if (!selfService && !WRITE_ROLES.includes(me.role)) {
    return res.status(403).json({ error: 'read_only', message: 'Your account has read-only access.' });
  }
  if (OWNER_ONLY.includes(op) && !OWNER_ROLES.includes(me.role)) {
    return res.status(403).json({ error: 'not_permitted', message: 'That change needs an owner or finance account.' });
  }
  /* Stricter than OWNER_ONLY: finance may touch every figure, but not identity. */
  if (OWNER_STRICT.includes(op) && me.role !== 'owner') {
    return res.status(403).json({ error: 'not_permitted', message: "Only an owner can reset another account's password." });
  }

  try {
    /* The audit triggers read whoever is acting from a transaction-local
       setting, so it has to travel in the same transaction as the write - not
       as a second call, which a pooled HTTP connection would not carry over.
       Nothing outside a request sets it, so a change made by hand in the SQL
       editor records a null actor rather than the wrong one. */
    const sql = db();
    const write = run(sql, me.org_id, args || {}, me);
    await sql.transaction([
      sql`select set_config('c2c.actor', ${me.user_id}, true)`,
      write
    ]);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('mutate', op, 'failed:', e.message);
    /* The database's own rules speak plainly - pass them through rather than
       inventing a second set of messages that can drift out of step. */
    const known = /over 100%|is closed|already|duplicate|violates|No clients|No projects|No employees|backup|password|account/i.test(e.message);
    res.status(known ? 409 : 500).json({
      error: known ? 'rejected' : 'server',
      message: known ? e.message : 'That change could not be saved.'
    });
  }
}
