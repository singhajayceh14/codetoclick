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
