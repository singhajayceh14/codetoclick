-- ============================================================================
-- Audit trail
--
-- audit_log has existed since the v1.3 schema and nothing ever wrote to it, so
-- the product could say what a figure IS for a month but never who changed it,
-- or when, or what it was before.
--
-- The logging is in triggers rather than inside the op_* functions, for two
-- reasons. A new operation cannot ship without an audit row, because it does
-- not have to remember to write one. And a change made by hand in the Neon SQL
-- editor is recorded too - with a null actor, which is honest rather than
-- wrong.
--
-- The actor comes from a transaction-local setting the API puts in place
-- alongside the operation; see OPS in lib/state.js. Nothing outside a request
-- sets it, so hand-run SQL logs as null.
-- ============================================================================

set search_path = c2c, public;

-- Null unless the API set it for this transaction.
create or replace function audit_actor() returns uuid
language sql stable
set search_path = c2c, public
as $$ select nullif(current_setting('c2c.actor', true), '')::uuid $$;

create or replace function audit_row() returns trigger
language plpgsql
set search_path = c2c, public
as $$
declare
  v_org uuid; v_before jsonb; v_after jsonb; v_row jsonb; v_period period_month;
begin
  if tg_op = 'DELETE' then
    v_org := old.org_id; v_before := to_jsonb(old);
  else
    v_org := new.org_id; v_after := to_jsonb(new);
    if tg_op = 'UPDATE' then v_before := to_jsonb(old); end if;
  end if;

  -- A save that changed nothing is noise in a trail people have to read.
  if tg_op = 'UPDATE' and v_before is not distinct from v_after then
    return null;
  end if;

  v_row := coalesce(v_after, v_before);

  -- period facts carry the month; employee_compensation calls it effective_from
  begin
    v_period := coalesce(v_row->>'period', v_row->>'effective_from')::date;
  exception when others then
    v_period := null;
  end;

  insert into audit_log (org_id, actor_id, entity_table, entity_id, period, action, before, after)
  values (
    v_org,
    audit_actor(),
    tg_table_name,
    coalesce(v_row->>'id', v_row->>'employee_id', v_row->>'project_id',
             v_row->>'code', v_row->>'period', '?'),
    v_period,
    lower(tg_op),
    v_before,
    v_after
  );
  return null;                       -- after trigger: the return is ignored
end $$;

-- The figures ------------------------------------------------------------
drop trigger if exists trg_audit_alloc      on allocations;
drop trigger if exists trg_audit_revenue    on project_revenue;
drop trigger if exists trg_audit_payroll    on employee_period_costs;
drop trigger if exists trg_audit_othercost  on other_costs;
drop trigger if exists trg_audit_comp       on employee_compensation;
drop trigger if exists trg_audit_periods    on periods;

create trigger trg_audit_alloc     after insert or update or delete on allocations
  for each row execute function audit_row();
create trigger trg_audit_revenue   after insert or update or delete on project_revenue
  for each row execute function audit_row();
create trigger trg_audit_payroll   after insert or update or delete on employee_period_costs
  for each row execute function audit_row();
create trigger trg_audit_othercost after insert or update or delete on other_costs
  for each row execute function audit_row();
create trigger trg_audit_comp      after insert or update or delete on employee_compensation
  for each row execute function audit_row();
create trigger trg_audit_periods   after insert or update or delete on periods
  for each row execute function audit_row();

-- The registers ----------------------------------------------------------
drop trigger if exists trg_audit_clients   on clients;
drop trigger if exists trg_audit_projects  on projects;
drop trigger if exists trg_audit_employees on employees;
drop trigger if exists trg_audit_licences  on software_licences;

create trigger trg_audit_clients   after insert or update or delete on clients
  for each row execute function audit_row();
create trigger trg_audit_projects  after insert or update or delete on projects
  for each row execute function audit_row();
create trigger trg_audit_employees after insert or update or delete on employees
  for each row execute function audit_row();
create trigger trg_audit_licences  after insert or update or delete on software_licences
  for each row execute function audit_row();

create index if not exists audit_log_period_idx on audit_log (org_id, period, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Readable trail
--
-- The triggers store uuids because that is what the rows carry. This resolves
-- them into the codes and names the product speaks in, and renders the common
-- cases as "was -> is" so the log can be read without unpacking jsonb.
-- ---------------------------------------------------------------------------
create or replace view v_audit as
select
  a.id,
  a.org_id,
  a.occurred_at,
  a.action,
  a.entity_table,
  a.period,
  coalesce(u.full_name, 'outside the app')          as actor,
  u.email                                            as actor_email,
  e.code                                             as employee_code,
  e.full_name                                        as employee_name,
  p.code                                             as project_code,
  p.name                                             as project_name,
  case a.entity_table
    when 'allocations' then
      coalesce(a.before->>'allocation_pct', '0') || '% -> ' ||
      coalesce(a.after->>'allocation_pct', '0') || '%'
    when 'project_revenue' then
      coalesce(a.before->>'amount', '0') || ' -> ' || coalesce(a.after->>'amount', '0')
    when 'employee_period_costs' then
      coalesce(a.before->>'annual_ctc', '0') || ' -> ' || coalesce(a.after->>'annual_ctc', '0')
    when 'employee_compensation' then
      coalesce(a.before->>'annual_ctc', '0') || ' -> ' || coalesce(a.after->>'annual_ctc', '0')
    when 'other_costs' then
      coalesce(a.before->>'amount', '0') || ' -> ' || coalesce(a.after->>'amount', '0')
    when 'periods' then
      coalesce(a.before->>'status', 'open') || ' -> ' || coalesce(a.after->>'status', 'open')
    else null
  end                                                as change,
  a.before,
  a.after
from audit_log a
left join users     u on u.id = a.actor_id
left join employees e on e.org_id = a.org_id
                     and e.id = (coalesce(a.after, a.before)->>'employee_id')::uuid
left join projects  p on p.org_id = a.org_id
                     and p.id = (coalesce(a.after, a.before)->>'project_id')::uuid;

comment on view v_audit is
  'audit_log with ids resolved to codes and names, and the common changes rendered as was -> is.';
