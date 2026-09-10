#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   Apply database changes to Neon.

   CLAUDE.md section 4 says the schema file drops and recreates c2c, that there
   are no migrations, and that a change needs a separate db/migrate_*.sql. This
   is the thing that runs them, and the record of which ones have run.

   Three kinds of file, treated differently on purpose:

     forbidden   never run from here. The schema file drops the schema; the
                 seed file calls set_password() unconditionally and would put
                 all four accounts back to their starter passwords.
     idempotent  re-applied on every pass. c2c_operations_v1.0.sql is 25
                 create-or-replace functions and nothing else, so running it
                 again is a no-op that guarantees the database matches the repo.
     migrations  db/migrations/NNN_name.sql, applied once each, in order, each
                 inside a transaction, and recorded in c2c.schema_migrations.

   Usage
     npm run db:status     what is applied, what is pending. Touches nothing.
     npm run db:migrate    apply the pending ones, then re-apply the idempotent
     npm run db:migrate -- --dry-run    print the plan and stop

   The connection string is read from DATABASE_URL, or from a local .env file.
   It is never printed, never logged, and never committed - .env is in
   .gitignore and denied to the file-reading tools. It does not belong in chat.
   --------------------------------------------------------------------------- */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'db', 'migrations');

const FORBIDDEN = {
  'c2c_schema_v1.3.sql':
    'it drops and recreates the c2c schema - every client, project, person and month would be lost',
  'c2c_seed_users_v1.0.sql':
    'it calls set_password() on all four accounts, putting them back to their starter passwords'
};
const IDEMPOTENT = ['c2c_operations_v1.0.sql'];

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const STATUS = has('--status');
const DRY = has('--dry-run');

/* ---- connection --------------------------------------------------------- */
function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.*)$/.exec(line);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  fail(
    'DATABASE_URL is not set.\n\n' +
    '  Put it in a local .env file at the repo root:\n' +
    '      DATABASE_URL=postgresql://...\n\n' +
    '  Copy it from Vercel (Settings -> Environment Variables) or the Neon\n' +
    '  dashboard. .env is gitignored. Do not paste it into a chat window.'
  );
}

function fail(msg) { console.error('\n' + msg + '\n'); process.exit(1); }
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

/* ---- the migration files ------------------------------------------------ */
function migrationFiles() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()                                   // NNN_ prefix makes this the order
    .map(name => {
      const sql = fs.readFileSync(path.join(DIR, name), 'utf8');
      return { name, sql, checksum: sha(sql) };
    });
}

async function ensureTable(client) {
  await client.query(`
    create schema if not exists c2c;
    create table if not exists c2c.schema_migrations (
      name        text primary key,
      checksum    text        not null,
      applied_at  timestamptz not null default now()
    );
  `);
}

/* ---- main --------------------------------------------------------------- */
/* pg 8.13+ warns that it treats sslmode=require as verify-full, and that this
   will change in pg 9. Neon presents a valid certificate, so verify-full is
   what we want either way - saying so explicitly keeps today's behaviour when
   that default flips, and silences a warning that otherwise reads like a
   problem with your connection string. */
function sslNormalised(url) {
  if (/[?&]sslmode=/.test(url)) return url.replace(/([?&]sslmode=)require/, '$1verify-full');
  return url + (url.includes('?') ? '&' : '?') + 'sslmode=verify-full';
}

const client = new pg.Client({ connectionString: sslNormalised(connectionString()) });

try {
  await client.connect();
} catch (e) {
  /* e.message is empty for some connection failures - a bare "could not
     connect" with nothing after it is a useless thing to hand someone. */
  const why = e.message || e.code || String(e);
  fail('Could not connect to the database.\n  ' + why +
       '\n\n  Check DATABASE_URL points at the Neon database, and that the\n' +
       '  Neon project is not suspended.');
}

try {
  await ensureTable(client);

  const applied = new Map(
    (await client.query('select name, checksum, applied_at from c2c.schema_migrations')).rows
      .map(r => [r.name, r])
  );
  const files = migrationFiles();
  const pending = files.filter(f => !applied.has(f.name));

  /* An already-applied file that has changed on disk means someone edited
     history. The database will not match the repo and re-running will not fix
     it - say so rather than pretend. */
  const drifted = files.filter(f => applied.has(f.name) && applied.get(f.name).checksum !== f.checksum);

  console.log('\nMigrations in db/migrations: %d applied, %d pending', applied.size, pending.length);
  for (const f of files) {
    const a = applied.get(f.name);
    const mark = !a ? 'PENDING' : (a.checksum !== f.checksum ? 'CHANGED SINCE APPLIED' : 'applied');
    console.log('  %s  %s', mark.padEnd(22), f.name);
  }
  if (!files.length) console.log('  (none yet)');

  if (drifted.length) {
    console.error('\n%d migration(s) changed after being applied:', drifted.length);
    for (const f of drifted) console.error('  ' + f.name);
    console.error('The database no longer matches the repo. Write a new migration that');
    console.error('corrects the difference rather than editing one that has already run.');
    if (!STATUS) process.exit(1);
  }

  if (STATUS) {
    console.log('\nIdempotent, re-applied on every migrate: %s', IDEMPOTENT.join(', '));
    console.log('Never run from here: %s\n', Object.keys(FORBIDDEN).join(', '));
    process.exit(0);
  }

  if (DRY) {
    console.log('\nDry run. Would apply:');
    for (const f of pending) console.log('  ' + f.name);
    for (const f of IDEMPOTENT) console.log('  ' + f + '  (re-applied)');
    console.log('');
    process.exit(0);
  }

  /* Pending migrations, one transaction each, so a failure leaves the database
     at the last good migration rather than half way through a bad one. */
  for (const f of pending) {
    process.stdout.write('applying ' + f.name + ' ... ');
    try {
      await client.query('begin');
      await client.query(f.sql);
      await client.query(
        'insert into c2c.schema_migrations (name, checksum) values ($1, $2)',
        [f.name, f.checksum]
      );
      await client.query('commit');
      console.log('ok');
    } catch (e) {
      await client.query('rollback').catch(() => {});
      console.log('FAILED');
      fail(f.name + ' failed and was rolled back:\n  ' + e.message);
    }
  }
  if (!pending.length) console.log('\nNothing pending.');

  /* Then the definitions that are safe to re-apply, so the functions in the
     database always match the ones in the repo. */
  for (const name of IDEMPOTENT) {
    const file = path.join(ROOT, 'db', name);
    if (!fs.existsSync(file)) { console.error('missing: db/' + name); continue; }
    process.stdout.write('re-applying db/' + name + ' ... ');
    try {
      await client.query('begin');
      await client.query(fs.readFileSync(file, 'utf8'));
      await client.query('commit');
      console.log('ok');
    } catch (e) {
      await client.query('rollback').catch(() => {});
      console.log('FAILED');
      fail('db/' + name + ' failed and was rolled back:\n  ' + e.message);
    }
  }

  const n = (await client.query(
    `select count(*)::int as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'c2c' and p.proname like 'op_%'`
  )).rows[0].n;
  console.log('\nDone. %d op_* functions in c2c.\n', n);
} finally {
  await client.end().catch(() => {});
}
