# Code to Click — Profitability Intelligence

Monthly revenue, cost and margin for a services firm. The month is the record;
each closed month is an immutable snapshot.

`CLAUDE.md` is the fuller brief — the rules the system rests on, the rollup
chain, and the gotchas. Read it before changing anything.

## Layout

    public/index.html   the app the browser loads (built - do not edit by hand)
    src/                the parts index.html is built from - edit these
    api/                backend, one file per endpoint
    lib/                db connection, session cookie, app <-> database wording
    db/                 schema, write operations, starter accounts, migrations
    scripts/migrate.mjs applies database changes to Neon
    vercel.json         serves only public/, runs functions in Singapore

`src/`, `lib/` and `db/` are not served to the browser: `outputDirectory` is
`public`.

## Working on the app

    npm install
    npm run build

`public/index.html` is built by concatenating the `src/part*` files. **Edit a
part and you must rebuild**, or the change does nothing — the browser only ever
loads the built file. The built file is committed, so nobody else needs to run
this.

Part order is fixed in `src/build.sh`: `part2_data.js` defines `window.CTC`
before anything uses it, and `part16_auth.js` is last because it mounts the
sign-in gate.

## Deploying

Vercel deploys on every push to `main`. Nothing to run by hand.

If a change needs new database functions, load them **before** pushing — the
database is backward compatible, the deployed app is not.

## Database

Setting up an empty database, in the Neon SQL editor, in this order:

1. `db/c2c_schema_v1.3.sql` — tables, views, triggers, sessions
2. `db/c2c_operations_v1.0.sql` — the write operations
3. `db/c2c_seed_users_v1.0.sql` — the four starter accounts

Check it took:

```sql
select
  (select count(*) from pg_tables where schemaname = 'c2c')                    as tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'c2c' and p.proname like 'op_%')                         as ops,
  (select count(*) from c2c.users)                                             as users;
```

Expect 17 tables, 21 operations, 4 users.

**The schema file drops and recreates `c2c`.** Never run it against a database
that holds anything.

### Changing a database that already has data

    npm run db:status     what is applied and pending - touches nothing
    npm run db:migrate    apply it

Three kinds of file, treated differently:

- **`db/migrations/NNN_name.sql`** — applied once each, in order, each in a
  transaction, recorded with a checksum. Anything structural goes here.
- **`db/c2c_operations_v1.0.sql`** — `create or replace` throughout, so it is
  re-applied on every run. New `op_*` functions go here, not in a migration.
- **The schema and seed files** — never run by the script. The schema drops
  everything; the seed resets all four passwords to their starters.

`DATABASE_URL` comes from a local `.env` — see `.env.example`. It is gitignored,
and it does not belong in a chat window. If it ever appears in one, rotate it.

## Backup and restore

Administration → Backup & restore. **Download backup (.json)** writes every
client, project, person, licence and month to one file; restoring replaces the
organization from that file, closed months included.

On Neon's free plan there is no point-in-time restore and history is short, so
this file is the only way back. Take one before anything destructive.

## Accounts and passwords

- **Settings → Account** — change your own password. Any role, including
  viewer. Asks for your current password; you stay signed in and every other
  session for your account ends.
- **Administration → Accounts** — owner only. Reset anyone else's without their
  old password. All of their sessions end immediately.

Change the starter passwords before anyone uses this for real. From SQL if you
are locked out:

```sql
select c2c.set_password('owner@codetoclick.ai','a better password');
```

## Region

Functions run in `sin1` (Singapore) to sit beside the Neon database.
If you move the database, move this too - the two must match, or every
query crosses an ocean. See `vercel.json`.

## Known gaps

See `CLAUDE.md` section 10 for the full list. The ones that bite soonest:

- `CURRENT_MONTH` is hardcoded in `src/part2_data.js`. The month list ends
  there, so the app cannot accept a month past it until the line is edited and
  the app rebuilt.
- Employee CTC cannot be edited after the person is created.
- Nothing purges `sessions` or `login_attempts`; the functions exist but no
  cron calls them.
