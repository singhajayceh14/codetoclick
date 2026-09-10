-- ============================================================================
-- Code to Click — Profitability Intelligence
-- PostgreSQL schema, version 1.0
--
-- The whole model rests on one rule: THE MONTH IS THE RECORD. Registers
-- (clients, projects, people, licences) describe things that exist over time;
-- period facts (revenue, payroll, allocation, cost) describe one month and are
-- never restated by a later change. Everything the product reports is a sum
-- over months, so the tables below are deliberately thin and the reporting
-- lives in views.
--
-- Tested against PostgreSQL 16.
-- ============================================================================

create extension if not exists pgcrypto;          -- gen_random_uuid()
create extension if not exists citext;            -- case-insensitive e-mail

drop schema if exists c2c cascade;
create schema c2c;
set search_path = c2c, public;

-- ---------------------------------------------------------------------------
-- Shared types
-- ---------------------------------------------------------------------------

-- Money is never a float. 2 decimal places for anything a person enters.
create domain money_amount as numeric(14,2);

-- Derived money (a licence share, a fraction of payroll) keeps more precision
-- so that a chain of divisions still adds back to the total.
create domain money_derived as numeric(18,6);

-- A reporting period is the first day of a month. Storing it as a date (not
-- '2026-09') means ordering, ranges and interval arithmetic all work natively.
create domain period_month as date
  check (value = date_trunc('month', value)::date);

create domain percentage as numeric(6,3)
  check (value >= 0 and value <= 100);

-- ---------------------------------------------------------------------------
-- 1. Tenancy, people who log in, and org-level settings
-- ---------------------------------------------------------------------------

-- organizations: one row per firm using the product. Every other table carries
-- org_id so row-level security can be a single policy per table.
create table organizations (
  id                    uuid primary key default gen_random_uuid(),
  name                  text        not null,
  base_currency         char(3)     not null default 'USD',
  fiscal_year_start_mth smallint    not null default 1
                          check (fiscal_year_start_mth between 1 and 12),
  margin_healthy_pct    numeric(5,2) not null default 35.00,   -- band thresholds
  margin_watch_pct      numeric(5,2) not null default 20.00,   -- shown on every screen
  created_at            timestamptz not null default now(),
  constraint org_bands_ordered check (margin_healthy_pct > margin_watch_pct)
);

-- users: an identity. A person may belong to more than one organization.
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         citext      not null unique,
  full_name     text        not null,
  -- bcrypt hash produced by crypt(password, gen_salt('bf')). Never a plain password.
  -- Null means the account cannot sign in with a password yet.
  password_hash text,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz,
  constraint password_hash_is_bcrypt
    check (password_hash is null or password_hash like '$2%')
);

