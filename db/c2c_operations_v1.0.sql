-- ============================================================================
-- Code to Click — write operations
--
-- Every change the app can make is ONE function call here. Two reasons:
--
--   1. Atomicity. A change like "add an employee" touches two tables. As a
--      function it is one statement to PostgreSQL, so it either happens or it
--      does not. Doing it as separate calls from the API allowed a half-written
--      employee - a person with no pay record - which is exactly what we hit.
--   2. The rules live with the data. The 100% allocation cap and the closed
--      month lock are enforced by triggers; these functions sit inside that
--      protection rather than trying to re-check it in JavaScript.
--
-- Run after c2c_schema_v1.2.sql.
-- ============================================================================

set search_path = c2c, public;

-- Look up a register row by the short code the app uses, or say so plainly.
create or replace function code_id(p_table text, p_org uuid, p_code text)
returns uuid language plpgsql
set search_path = c2c, public
as $$
declare v uuid;
begin
  if p_code is null then return null; end if;
  case p_table
    when 'clients'   then select id into v from clients   where org_id = p_org and code = p_code;
    when 'projects'  then select id into v from projects  where org_id = p_org and code = p_code;
    when 'employees' then select id into v from employees where org_id = p_org and code = p_code;
    when 'licences'  then select id into v from software_licences where org_id = p_org and code = p_code;
    else raise exception 'Unknown register %', p_table;
  end case;
  if v is null then raise exception 'There is no % with id %', p_table, p_code; end if;
  return v;
end $$;

-- A fact can only be recorded against a month that exists in the register.
create or replace function ensure_period(p_org uuid, p_period period_month)
returns void language sql
set search_path = c2c, public
as $$
  insert into periods (org_id, period) values (p_org, p_period) on conflict do nothing;
$$;

-- ---------------------------------------------------------------------------
-- Registers
-- ---------------------------------------------------------------------------

create or replace function op_add_client(p_org uuid, p_code text, p_name text,
                                         p_industry text, p_since period_month)
returns void language sql
set search_path = c2c, public
as $$
  insert into clients (org_id, code, name, industry, client_since)
  values (p_org, p_code, p_name, p_industry, p_since);
$$;

create or replace function op_update_client(p_org uuid, p_code text, p_name text, p_industry text)
returns void language sql
set search_path = c2c, public
as $$
  update clients set name = coalesce(p_name, name), industry = coalesce(p_industry, industry)
   where org_id = p_org and code = p_code;
$$;

create or replace function op_delete_client(p_org uuid, p_code text)
returns void language sql
set search_path = c2c, public
as $$
  delete from clients where org_id = p_org and code = p_code;
$$;

create or replace function op_add_project(p_org uuid, p_code text, p_client text, p_name text,
                                          p_type text, p_billable boolean, p_disc text,
                                          p_starts period_month, p_ends period_month)
returns void language plpgsql
set search_path = c2c, public
as $$
begin
  insert into projects (org_id, code, client_id, name, engagement_type, is_billable,
                        discipline, starts_on, ends_on)
  values (p_org, p_code, code_id('clients', p_org, p_client), p_name,
          coalesce(p_type, 'fixed_project'), coalesce(p_billable, true),
          p_disc, p_starts, p_ends);
end $$;

-- p_set_ends distinguishes "clear the end date" from "leave it alone", which a
-- null on its own cannot say.
create or replace function op_update_project(p_org uuid, p_code text, p_name text,
                                             p_billable boolean, p_ends period_month,
                                             p_set_ends boolean default false)
returns void language sql
set search_path = c2c, public
as $$
  update projects set
      name        = coalesce(p_name, name),
      is_billable = coalesce(p_billable, is_billable),
      ends_on     = case when p_set_ends then p_ends else ends_on end
   where org_id = p_org and code = p_code;
$$;

create or replace function op_delete_project(p_org uuid, p_code text)
returns void language sql
set search_path = c2c, public
as $$
  delete from projects where org_id = p_org and code = p_code;
$$;

-- Person and pay together, or neither.
create or replace function op_add_employee(p_org uuid, p_code text, p_name text, p_title text,
                                           p_dept text, p_disc text, p_joined period_month,
                                           p_ctc money_amount)
