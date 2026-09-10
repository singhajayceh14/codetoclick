# Code to Click — Profitability Intelligence

Internal monthly profitability reporting for a services firm. Two users, one
organization, private. Live on Vercel at `codetoclick.vercel.app`, data in
Neon PostgreSQL (Singapore, `ap-southeast-1`).

---

## 1. The rules the whole system rests on

Read these before changing anything. Every design decision below follows from
them, and a change that breaks one is a bug however good it looks.

1. **The month is the record.** Not an annual system with a month filter.
   Every fact carries a month; every report is a sum over months.
2. **A closed month is immutable.** Editing October must never alter September.
   Enforced by a database trigger, not by the UI.
3. **Allocation can never exceed 100%** per person per month. Also a trigger —
   it is a cross-row rule that a CHECK constraint cannot express.
4. **Software licences are split equally across everyone on payroll**, and each
   person's share then follows their allocation onto projects. Whatever lands
   on the bench stays company overhead. Nothing is lost.
5. **A non-billable project is a cost centre.** No revenue, no margin; its
   people-time and licence share become company overhead.
6. Money is `numeric`, never float. Currency USD. Margin bands: healthy 35%+,
   watch 20-35%, critical below 20% (configurable per org).

### The rollup chain

    employee annual CTC
      -> monthly cost
      -> monthly allocation %
      -> project employee cost
      -> + project other cost (booked costs + licence share)
      -> project profit / margin
      -> client
      -> company

### Column vocabulary (use these exact names in UI)

| Column | Meaning |
|---|---|
| Revenue | billed that month |
| Employee cost | allocated people cost |
| **Contribution after people** | Revenue − Employee cost |
| **People margin** | that ÷ Revenue |
| Other cost | booked costs + licence share |
| **Profit** | Revenue − all cost |
| **Margin** | Profit ÷ Revenue |

---

## 2. Architecture

    Browser                     Vercel Functions            Neon PostgreSQL
    ----------------------      --------------------        -----------------
    app (one HTML file)   -->   /api/state       -->        read facts
    JS engine computes          /api/mutate      -->        c2c.op_* functions
    margins locally             /api/login|me|logout         c2c.login/logout

**The database stores facts. The browser calculates.** This was a deliberate
choice: the JS engine (`rollup()`) already existed and is well tested, the
dataset is small, and it left the entire UI untouched.

The SQL views (`v_project_month`, `v_client_month`, `v_company_month`) compute
the same figures independently. They are **not** in the app's path — they are
the reporting layer and, more usefully, a cross-check. Two implementations that
must agree is a stronger guarantee than one. **If you change the maths in one,
change it in the other and prove they still match.**

---

