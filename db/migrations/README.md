# Migrations

One file per change, applied once each, in filename order:

    001_short_name.sql
    002_another_thing.sql

Run them with `npm run db:migrate`. `npm run db:status` shows what is applied
and what is pending without touching anything.

## What goes in here

Anything that changes **structure or data**: a new column, a new table, an
index, a backfill, a constraint. These run exactly once and are recorded in
`c2c.schema_migrations`.

## What does not

`db/c2c_operations_v1.0.sql` is 25 `create or replace function` statements and
nothing else, so it is re-applied on every `db:migrate` automatically. Add new
`op_*` functions there, not here - that keeps every operation visible in one
file rather than scattered across migrations.

## Two files the runner will never touch

- `c2c_schema_v1.3.sql` drops and recreates the schema. Running it loses every
  client, project, person and month.
- `c2c_seed_users_v1.0.sql` calls `set_password()` on all four accounts, which
  would put them back to their starter passwords.

Both are for setting up an empty database by hand, in the Neon SQL editor.

## Rules

- **Never edit a migration that has already run.** The runner stores a checksum
  and will refuse to continue if one changes, because the database no longer
  matches the repo and re-running cannot fix it. Write a new migration instead.
- Each file runs inside a transaction, so a failure rolls back cleanly and the
  database stays at the last good migration.
- Write the change so it is safe on a database that already has data. This is a
  live product with real salary figures in it.