returns void language plpgsql
set search_path = c2c, public
as $$
declare e uuid;
begin
  insert into employees (org_id, code, full_name, job_title, department, discipline, joined_on)
  values (p_org, p_code, p_name, p_title, p_dept, p_disc, p_joined)
  returning id into e;

  insert into employee_compensation (org_id, employee_id, effective_from, annual_ctc)
  values (p_org, e, p_joined, coalesce(p_ctc, 0));
end $$;

create or replace function op_update_employee(p_org uuid, p_code text, p_name text,
                                              p_title text, p_dept text)
returns void language sql
set search_path = c2c, public
as $$
  update employees set full_name = coalesce(p_name, full_name),
                       job_title = coalesce(p_title, job_title),
                       department = coalesce(p_dept, department)
   where org_id = p_org and code = p_code;
$$;

create or replace function op_delete_employee(p_org uuid, p_code text)
returns void language sql
set search_path = c2c, public
as $$
  delete from employees where org_id = p_org and code = p_code;
$$;

create or replace function op_add_licence(p_org uuid, p_code text, p_name text, p_vendor text,
                                          p_price money_amount, p_starts period_month,
                                          p_months smallint, p_note text)
returns void language sql
set search_path = c2c, public
as $$
  insert into software_licences (org_id, code, name, vendor, total_price, starts_on, term_months, note)
  values (p_org, p_code, p_name, p_vendor, coalesce(p_price, 0), p_starts,
          greatest(1, coalesce(p_months, 1)), p_note);
$$;

create or replace function op_update_licence(p_org uuid, p_code text, p_name text, p_vendor text,
                                             p_price money_amount, p_starts period_month,
                                             p_months smallint, p_note text)
returns void language sql
set search_path = c2c, public
as $$
  update software_licences set
      name        = coalesce(p_name, name),
      vendor      = coalesce(p_vendor, vendor),
      total_price = coalesce(p_price, total_price),
      starts_on   = coalesce(p_starts, starts_on),
      term_months = coalesce(p_months, term_months),
      note        = coalesce(p_note, note)
   where org_id = p_org and code = p_code;
$$;

create or replace function op_delete_licence(p_org uuid, p_code text)
returns void language sql
set search_path = c2c, public
as $$
  delete from software_licences where org_id = p_org and code = p_code;
$$;

-- ---------------------------------------------------------------------------
-- Month facts
-- ---------------------------------------------------------------------------

-- Zero means "no revenue recorded", so the row goes rather than storing a nil.
create or replace function op_set_revenue(p_org uuid, p_period period_month,
                                          p_project text, p_amount money_amount)
returns void language plpgsql
set search_path = c2c, public
as $$
declare pid uuid;
begin
  perform ensure_period(p_org, p_period);
  pid := code_id('projects', p_org, p_project);
  if coalesce(p_amount, 0) = 0 then
    delete from project_revenue where org_id = p_org and period = p_period and project_id = pid;
  else
    insert into project_revenue (org_id, period, project_id, amount)
    values (p_org, p_period, pid, p_amount)
    on conflict (org_id, period, project_id) do update set amount = excluded.amount;
  end if;
end $$;

create or replace function op_set_emp_cost(p_org uuid, p_period period_month,
                                           p_employee text, p_monthly money_derived)
returns void language plpgsql
set search_path = c2c, public
as $$
declare eid uuid;
begin
  perform ensure_period(p_org, p_period);
  eid := code_id('employees', p_org, p_employee);
  insert into employee_period_costs (org_id, period, employee_id, annual_ctc)
  values (p_org, p_period, eid, round(coalesce(p_monthly, 0) * 12, 2))
  on conflict (org_id, period, employee_id) do update set annual_ctc = excluded.annual_ctc;
end $$;

-- One person's whole month, replaced as a unit. The app edits allocation that
-- way, and doing it in one statement means the 100% trigger sees the finished
-- picture rather than a half-applied one.
create or replace function op_set_allocation(p_org uuid, p_period period_month,
                                             p_employee text, p_map jsonb)