-- memberships: who may do what inside one organization.
--   owner    - everything, including closing and reopening months
--   finance  - enter and amend any figure, close months
--   manager  - allocate people, enter revenue and cost
--   viewer   - read only
create table memberships (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references users(id)         on delete cascade,
  role       text not null check (role in ('owner','finance','manager','viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 3b. Sign in, sessions, sign out
--
-- Passwords are hashed with bcrypt by the database itself (pgcrypto). The
-- plain password is never stored and never leaves the API function.
-- A session is a random token row, so signing out is a real server-side act,
-- not just the browser forgetting something.
-- ---------------------------------------------------------------------------

create table sessions (
  token      text        primary key default encode(gen_random_bytes(32), 'hex'),
  user_id    uuid        not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 hours',
  revoked_at timestamptz,
  user_agent text,
  ip         inet
);

create index on sessions (user_id);
create index on sessions (expires_at);

-- Set or change a password. This is the ONLY supported way to write one.
create or replace function set_password(p_email citext, p_password text)
returns void
language sql
set search_path = c2c, public
as $$
  update users
     set password_hash = crypt(p_password, gen_salt('bf', 12))
   where email = p_email;
$$;

-- Verify an email and password. Returns one row on success, no rows on failure.
-- Callers cannot tell a wrong password from an unknown email, which is the point.
create or replace function authenticate(p_email citext, p_password text)
returns table (user_id uuid, email citext, full_name text, org_id uuid, role text)
language sql
set search_path = c2c, public
as $$
  select u.id, u.email, u.full_name, m.org_id, m.role
    from users u
    join memberships m on m.user_id = u.id
   where u.email = p_email
     and u.is_active
     and u.password_hash is not null
     and u.password_hash = crypt(p_password, u.password_hash);
$$;

-- Sign in: verify, then open a session. Returns the token, or nothing.
create or replace function login(p_email citext, p_password text, p_agent text default null, p_ip inet default null)
returns table (token text, user_id uuid, email citext, full_name text, org_id uuid, role text)
language plpgsql
set search_path = c2c, public
as $$
declare a record; t text;
begin
  select * into a from authenticate(p_email, p_password);
  if not found then return; end if;

  insert into sessions (user_id, user_agent, ip) values (a.user_id, p_agent, p_ip)
  returning sessions.token into t;

  update users set last_login_at = now() where id = a.user_id;

  return query select t, a.user_id, a.email, a.full_name, a.org_id, a.role;
end $$;

-- Who is this token? (session_user is a reserved word in PostgreSQL, hence the name) No rows if it is unknown, expired or signed out.
create or replace function session_lookup(p_token text)
returns table (user_id uuid, email citext, full_name text, org_id uuid, role text)
language sql
set search_path = c2c, public
as $$
  select u.id, u.email, u.full_name, m.org_id, m.role
    from sessions s
    join users u        on u.id = s.user_id
    join memberships m  on m.user_id = u.id
   where s.token = p_token
     and s.revoked_at is null
     and s.expires_at > now()
     and u.is_active;
$$;

-- Sign out. Idempotent: signing out twice is not an error.
create or replace function logout(p_token text) returns void
language sql
set search_path = c2c, public
as $$
  update sessions set revoked_at = now()
   where token = p_token and revoked_at is null;
$$;

-- Housekeeping: drop sessions that expired more than a week ago.
create or replace function purge_sessions() returns integer
language sql
set search_path = c2c, public
as $$
  with gone as (
    delete from sessions where expires_at < now() - interval '7 days' returning 1
  ) select count(*)::int from gone;
$$;

comment on table sessions is 'Live sign-ins. A row is deleted or revoked to end a session; the browser holds only the token.';

-- periods: the month register, and the lock that makes a month a snapshot.
-- A closed month rejects writes to every fact table (see trg_period_open).
create table periods (
  org_id    uuid          not null references organizations(id) on delete cascade,
  period    period_month  not null,
  status    text          not null default 'open'
              check (status in ('open','closed')),
  closed_at timestamptz,
  closed_by uuid references users(id),
  note      text,
  primary key (org_id, period),
  constraint period_closed_has_stamp
    check ((status = 'open' and closed_at is null) or (status = 'closed' and closed_at is not null))
);

-- ---------------------------------------------------------------------------
-- 2. Registers — the things that exist, and the dates they exist between
-- ---------------------------------------------------------------------------

-- clients: who you bill.
create table clients (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null,
  industry     text,
  client_since period_month,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (org_id, id),                      -- lets children key on (org_id, client_id)
  unique (org_id, name)
);

-- projects: a piece of work for one client.
--   is_billable = false marks a cost centre (internal tooling, R&D, pre-sales,
--   a free pilot). It earns no revenue and has no margin; its cost still counts,
--   as internal time and company overhead.
create table projects (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  client_id       uuid not null,
  name            text not null,
  engagement_type text not null default 'fixed_project'
                    check (engagement_type in
                      ('fixed_project','retainer','time_and_materials','milestone')),
  is_billable     boolean     not null default true,
  discipline      text,                        -- used when suggesting who to staff
  starts_on       period_month not null,
  ends_on         period_month,                -- null = still running
  created_at      timestamptz  not null default now(),
  foreign key (org_id, client_id) references clients (org_id, id) on delete restrict,
  unique (org_id, id),
  unique (org_id, client_id, name),
  constraint project_dates_ordered check (ends_on is null or ends_on >= starts_on)
);

-- employees: a person on payroll.
create table employees (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  full_name  text not null,
  job_title  text,
  department text,
  discipline text,
  joined_on  period_month not null,
  left_on    period_month,                     -- null = still employed
  created_at timestamptz not null default now(),
  unique (org_id, id),
  constraint employee_dates_ordered check (left_on is null or left_on >= joined_on)
);

-- employee_compensation: the salary register, one row per change.
-- An amendment applies from its effective month forward; earlier months keep
-- what they closed with. Monthly cost is annual CTC / 12.
create table employee_compensation (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  employee_id    uuid not null,
  effective_from period_month not null,
  annual_ctc     money_amount not null check (annual_ctc >= 0),
  reason         text,                          -- 'joining', 'anniversary raise', ...
  created_at     timestamptz not null default now(),
  created_by     uuid references users(id),
  foreign key (org_id, employee_id) references employees (org_id, id) on delete cascade,
  unique (employee_id, effective_from)
);

-- cost_categories: the buckets on the Costs screen. Seeded per organization so
-- a firm can add its own; 'Software licences' is reserved for derived rows and
-- is never entered by hand.
create table cost_categories (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  is_derived  boolean not null default false,
  sort_order  smallint not null default 100,
  unique (org_id, id),
  unique (org_id, name)
);

-- software_licences: a purchase, not a monthly bill. Price and term are facts
-- about the purchase; the monthly charge is derived from them, so editing a
-- licence correctly restates every month it covers.
create table software_licences (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  name           text not null,
  vendor         text,
  total_price    money_amount not null check (total_price >= 0),
  starts_on      period_month not null,
  term_months    smallint     not null check (term_months >= 1),
  note           text,
  created_at     timestamptz  not null default now(),
  -- kept at high precision: 12 x monthly_charge must add back to total_price
  monthly_charge money_derived generated always as (total_price / term_months) stored,
  unique (org_id, id)
);

-- ---------------------------------------------------------------------------
-- 3. Period facts — one month, frozen
-- ---------------------------------------------------------------------------

-- project_revenue: one figure per project per month. This is the whole revenue
-- model; there is no invoice or line-item layer.
create table project_revenue (
  org_id     uuid         not null,
  period     period_month not null,
  project_id uuid         not null,
  amount     money_amount not null check (amount >= 0),
  updated_at timestamptz  not null default now(),
  updated_by uuid references users(id),
  primary key (org_id, period, project_id),
  foreign key (org_id, period)     references periods  (org_id, period) on delete cascade,
  foreign key (org_id, project_id) references projects (org_id, id)     on delete cascade
);

-- employee_period_costs: payroll frozen for the month. Written when the month
-- is first touched, from whichever compensation row was effective then, so a
-- later raise cannot rewrite history.
create table employee_period_costs (
  org_id       uuid         not null,
  period       period_month not null,
  employee_id  uuid         not null,
  annual_ctc   money_amount not null check (annual_ctc >= 0),
  monthly_cost money_derived generated always as (annual_ctc / 12) stored,
  primary key (org_id, period, employee_id),
  foreign key (org_id, period)      references periods   (org_id, period) on delete cascade,
  foreign key (org_id, employee_id) references employees (org_id, id)     on delete cascade
);

-- allocations: how a person's month is split.
--   project_id not null -> time on that project
--   project_id is null  -> internal, non-billable time
-- Whatever is left of 100% is the bench, and is not stored.
create table allocations (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid         not null,
  period         period_month not null,
  employee_id    uuid         not null,
  project_id     uuid,
  allocation_pct percentage   not null check (allocation_pct > 0),
  updated_at     timestamptz  not null default now(),
  updated_by     uuid references users(id),
  foreign key (org_id, period)      references periods   (org_id, period) on delete cascade,
  foreign key (org_id, employee_id) references employees (org_id, id)     on delete cascade,
  foreign key (org_id, project_id)  references projects  (org_id, id)     on delete cascade
);

-- one row per person per project per month …
create unique index allocations_project_uq
  on allocations (org_id, period, employee_id, project_id)
  where project_id is not null;
-- … and at most one internal row per person per month
create unique index allocations_internal_uq
  on allocations (org_id, period, employee_id)
  where project_id is null;

-- other_costs: everything that is not payroll and not a licence — cloud,
-- contractors, travel. A null project_id is company overhead.
create table other_costs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid         not null,
  period      period_month not null,
  project_id  uuid,
  category_id uuid         not null,
  amount      money_amount not null check (amount >= 0),
  description text,
  created_at  timestamptz  not null default now(),
  created_by  uuid references users(id),
  foreign key (org_id, period)      references periods         (org_id, period) on delete cascade,
  foreign key (org_id, project_id)  references projects        (org_id, id)     on delete cascade,
  foreign key (org_id, category_id) references cost_categories (org_id, id)     on delete restrict
);

-- audit_log: who changed which figure, when, and what it was before. The
-- product has no undo without this table.
create table audit_log (
  id           bigint generated always as identity primary key,
  org_id       uuid        not null references organizations(id) on delete cascade,
  actor_id     uuid        references users(id),
  occurred_at  timestamptz not null default now(),
  entity_table text        not null,
  entity_id    text        not null,
  period       period_month,
  action       text        not null check (action in ('insert','update','delete')),
  before       jsonb,
  after        jsonb
);

-- ---------------------------------------------------------------------------
-- 4. Rules the database enforces itself
-- ---------------------------------------------------------------------------

-- A person's month can never add up to more than 100%. This is a cross-row
-- rule, so a CHECK cannot express it: it needs a trigger.
create or replace function assert_allocation_within_capacity() returns trigger
language plpgsql
set search_path = c2c, public
as $$
declare total numeric;
begin
  select coalesce(sum(allocation_pct), 0) into total
    from allocations
   where org_id = new.org_id and period = new.period and employee_id = new.employee_id
     and id <> new.id;
  if total + new.allocation_pct > 100.0001 then
    raise exception
      'Allocation for employee % in % would total %%%, which is over 100%%',
      new.employee_id, to_char(new.period,'Mon YYYY'), round(total + new.allocation_pct, 2);
  end if;
  return new;
end $$;

create trigger trg_allocation_capacity
  before insert or update on allocations
  for each row execute function assert_allocation_within_capacity();

-- A closed month is read only. One function guards every fact table.
create or replace function assert_period_open() returns trigger
language plpgsql
set search_path = c2c, public
as $$
declare p period_month; o uuid; st text;
begin
  if tg_op = 'DELETE' then o := old.org_id; p := old.period;
  else                     o := new.org_id; p := new.period;
  end if;
  select status into st from periods where org_id = o and period = p;
  if st = 'closed' then
    raise exception '% is closed. Reopen it before changing %.', to_char(p,'Mon YYYY'), tg_table_name;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- Closing and reopening a month is a status flip; the stamp looks after itself,
-- so the check constraint above can never be tripped by ordinary use.
create or replace function stamp_period_close() returns trigger
language plpgsql
set search_path = c2c, public
as $$
begin
  if new.status = 'closed' and coalesce(old.status,'open') <> 'closed' then
    new.closed_at := coalesce(new.closed_at, now());
  elsif new.status = 'open' then
    new.closed_at := null;
    new.closed_by := null;
  end if;
  return new;
end $$;

create trigger trg_period_close_stamp before insert or update on periods
  for each row execute function stamp_period_close();

create trigger trg_revenue_period_open   before insert or update or delete on project_revenue
  for each row execute function assert_period_open();
create trigger trg_payroll_period_open   before insert or update or delete on employee_period_costs
  for each row execute function assert_period_open();
create trigger trg_alloc_period_open     before insert or update or delete on allocations
  for each row execute function assert_period_open();
create trigger trg_othercost_period_open before insert or update or delete on other_costs
  for each row execute function assert_period_open();

-- ---------------------------------------------------------------------------
-- 5. Indexes for the queries the product actually runs
-- ---------------------------------------------------------------------------

create index on projects              (org_id, client_id);
create index on projects              (org_id, starts_on, ends_on);
create index on employees             (org_id, joined_on, left_on);
create index on employee_compensation (org_id, employee_id, effective_from desc);
create index on allocations           (org_id, period, project_id);
create index on allocations           (org_id, employee_id, period);
create index on other_costs           (org_id, period, project_id);
create index on other_costs           (org_id, period, category_id);
create index on software_licences     (org_id, starts_on);
create index on audit_log             (org_id, occurred_at desc);
create index on audit_log             (org_id, entity_table, entity_id);

-- ---------------------------------------------------------------------------
-- 6. Reporting views — every figure the product shows, derived from the facts
-- ---------------------------------------------------------------------------

-- Every month a licence is live, with the charge that month carries.
create view v_licence_periods as
select l.org_id,
       l.id   as licence_id,
       l.name as licence_name,
       gs::date as period,
       l.monthly_charge
  from software_licences l
  cross join lateral generate_series(
         l.starts_on,
         (l.starts_on + make_interval(months => l.term_months - 1))::date,
         interval '1 month') as gs;

-- Headcount and the total licence bill, per month.
create view v_period_totals as
select p.org_id, p.period,
       (select count(*) from employee_period_costs e
         where e.org_id = p.org_id and e.period = p.period)          as headcount,
       coalesce((select sum(monthly_charge) from v_licence_periods l
                  where l.org_id = p.org_id and l.period = p.period), 0)::money_derived
                                                                     as licence_cost
  from periods p;

-- Each person carries an equal share of every live licence. Their share then
-- follows their allocation: time on a project puts that slice on the project,
-- internal time and bench leave it in company overhead.
create view v_employee_month as
select epc.org_id,
       epc.period,
       epc.employee_id,
       epc.annual_ctc,
       epc.monthly_cost,
       case when t.headcount > 0 then t.licence_cost / t.headcount else 0 end   as licence_share,
       epc.monthly_cost
         + case when t.headcount > 0 then t.licence_cost / t.headcount else 0 end as loaded_cost,
       coalesce(a.total_pct, 0)                                                 as allocated_pct,
       coalesce(a.project_pct, 0)                                               as project_pct,
       coalesce(a.billable_pct, 0)                                              as billable_pct,
       coalesce(a.internal_pct, 0)                                              as internal_pct,
       100 - coalesce(a.total_pct, 0)                                           as bench_pct,
       epc.monthly_cost * coalesce(a.billable_pct, 0) / 100                     as billable_cost,
       epc.monthly_cost * (coalesce(a.total_pct,0) - coalesce(a.billable_pct,0)) / 100
                                                                                as internal_cost,
       epc.monthly_cost * (100 - coalesce(a.total_pct, 0)) / 100                as bench_cost
  from employee_period_costs epc
  join v_period_totals t
    on t.org_id = epc.org_id and t.period = epc.period
  left join lateral (
       select sum(al.allocation_pct)                                       as total_pct,
              sum(al.allocation_pct) filter (where al.project_id is not null) as project_pct,
              sum(al.allocation_pct) filter (where pr.is_billable)            as billable_pct,
              sum(al.allocation_pct) filter (where al.project_id is null)     as internal_pct
         from allocations al
         left join projects pr on pr.id = al.project_id
        where al.org_id = epc.org_id and al.period = epc.period
          and al.employee_id = epc.employee_id
  ) a on true;

-- The software each project carries: every allocated person's licence share,
-- in proportion to the time they gave that project.
create view v_project_licence_cost as
select al.org_id, al.period, al.project_id,
       sum(em.licence_share * al.allocation_pct / 100)::money_derived as licence_cost
  from allocations al
  join v_employee_month em
    on em.org_id = al.org_id and em.period = al.period and em.employee_id = al.employee_id
 where al.project_id is not null
 group by al.org_id, al.period, al.project_id;

-- One row per project per month: the ladder the product shows everywhere.
create view v_project_month as
select pr.org_id,
       per.period,
       pr.id                      as project_id,
       pr.client_id,
       pr.name                    as project_name,
       pr.is_billable,
       case when pr.is_billable then coalesce(rev.amount, 0) else 0 end          as revenue,
       coalesce(emp.employee_cost, 0)                                            as employee_cost,
       case when pr.is_billable then coalesce(rev.amount, 0) else 0 end
         - coalesce(emp.employee_cost, 0)                                        as contribution_after_people,
       coalesce(oc.booked_cost, 0) + coalesce(lic.licence_cost, 0)               as other_cost,
       coalesce(emp.employee_cost, 0) + coalesce(oc.booked_cost, 0)
         + coalesce(lic.licence_cost, 0)                                         as total_cost,
       case when pr.is_billable then coalesce(rev.amount, 0) else 0 end
         - coalesce(emp.employee_cost, 0) - coalesce(oc.booked_cost, 0)
         - coalesce(lic.licence_cost, 0)                                         as profit
  from projects pr
  join periods per
    on per.org_id = pr.org_id
   and per.period >= pr.starts_on
   and (pr.ends_on is null or per.period <= pr.ends_on)
  left join project_revenue rev
    on rev.org_id = pr.org_id and rev.period = per.period and rev.project_id = pr.id
  left join lateral (
       select sum(em.monthly_cost * al.allocation_pct / 100) as employee_cost
         from allocations al
         join v_employee_month em
           on em.org_id = al.org_id and em.period = al.period and em.employee_id = al.employee_id
        where al.org_id = pr.org_id and al.period = per.period and al.project_id = pr.id
  ) emp on true
  left join lateral (
       select sum(o.amount) as booked_cost
         from other_costs o
        where o.org_id = pr.org_id and o.period = per.period and o.project_id = pr.id
  ) oc on true
  left join v_project_licence_cost lic
    on lic.org_id = pr.org_id and lic.period = per.period and lic.project_id = pr.id;

-- Client roll-up: the same columns, summed over that client's projects.
create view v_client_month as
select org_id, period, client_id,
       sum(revenue)                   as revenue,
       sum(employee_cost)             as employee_cost,
       sum(contribution_after_people) as contribution_after_people,
       sum(other_cost)                as other_cost,
       sum(total_cost)                as total_cost,
       sum(profit)                    as profit
  from v_project_month
 group by org_id, period, client_id;

-- Company roll-up. Note the difference from summing projects: company employee
-- cost is ALL payroll (including bench and internal time), and company other
-- cost includes overhead that never reached a project. That gap is the
-- utilisation story, not an error.
create view v_company_month as
select p.org_id,
       p.period,
       coalesce(rv.revenue, 0)                                          as revenue,
       coalesce(pay.payroll, 0)                                         as employee_cost,
       coalesce(rv.revenue, 0) - coalesce(pay.payroll, 0)               as contribution_after_people,
       coalesce(oc.booked, 0) + t.licence_cost                          as other_cost,
       coalesce(pay.payroll, 0) + coalesce(oc.booked, 0) + t.licence_cost as total_cost,
       coalesce(rv.revenue, 0) - coalesce(pay.payroll, 0)
         - coalesce(oc.booked, 0) - t.licence_cost                      as profit,
       coalesce(pay.billable_cost, 0)                                   as billable_employee_cost,
       coalesce(pay.internal_cost, 0)                                   as internal_employee_cost,
       coalesce(pay.bench_cost, 0)                                      as bench_employee_cost,
       t.headcount,
       t.licence_cost
  from periods p
  join v_period_totals t on t.org_id = p.org_id and t.period = p.period
  left join lateral (
       select sum(revenue) as revenue from v_project_month vp
        where vp.org_id = p.org_id and vp.period = p.period
  ) rv on true
  left join lateral (
       select sum(monthly_cost)  as payroll,
              sum(billable_cost) as billable_cost,
              sum(internal_cost) as internal_cost,
              sum(bench_cost)    as bench_cost
         from v_employee_month em
        where em.org_id = p.org_id and em.period = p.period
  ) pay on true
  left join lateral (
       select sum(amount) as booked from other_costs o
        where o.org_id = p.org_id and o.period = p.period
  ) oc on true;

comment on view  v_company_month is 'One row per month: the dashboard numbers, derived only from period facts.';
comment on table periods         is 'The month register. status = closed makes every fact table read only for that month.';
comment on table allocations     is 'project_id null means internal, non-billable time. Unallocated capacity is the bench and is not stored.';
