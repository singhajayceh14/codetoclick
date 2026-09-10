/* Proves three things at once, and says which one failed:
     1. the DATABASE_URL environment variable arrived from Neon
     2. a query actually reaches the database
     3. the schema and the four starter accounts are loaded
   No login logic here on purpose - when login misbehaves later, this
   endpoint tells you whether the problem is below it or in it. */
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({
      ok: false,
      step: 'env',
      message: 'DATABASE_URL is not set. Connect the Neon database to this project in Vercel, then redeploy.'
    });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    const [{ now, version }] = await sql`select now() as now, version() as version`;

    let schema;
    try {
      const rows = await sql`
        select m.role, u.email
          from c2c.users u
          join c2c.memberships m on m.user_id = u.id
         order by u.email`;
      schema = { loaded: true, accounts: rows.length, roles: rows.map(r => r.role) };
    } catch (e) {
      schema = {
        loaded: false,
        message: 'Connected, but the c2c schema is missing. Run db/c2c_schema_v1.1.sql then db/c2c_seed_users_v1.0.sql in the Neon SQL editor.',
        detail: e.message
      };
    }

    res.status(200).json({
      ok: schema.loaded,
      step: schema.loaded ? 'done' : 'schema',
      region: process.env.VERCEL_REGION || 'local',
      postgres: String(version).split(' ').slice(0, 2).join(' '),
      serverTime: now,
      schema
    });
  } catch (e) {
    /* Never echo the connection string, even in an error. */
    res.status(500).json({
      ok: false,
      step: 'connect',
      message: 'DATABASE_URL is set but the query failed. Check the Neon database is running and connected to this project.',
      detail: e.message
    });
  }
}