returns void language plpgsql
set search_path = c2c, public
as $$
declare eid uuid; k text; v numeric;
begin
  perform ensure_period(p_org, p_period);
  eid := code_id('employees', p_org, p_employee);
  delete from allocations where org_id = p_org and period = p_period and employee_id = eid;
  for k, v in select key, value::text::numeric from jsonb_each(coalesce(p_map, '{}'::jsonb)) loop
    if v > 0 then
      insert into allocations (org_id, period, employee_id, project_id, allocation_pct)
      values (p_org, p_period, eid,
              case when k = 'INTERNAL' then null else code_id('projects', p_org, k) end, v);
    end if;
  end loop;
end $$;

create or replace function op_add_cost(p_org uuid, p_period period_month, p_project text,
                                       p_category text, p_amount money_amount, p_note text)
returns void language plpgsql
set search_path = c2c, public
as $$
declare cid uuid;
begin
  perform ensure_period(p_org, p_period);
  insert into cost_categories (org_id, name) values (p_org, coalesce(p_category, 'Other'))
    on conflict do nothing;
  select id into cid from cost_categories where org_id = p_org and name = coalesce(p_category, 'Other');
  insert into other_costs (org_id, period, category_id, project_id, amount, description)
  values (p_org, p_period, cid, code_id('projects', p_org, p_project), coalesce(p_amount, 0), p_note);
end $$;

create or replace function op_set_fiscal_start(p_org uuid, p_month int)
returns void language sql
set search_path = c2c, public
as $$
  update organizations set fiscal_year_start_mth = least(12, greatest(1, p_month)) where id = p_org;
$$;

create or replace function op_close_period(p_org uuid, p_period period_month, p_close boolean)
returns void language plpgsql
set search_path = c2c, public
as $$
begin
  perform ensure_period(p_org, p_period);
  update periods set status = case when p_close then 'closed' else 'open' end
   where org_id = p_org and period = p_period;
end $$;

-- ---------------------------------------------------------------------------
-- Restore a whole organization from a backup file
-- ---------------------------------------------------------------------------
--
-- The one place in this system that deliberately writes through a closed month.
--
-- Rule 2 says a closed month is immutable, and the trg_*_period_open triggers
-- enforce it. A restore has to break that: after a disaster every month you
-- care about is closed, and a backup you cannot put back is not a backup. So
-- this function reopens every period, rewrites the org, and then re-closes
-- exactly the months the backup says were closed.
--
-- That is safe here and nowhere else, because it is one function, so it is one
-- transaction. If any part fails - a bad allocation, a missing client - the
-- whole thing rolls back and the months close again with it. There is no state
-- in which the periods are left open by a half-finished restore.
--
-- It rebuilds through the ordinary op_* functions rather than inserting
-- directly, so a restored row goes through exactly the same rules, triggers and
-- coercions as one typed into the app. If the two ever drift apart, that is a
-- bug in this function, not a feature of it.

-- 'YYYY-MM' -> the first of that month. Backups speak in month keys.
create or replace function mth(p text) returns period_month
language sql immutable
set search_path = c2c, public
as $$ select (nullif(p, '') || '-01')::date; $$;

create or replace function op_restore_snapshot(p_org uuid, p_snap jsonb)
returns void language plpgsql
set search_path = c2c, public
as $$
declare
  rec jsonb; mrec jsonb; m text; ecode text; amap jsonb; pcode text; amt text;
