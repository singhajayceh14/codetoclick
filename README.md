# Code to Click — Profitability Intelligence

Monthly revenue, cost and margin for a services firm. The month is the record;
each closed month is an immutable snapshot.

## Layout

    public/index.html   the app the browser loads (built - do not edit by hand)
    api/                backend, one file per endpoint
    src/                the parts index.html is built from - edit these
    db/                 PostgreSQL schema and starter accounts
    vercel.json         serves only public/, runs functions in Singapore

`src/` and `db/` are not served to the browser: `outputDirectory` is `public`.

## Deploying

Vercel deploys on every push to `main`. Nothing to run by hand.

## Database

Load once, in the Neon SQL editor:

1. `db/c2c_schema_v1.1.sql`
2. `db/c2c_seed_users_v1.0.sql`

Then check it took:

```sql
select email, role from c2c.login('owner@codetoclick.ai','ChangeMe!Owner1');
```

One row means the login works. No rows means the password is wrong.

Change the starter passwords before anyone uses this for real:

```sql
select c2c.set_password('owner@codetoclick.ai','a better password');
```

## Region

Functions run in `sin1` (Singapore) to sit beside the Neon database.
If you move the database, move this too - the two must match, or every
query crosses an ocean. See `vercel.json`.

## Not yet done

- The sign-in screen checks credentials in the browser, not against the
  database. It is a gate, not security. Do not put real salary data behind
  it until `/api/login` exists.
- Delete the "Demo accounts" block from the sign-in screen before real use.
