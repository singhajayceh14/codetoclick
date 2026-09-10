/* Translates between the app's vocabulary and the database.
   The app speaks in short codes (C01, P07, E12) and month keys ('2026-09');
   PostgreSQL speaks in uuids and first-of-month dates. Every conversion lives
   here, so no endpoint has to know about both. */
import { db } from './auth.js';

/* ---- small conversions --------------------------------------------------- */
const toDate  = m => (m ? m + '-01' : null);            // '2026-09' -> '2026-09-01'
/* Months arrive already formatted as 'YYYY-MM' from SQL (see the selects
   below) - never derived from a driver's date object, which differs by driver
   and by timezone. */
const num     = v => (v == null ? 0 : Number(v));

const TYPE_TO_DB = {
  'Fixed project': 'fixed_project', 'Retainer': 'retainer',
  'Time and materials': 'time_and_materials', 'Milestone': 'milestone'
};
const TYPE_FROM_DB = Object.fromEntries(Object.entries(TYPE_TO_DB).map(([k, v]) => [v, k]));

/* ---- read everything ----------------------------------------------------- */
export async function loadState(orgId) {
  const sql = db();

  const [org, clients, projects, employees, comp, licences,
         revenue, payroll, alloc, costs, periods] = await Promise.all([
    sql`select name, base_currency, fiscal_year_start_mth, margin_healthy_pct, margin_watch_pct
          from c2c.organizations where id = ${orgId}`,
    sql`select code, name, industry, to_char(client_since,'YYYY-MM') as since from c2c.clients
         where org_id = ${orgId} and archived_at is null order by code`,
    sql`select p.code, c.code as client_code, p.name, p.engagement_type, p.is_billable,
               p.discipline, to_char(p.starts_on,'YYYY-MM') as starts,
               to_char(p.ends_on,'YYYY-MM') as ends
          from c2c.projects p join c2c.clients c on c.id = p.client_id
         where p.org_id = ${orgId} order by p.code`,
    sql`select code, full_name, job_title, department, discipline,
               to_char(joined_on,'YYYY-MM') as joined, to_char(left_on,'YYYY-MM') as leaves
          from c2c.employees where org_id = ${orgId} order by code`,
    sql`select e.code, k.annual_ctc from c2c.employee_compensation k
          join c2c.employees e on e.id = k.employee_id
         where k.org_id = ${orgId} order by k.effective_from`,
    sql`select code, name, vendor, total_price, to_char(starts_on,'YYYY-MM') as starts, term_months, note
          from c2c.software_licences where org_id = ${orgId} order by code`,
    sql`select to_char(r.period,'YYYY-MM') as m, p.code, r.amount from c2c.project_revenue r
          join c2c.projects p on p.id = r.project_id where r.org_id = ${orgId}`,
    sql`select to_char(k.period,'YYYY-MM') as m, e.code, k.monthly_cost from c2c.employee_period_costs k
          join c2c.employees e on e.id = k.employee_id where k.org_id = ${orgId}`,
    sql`select to_char(a.period,'YYYY-MM') as m, e.code as emp_code, p.code as proj_code, a.allocation_pct
          from c2c.allocations a
          join c2c.employees e on e.id = a.employee_id
          left join c2c.projects p on p.id = a.project_id
         where a.org_id = ${orgId}`,
    sql`select to_char(o.period,'YYYY-MM') as m, p.code as proj_code, g.name as category, o.amount
          from c2c.other_costs o
          left join c2c.projects p on p.id = o.project_id
          left join c2c.cost_categories g on g.id = o.category_id
         where o.org_id = ${orgId}`,
    sql`select to_char(period,'YYYY-MM') as m, status from c2c.periods where org_id = ${orgId} order by period`
  ]);

  /* newest CTC per person becomes the headline figure the app shows */
  const baseCtc = {};
  comp.forEach(r => { baseCtc[r.code] = num(r.annual_ctc); });

  const ledger = {};
  const month = m => (ledger[m] = ledger[m] || { month: m, revenue: {}, alloc: {}, empCost: {}, other: [] });

  periods.forEach(r => month(r.m));
  revenue.forEach(r => { month(r.m).revenue[r.code] = num(r.amount); });
  payroll.forEach(r => { month(r.m).empCost[r.code] = num(r.monthly_cost); });
  alloc.forEach(r => {
    const m = month(r.m);
    m.alloc[r.emp_code] = m.alloc[r.emp_code] || {};
    m.alloc[r.emp_code][r.proj_code || 'INTERNAL'] = num(r.allocation_pct);
  });
  costs.forEach(r => {
    month(r.m).other.push({
      projectId: r.proj_code || null, category: r.category || 'Other', amount: num(r.amount)
    });
  });

  return {
    org: org[0] ? {
      name: org[0].name, currency: org[0].base_currency,
      fiscalStart: org[0].fiscal_year_start_mth,
      healthy: num(org[0].margin_healthy_pct), watch: num(org[0].margin_watch_pct)
    } : null,
    clients: clients.map(c => ({
      id: c.code, name: c.name, industry: c.industry || 'Professional services', since: c.since
    })),
    projects: projects.map(p => ({
      id: p.code, clientId: p.client_code, name: p.name,
      type: TYPE_FROM_DB[p.engagement_type] || 'Fixed project',
      billable: p.is_billable, baseRev: 0, health: 0.5,
      start: p.starts, end: p.ends, disc: p.discipline || 'eng'
    })),
    employees: employees.map(e => ({
      id: e.code, name: e.full_name, title: e.job_title || '', dept: e.department || '',
      baseCtc: baseCtc[e.code] || 0, join: e.joined,
      left: e.leaves, disc: e.discipline || 'eng', pinned: true
    })),
    licences: licences.map(l => ({
      id: l.code, name: l.name, vendor: l.vendor || '', price: num(l.total_price),
      start: l.starts, months: l.term_months, note: l.note || ''
    })),
    ledger,
    periods: periods.map(p => ({ month: p.m, status: p.status }))
  };
}