begin
  if coalesce(p_snap->>'format', '') <> 'codetoclick-profitability-backup' then
    raise exception 'That file is not a Code to Click backup.';
  end if;

  -- 1. Unlock. Deliberate, and explained at the top of this block.
  update periods set status = 'open' where org_id = p_org and status = 'closed';

  -- 2. Clear this organization. Facts first, then registers: projects reference
  --    clients with on delete restrict, so the order is not arbitrary.
  --    cost_categories survive - they are a register op_add_cost fills on
  --    demand, and other_costs references them with on delete restrict.
  delete from allocations           where org_id = p_org;
  delete from other_costs           where org_id = p_org;
  delete from project_revenue       where org_id = p_org;
  delete from employee_period_costs where org_id = p_org;
  delete from employee_compensation where org_id = p_org;
  delete from software_licences     where org_id = p_org;
  delete from projects              where org_id = p_org;
  delete from clients               where org_id = p_org;
  delete from periods               where org_id = p_org;

  -- 3. The month register, all open for now.
  for m in select jsonb_array_elements_text(coalesce(p_snap->'months', '[]'::jsonb)) loop
    perform ensure_period(p_org, mth(m));
  end loop;

  -- 4. Registers. Clients before projects; employees before any allocation.
  for rec in select jsonb_array_elements(coalesce(p_snap->'clients', '[]'::jsonb)) loop
    perform op_add_client(p_org, rec->>'id', rec->>'name', rec->>'industry', mth(rec->>'since'));
  end loop;

  for rec in select jsonb_array_elements(coalesce(p_snap->'projects', '[]'::jsonb)) loop
    perform op_add_project(p_org, rec->>'id', rec->>'clientId', rec->>'name',
                           rec->>'type', coalesce((rec->>'billable')::boolean, true),
                           rec->>'disc', mth(rec->>'start'), mth(rec->>'end'));
  end loop;

  for rec in select jsonb_array_elements(coalesce(p_snap->'employees', '[]'::jsonb)) loop
    perform op_add_employee(p_org, rec->>'id', rec->>'name', rec->>'title', rec->>'dept',
                            rec->>'disc', mth(rec->>'join'),
                            coalesce((rec->>'baseCtc')::numeric, 0)::money_amount);
    -- op_add_employee has no leaving date - it only ever adds a joiner. Without
    -- this, restoring a backup would bring every leaver back onto the payroll
    -- and their licence share with them.
    if rec->>'left' is not null then
      update employees set left_on = mth(rec->>'left')
       where org_id = p_org and code = rec->>'id';
    end if;
  end loop;

  for rec in select jsonb_array_elements(coalesce(p_snap->'licences', '[]'::jsonb)) loop
    perform op_add_licence(p_org, rec->>'id', rec->>'name', rec->>'vendor',
                           coalesce((rec->>'price')::numeric, 0)::money_amount,
                           mth(rec->>'start'),
                           greatest(1, coalesce((rec->>'months')::int, 1))::smallint,
                           rec->>'note');
  end loop;

  -- 5. The monthly ledger.
  for m, mrec in select key, value from jsonb_each(coalesce(p_snap->'ledger', '{}'::jsonb)) loop

    for pcode, amt in select key, value#>>'{}' from jsonb_each(coalesce(mrec->'revenue', '{}'::jsonb)) loop
      perform op_set_revenue(p_org, mth(m), pcode, coalesce(amt::numeric, 0)::money_amount);
    end loop;

    for ecode, amt in select key, value#>>'{}' from jsonb_each(coalesce(mrec->'empCost', '{}'::jsonb)) loop
      perform op_set_emp_cost(p_org, mth(m), ecode, coalesce(amt::numeric, 0)::money_derived);
    end loop;

    -- op_set_allocation replaces a person's whole month at once, so the 100%
    -- trigger sees the finished picture rather than a half-applied one.
    for ecode, amap in select key, value from jsonb_each(coalesce(mrec->'alloc', '{}'::jsonb)) loop
      perform op_set_allocation(p_org, mth(m), ecode, amap);
    end loop;

    for rec in select jsonb_array_elements(coalesce(mrec->'other', '[]'::jsonb)) loop
      perform op_add_cost(p_org, mth(m), rec->>'projectId', coalesce(rec->>'category', 'Other'),
                          coalesce((rec->>'amount')::numeric, 0)::money_amount, null);
    end loop;

  end loop;

  -- 6. Re-lock the months the backup says were closed. A v1 backup carries no
  --    period statuses, so everything stays open - which is the honest answer
  --    for a file written before the app recorded them.
  for rec in select jsonb_array_elements(coalesce(p_snap->'periods', '[]'::jsonb)) loop
    if rec->>'status' = 'closed' then
      update periods set status = 'closed'
       where org_id = p_org and period = mth(rec->>'month');
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Passwords
-- ---------------------------------------------------------------------------
--
-- set_password() above takes a bare email and reaches any user in the database.
-- That is right for a hand-run SQL statement and wrong for anything the API can
-- call, because memberships are what scope a user to an organization. These two
-- operations are the API's way in, and both are scoped.