## 3. Repo layout

    public/index.html      the app. BUILT ARTEFACT - never edit by hand
    src/part*.{js,html}    the real source; index.html is these concatenated
    src/build.sh           the build: cat parts > app.html
    api/*.js               one file per endpoint (Vercel convention)
    lib/auth.js            db connection, session cookie, currentUser()
    lib/state.js           app vocabulary <-> database translation
    db/*.sql               schema, write operations, seed accounts
    vercel.json            outputDirectory: public, regions: ["sin1"]

`outputDirectory: public` means `src/`, `db/` and `lib/` are **not** served to
browsers. Keep it that way.

### Building

`src/build.sh` concatenates the parts in a fixed order into `app.html`, then
writes `test-page.html`. It is a `sh` script (does not run on Windows
PowerShell). The built `public/index.html` is committed, so the user never
needs to run it — but **if you edit a `src/part*` file you must rebuild and
commit `public/index.html` too**, or the change does nothing.

Part order matters: `part2_data.js` (engine) defines `window.CTC` before
everything else uses it; `part16_auth.js` is last and mounts the gate.

---

## 4. Database

Schema `c2c`. Load order, all in the Neon SQL editor:

1. `db/c2c_schema_v1.3.sql` — structure, sessions, brute-force guard, views
2. `db/c2c_operations_v1.0.sql` — the 18 write operations
3. `db/c2c_seed_users_v1.0.sql` — starter accounts

The schema file **drops and recreates** `c2c`. There are no migrations yet; if
you need one, write it as a separate `db/migrate_*.sql` rather than editing the
schema file, or existing data is lost.

### Tables

**Tenancy:** `organizations`, `users`, `memberships` (owner/finance/manager/
viewer), `sessions`, `login_attempts`, `periods`.

**Registers** (things that exist over time): `clients`, `projects`,
`employees`, `employee_compensation`, `cost_categories`, `software_licences`.

**Period facts** (one row per month per thing): `project_revenue`,
`employee_period_costs`, `allocations` (null `project_id` = internal time),
`other_costs`, `audit_log`.

### The `code` column

Registers carry a `code` (`C01`, `P07`, `E12`) — the short id the app itself
generates — unique per org, alongside the uuid primary key. This lets the
browser and the database name the same record with no mapping layer. The API
speaks in codes; `c2c.code_id(table, org, code)` resolves them and raises a
readable error when a code does not exist.

### Write operations

Every change is one call to a `c2c.op_*` function. **This is not optional
style — it is why writes are atomic.** An earlier version did "insert employee,
then insert their pay row" as two API calls; when the second failed, the
database was left holding a person with no pay record.

    op_add_client        op_update_client     op_delete_client
    op_add_project       op_update_project    op_delete_project
    op_add_employee      op_update_employee   op_delete_employee
    op_add_licence       op_update_licence    op_delete_licence
    op_set_revenue       op_set_emp_cost      op_set_allocation
    op_add_cost          op_set_fiscal_start  op_close_period

---

## 5. API

| Endpoint | Method | Notes |
|---|---|---|
| `/api/health` | GET | no database, no deps. Deploy smoke test |
| `/api/db-check` | GET | connection + schema diagnosis, staged errors |
| `/api/login` | POST | `{email, password}` -> httpOnly cookie |
| `/api/me` | GET | who is signed in, or 401 |
| `/api/logout` | POST | revokes the session row server-side |
| `/api/state` | GET | everything the app needs, for this org |
| `/api/mutate` | POST | `{op, args}` — every write |

`/api/mutate` is one endpoint rather than ten REST routes on purpose: the ops
map exactly onto the app's own data module, and a single place for the
permission check means a new operation cannot ship without one.

**Permissions** are checked in `api/mutate.js`, server-side:
`owner`/`finance`/`manager` may write; `viewer` gets 403. Deletes, closing a
month and fiscal settings need `owner` or `finance`. Hiding a button is not a
permission — assume the API is called directly.

---

## 6. How to add a new capability

The seam is narrow. Follow it in this order:

1. **Database.** Add `op_<thing>` to `db/c2c_operations_v1.0.sql`. One
   function, so it is atomic. Raise a plain-English exception on bad input —
   `api/mutate.js` passes recognisable database messages straight through to
   the user, so the wording matters.
2. **Server.** Add one line to `OPS` in `lib/state.js` calling it. If the new
   thing must be read back, add it to `loadState()` too — and format any date
   in SQL with `to_char(col,'YYYY-MM')` (see gotchas).
3. **Client.** In `src/part2_data.js`, the mutation function updates the local
   arrays as it always did, then calls `sync('<op>', args)`. Do not make it
   async; the UI depends on these returning immediately.
4. **Rebuild** (`sh src/build.sh`) and commit `public/index.html`.
5. **Test** end to end (section 7). Not with mocks.

---

## 7. Testing

There is a real harness in `/tmp/e2e` (recreate it if gone — it is not
committed). It runs the **actual endpoint files** against a **real PostgreSQL**
over HTTP in a **real browser**. Mocks were not enough: every one of the three
serious bugs found so far passed mocked tests.

    node_modules/@neondatabase/serverless/   shim: same call shape, pg over TCP
    server.mjs                               serves app + dispatches /api/*
    full.cjs                                 the multi-user scenario

The shim exists because `@neondatabase/serverless` talks HTTP to Neon and
cannot reach a local database. Only the transport differs.

**The test that matters:** two browsers, two accounts, one database, identical
figures. Plus the SQL views computing the same numbers independently.

Also in the app repo's history (`/home/claude/ctc`): `smoke.js` (renders every
route), `respaudit.js` (overflow at every width), `darkresp.js`,
`contrast.js` (WCAG AA on every text pair), `admintest.js`, `formtest.js`.
Run all of them after any UI change. They currently pass clean.

---

## 8. Gotchas that have already bitten

These cost real debugging time. Do not rediscover them.

- **`session_user` is a reserved word** in PostgreSQL. The session lookup
  function is `session_lookup`.
- **Pin `search_path` on every function** (`set search_path = c2c, public`).
  Without it a function resolves table names using the *caller's* path, so
  `c2c.login(...)` from the API fails while the same call works in psql.
- **Never derive a month from a driver's date object.** `String(date).slice(0,7)`
  gave `"Thu Sep"` with one driver and `"2026-09"` with another — silent, and
  every figure read as zero. Format in SQL: `to_char(col,'YYYY-MM')`.
- **Multi-table writes must be one database function.** See section 4.
- **Qualify columns inside `returns table` functions.** A bare `email` is
  ambiguous against the function's own output column.
- **Environment variables only reach deployments built after they are added.**
  Adding `DATABASE_URL` then wondering why it is missing means: redeploy.
- **localStorage throws** in some embedded contexts. Any browser-storage access
  needs try/catch. (The app no longer uses it, but the pattern recurs.)

---

## 9. Decisions taken, and why

| Decision | Reason | Reversible? |
|---|---|---|
| Browser calculates, database stores | UI untouched, engine already tested | Yes — views already compute the same thing |
| One `/api/mutate` instead of REST routes | one permission check, ops match the app's vocabulary | Yes, mechanically |
| Write ops as database functions | atomicity; half-applied writes were a real bug | No, and should not be |
| Session in an httpOnly cookie | page JS cannot read it, so injected script cannot steal it | No |
| Short `code` columns beside uuids | no id translation layer, no async add* | Yes |
| Views kept but unused by the app | independent cross-check of the maths | Yes |

---

## 10. Known gaps

Ordered by how much they matter for two users.

1. **No concurrency control.** Two people editing the same month's revenue at
   once: the second save wins silently. Deliberately not fixed — with two users
   it is not worth the complexity. Revisit if the team grows.
2. **No password-change UI.** Done in SQL:
   `select c2c.set_password('a@b.com','new')`. A settings screen would be a
   reasonable next feature.
3. **`employee_compensation` is written but not read** by the app; per-month
   `employee_period_costs` is the truth. Either wire it up or drop it — right
   now it is a half-used table.
4. **No audit trail in practice.** `audit_log` exists and nothing writes to it.
5. **`baseRev` and `health`** on projects are demo-era fields; they round-trip
   as 0 / 0.5 and are inert. Remove them when convenient.
6. **No backup automation.** The app has a JSON export in Manage Data; Neon's
   free plan keeps limited history.

---

## 11. Working agreement

The owner is not a full-time developer. He asks for, and values:

- One small step at a time; stop and wait for confirmation.
- Honest pushback over agreement. Say when something is a bad idea.
- Verify before asserting. Run the thing; do not claim it works because it
  should. Flag estimates and opinions as estimates and opinions.
- Short answers. Do not list every failure mode.
- At a milestone, zoom out briefly: what we just did and how it connects to
  the goal. Short and plain.
- Successive versions of a delivered file get distinct versioned filenames.
- Never ask for, and never accept, a database connection string in chat. It
  belongs in Vercel's environment variables. If one appears, say so and tell
  him to rotate it.