/* ---- the write operations ------------------------------------------------
   Each one is a single call to a database function, so it is atomic: it either
   happens completely or not at all. The names match the app's own data module,
   so there is no third vocabulary to hold in your head.                      */
export const OPS = {

  addClient:     (sql, o, a) => sql`select c2c.op_add_client(${o}, ${a.id}, ${a.name}, ${a.industry || null}, ${toDate(a.since)})`,
  updateClient:  (sql, o, a) => sql`select c2c.op_update_client(${o}, ${a.id}, ${a.patch?.name ?? null}, ${a.patch?.industry ?? null})`,
  deleteClient:  (sql, o, a) => sql`select c2c.op_delete_client(${o}, ${a.id})`,

  addProject:    (sql, o, a) => sql`select c2c.op_add_project(${o}, ${a.id}, ${a.clientId}, ${a.name},
                                      ${TYPE_TO_DB[a.type] || 'fixed_project'}, ${a.billable !== false},
                                      ${a.disc || 'eng'}, ${toDate(a.start)}, ${toDate(a.end)})`,
  updateProject: (sql, o, a) => sql`select c2c.op_update_project(${o}, ${a.id}, ${a.patch?.name ?? null},
                                      ${a.patch?.billable ?? null}, ${toDate(a.patch?.end)},
                                      ${a.patch ? 'end' in a.patch : false})`,
  deleteProject: (sql, o, a) => sql`select c2c.op_delete_project(${o}, ${a.id})`,

  addEmployee:   (sql, o, a) => sql`select c2c.op_add_employee(${o}, ${a.id}, ${a.name}, ${a.title || null},
                                      ${a.dept || null}, ${a.disc || 'eng'}, ${toDate(a.join)}, ${num(a.ctc)})`,
  updateEmployee:(sql, o, a) => sql`select c2c.op_update_employee(${o}, ${a.id}, ${a.patch?.name ?? null},
                                      ${a.patch?.title ?? null}, ${a.patch?.dept ?? null})`,
  deleteEmployee:(sql, o, a) => sql`select c2c.op_delete_employee(${o}, ${a.id})`,

  addLicence:    (sql, o, a) => sql`select c2c.op_add_licence(${o}, ${a.id}, ${a.name}, ${a.vendor || null},
                                      ${num(a.price)}, ${toDate(a.start)}, ${Math.max(1, a.months | 0)}, ${a.note || null})`,
  updateLicence: (sql, o, a) => sql`select c2c.op_update_licence(${o}, ${a.id}, ${a.patch?.name ?? null},
                                      ${a.patch?.vendor ?? null}, ${a.patch?.price ?? null},
                                      ${toDate(a.patch?.start)}, ${a.patch?.months ?? null}, ${a.patch?.note ?? null})`,
  deleteLicence: (sql, o, a) => sql`select c2c.op_delete_licence(${o}, ${a.id})`,

  setRevenue:    (sql, o, a) => sql`select c2c.op_set_revenue(${o}, ${toDate(a.month)}, ${a.projectId}, ${num(a.amount)})`,
  setEmpCost:    (sql, o, a) => sql`select c2c.op_set_emp_cost(${o}, ${toDate(a.month)}, ${a.employeeId}, ${num(a.monthly)})`,
  setAllocation: (sql, o, a) => sql`select c2c.op_set_allocation(${o}, ${toDate(a.month)}, ${a.employeeId}, ${JSON.stringify(a.map || {})}::jsonb)`,
  addCost:       (sql, o, a) => sql`select c2c.op_add_cost(${o}, ${toDate(a.month)}, ${a.projectId || null},
                                      ${a.category || 'Other'}, ${num(a.amount)}, ${a.note || null})`,

  setFiscalStart:(sql, o, a) => sql`select c2c.op_set_fiscal_start(${o}, ${a.month | 0})`,
  closePeriod:   (sql, o, a) => sql`select c2c.op_close_period(${o}, ${toDate(a.month)}, ${!!a.close})`
};

/* Who may do what. Checked on the server; hiding a button is not a permission. */
export const WRITE_ROLES = ['owner', 'finance', 'manager'];
export const OWNER_ONLY  = ['closePeriod', 'setFiscalStart', 'deleteClient', 'deleteProject', 'deleteEmployee'];
export const OWNER_ROLES = ['owner', 'finance'];