-- One place for the rule, so the check and the message cannot drift apart.
create or replace function assert_password_ok(p_new text) returns void
language plpgsql
set search_path = c2c, public
as $$
begin
  if p_new is null or length(p_new) < 10 then
    raise exception 'A password must be at least 10 characters.';
  end if;
end $$;

-- Change your own. Knowing the current password is required: a stolen session
-- should not be enough to take an account permanently.
create or replace function op_set_own_password(p_org uuid, p_actor uuid, p_token text,
                                               p_current text, p_new text)
returns void language plpgsql
set search_path = c2c, public
as $$
declare em citext;
begin
  perform assert_password_ok(p_new);

  if not exists (select 1 from memberships where org_id = p_org and user_id = p_actor) then
    raise exception 'That account is not in this organization.';
  end if;

  select email into em from users where id = p_actor;
  if em is null then raise exception 'That account no longer exists.'; end if;

  if not exists (select 1 from authenticate(em, p_current)) then
    raise exception 'Your current password is not correct.';
  end if;

  update users set password_hash = crypt(p_new, gen_salt('bf', 12)) where id = p_actor;

  -- Every other sign-in for this person ends now. The tab making the change
  -- keeps its session, so changing your password does not sign you out.
  update sessions set revoked_at = now()
   where user_id = p_actor and revoked_at is null and token is distinct from p_token;
end $$;

-- Reset someone else's. Owner only - finance handles every figure but not
-- identity, because taking over an owner account is not a finance operation.
create or replace function op_admin_set_password(p_org uuid, p_actor uuid,
                                                 p_email citext, p_new text)
returns void language plpgsql
set search_path = c2c, public
as $$
declare tgt uuid; actor_role text;
begin
  perform assert_password_ok(p_new);

  select role into actor_role from memberships where org_id = p_org and user_id = p_actor;
  if actor_role is distinct from 'owner' then
    raise exception 'Only an owner can reset another account''s password.';
  end if;

  select u.id into tgt
    from users u
    join memberships m on m.user_id = u.id
   where m.org_id = p_org and u.email = p_email;
  if tgt is null then
    raise exception 'There is no account % in this organization.', p_email;
  end if;

  if tgt = p_actor then
    raise exception 'Use the change-my-password form for your own account, so you stay signed in.';
  end if;

  update users set password_hash = crypt(p_new, gen_salt('bf', 12)) where id = tgt;

  -- A reset is usually the answer to a password that leaked, so everything
  -- signed in as that person stops now - including whoever it is protecting
  -- against. Leaving those sessions alive would make the reset cosmetic.
  update sessions set revoked_at = now() where user_id = tgt and revoked_at is null;

  -- Without this the lockout counter can keep them out with their new password.
  delete from login_attempts where email = p_email;
end $$;

-- ---------------------------------------------------------------------------
-- Amend someone's pay
-- ---------------------------------------------------------------------------
--
-- op_add_employee writes the first employee_compensation row and nothing ever
-- wrote a second one, so a raise could not be recorded. The app was already
-- restating employee_period_costs month by month through op_set_emp_cost, which
-- meant the monthly figures moved while the salary register did not - and the
-- headline CTC reverted to the joining figure on the next page load.
--
-- The register is one row per change, applying from its month forward. Earlier
-- months keep whatever they closed with, which is rule 2 and the reason this
-- amends rather than overwrites.
create or replace function op_set_employee_ctc(p_org uuid, p_code text,
                                               p_ctc money_amount, p_from period_month)
returns void language plpgsql
set search_path = c2c, public
as $$
declare eid uuid; joined period_month;
begin
  if p_ctc is null or p_ctc < 0 then
    raise exception 'A CTC cannot be negative.';
  end if;

  eid := code_id('employees', p_org, p_code);
  select joined_on into joined from employees where id = eid;
  if p_from < joined then
    raise exception 'That is before % joined. A raise cannot start earlier than the joining month.',
      to_char(joined, 'Mon YYYY');
  end if;

  insert into employee_compensation (org_id, employee_id, effective_from, annual_ctc, reason)
  values (p_org, eid, p_from, p_ctc, 'amendment')
  on conflict (employee_id, effective_from)
    do update set annual_ctc = excluded.annual_ctc, reason = 'amendment';
end $$;
