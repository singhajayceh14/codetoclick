/* ============================================================================
   Code to Click — Profitability Intelligence
   Data model + rollup engine.

   Design rule that drives everything below: the atomic financial record is
   (month, entity, amount). Nothing is stored annually. Every aggregate —
   quarter, YTD, year, client, company — is a sum over monthly records.
   ========================================================================== */
(function (root) {
  'use strict';

  /* ---------- deterministic RNG (mulberry32) -------------------------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seeded(key) { return mulberry32(hashStr(key)); }
  function jitter(key, spread) { return 1 + (seeded(key)() - 0.5) * 2 * spread; }

  /* ---------- calendar ------------------------------------------------------ */
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function mkey(y, m) { return y + '-' + String(m).padStart(2, '0'); }
  function mparse(k) { return { y: +k.slice(0, 4), m: +k.slice(5, 7) }; }
  function mlabel(k) { var p = mparse(k); return MONTH_NAMES[p.m - 1] + ' ' + p.y; }
  function mshort(k) { var p = mparse(k); return MONTH_ABBR[p.m - 1] + ' ' + String(p.y).slice(2); }
  function mabbr(k) { return MONTH_ABBR[mparse(k).m - 1]; }
  function mindex(k) { var p = mparse(k); return p.y * 12 + (p.m - 1); }
  function mfromIndex(i) { return mkey(Math.floor(i / 12), (i % 12) + 1); }
  function maddMonths(k, n) { return mfromIndex(mindex(k) + n); }
  // the reporting calendar can start in any month; quarters, year-to-date and
  // full-year all pivot on it
  var FISCAL_START = 1;
  function setFiscalStart(m) { FISCAL_START = Math.min(12, Math.max(1, m | 0)); sync('setFiscalStart', { month: FISCAL_START }); }
  function getFiscalStart() { return FISCAL_START; }
  function fiscalOffset(k) { return (mparse(k).m - FISCAL_START + 12) % 12; }
  function mquarter(k) { return Math.floor(fiscalOffset(k) / 3) + 1; }
  function fiscalYearStart(k) {
    var p = mparse(k);
    return mkey(p.m >= FISCAL_START ? p.y : p.y - 1, FISCAL_START);
  }
  function fiscalLabel(k) {
    var st = mparse(fiscalYearStart(k));
    return FISCAL_START === 1 ? 'FY' + st.y : 'FY' + String(st.y).slice(2) + '/' + String(st.y + 1).slice(2);
  }

  var FIRST_MONTH = '2025-01';

  /* The month the product treats as "now", taken from the clock rather than
     pinned to a literal. MONTHS ends here, so a hardcoded value means the app
     silently stops accepting new months - on 1 October a build pinned to
     '2026-09' cannot record October at all until someone edits this line and
     rebuilds. Read once at load; a tab left open across a month boundary picks
     it up on the next refresh. */
  function thisMonth() { var d = new Date(); return mkey(d.getFullYear(), d.getMonth() + 1); }
  var CURRENT_MONTH = thisMonth();

  /* The sample company is calibrated to September 2026 - the revenue targets
     below, the payroll scaling, and the worked example from the spec all assume
     it. That anchor must not move with the clock or the demo figures stop
     matching the document they came from. Real data never reaches any of it:
     buildMonth() returns an empty month when DATA_MODE is 'own'. */
  var DEMO_MONTH = '2026-09';
  var MONTHS = [];
  for (var i = mindex(FIRST_MONTH); i <= mindex(CURRENT_MONTH); i++) MONTHS.push(mfromIndex(i));

  /* ---------- company monthly targets --------------------------------------
     Revenue and total cost are the two anchors per month; the employee /
     other-cost split is *derived* from the roster and the allocation engine.  */
  var TARGET = {
    '2025-01': [188000, 136000], '2025-02': [194000, 140000], '2025-03': [199000, 143000],
    '2025-04': [205000, 147000], '2025-05': [209000, 149000], '2025-06': [214000, 152000],
    '2025-07': [218000, 155000], '2025-08': [212000, 152000], '2025-09': [228000, 158000],
    '2025-10': [235000, 162000], '2025-11': [241000, 166000], '2025-12': [236000, 167000],
    '2026-01': [240000, 170000], '2026-02': [250000, 175000], '2026-03': [262000, 179000],
    '2026-04': [271000, 182000], '2026-05': [276000, 184000], '2026-06': [281000, 186000],
    '2026-07': [278000, 188000], '2026-08': [263300, 184300], '2026-09': [285400, 187200]
  };

  /* ---------- clients ------------------------------------------------------- */
  var CLIENTS = [
    ['C01', 'Ashfield University', 'Higher education', '2022-04'],
    ['C02', 'Northgate State College', 'Higher education', '2022-09'],
    ['C03', 'Vertex Advisory Group', 'Professional services', '2023-02'],
    ['C04', 'Harbor Foundation', 'Nonprofit', '2023-06'],
    ['C05', 'Larkspur Retail Group', 'Retail', '2023-10'],
    ['C06', 'Corvus Financial Advisors', 'Professional services', '2024-01'],
    ['C07', 'Basalt Outdoors', 'Retail', '2024-03'],
    ['C08', 'Brookline Polytechnic', 'Higher education', '2024-05'],
    ['C09', 'Bright Futures Trust', 'Nonprofit', '2024-08'],
    ['C10', 'Meridian Consulting', 'Professional services', '2024-11'],
    ['C11', 'Kestrel Actuarial', 'Professional services', '2025-02'],
    ['C12', 'Rivers Alliance', 'Nonprofit', '2025-04'],
    ['C13', 'Lakeview Institute', 'Higher education', '2025-06'],
    ['C14', 'Orchard Foods', 'Retail', '2025-09'],
    ['C15', 'Sandsend College', 'Higher education', '2025-11'],
    ['C16', 'Ridgeline Travel Retail', 'Retail', '2026-01'],
    ['C17', 'Quill & Co Publishing', 'Professional services', '2026-03'],
    ['C18', 'Copperfield Legal', 'Professional services', '2026-05']
  ].map(function (r) { return { id: r[0], name: r[1], industry: r[2], since: r[3] }; });

  /* ---------- projects ------------------------------------------------------
     baseRev  = September 2026 monthly revenue (the anchor month)
     health   = project economics, 0 (thin) .. 1 (rich). Drives cost ratios.
     start/end = months the project is live (end null = ongoing)                */
  var PROJECTS = [
    // id, clientId, name, type, baseRev, health, start, end, discipline mix
    ['P01', 'C01', 'Agentforce Service Rollout', 'Fixed project', 40000, 0.62, '2025-01', null, 'eng'],
    ['P02', 'C01', 'Education Cloud Implementation', 'Time & materials', 25000, 0.55, '2025-01', null, 'eng'],
    ['P03', 'C01', 'AMS Retainer', 'Retainer', 15000, 0.00, '2025-01', null, 'support'],
    ['P04', 'C02', 'Data 360 Unification', 'Fixed project', 24000, 0.66, '2025-01', null, 'data'],
    ['P05', 'C02', 'Marketing Cloud Migration', 'Fixed project', 22000, 0.08, '2025-08', null, 'eng'],
    ['P06', 'C02', 'Experience Cloud Portal', 'Time & materials', 16000, 0.58, '2025-01', null, 'eng'],
    ['P07', 'C03', 'Agentforce Sales Rollout', 'Milestone', 28000, 0.48, '2025-01', null, 'devops'],
    ['P08', 'C03', 'CRM Analytics Workspace', 'Fixed project', 14000, 0.61, '2025-01', null, 'data'],
    ['P09', 'C03', 'Release Management Retainer', 'Retainer', 6000, 0.72, '2025-10', null, 'devops'],
    ['P10', 'C04', 'Nonprofit Cloud Implementation', 'Fixed project', 10000, 0.44, '2025-01', null, 'eng'],
    ['P11', 'C04', 'Donor Data Unification', 'Time & materials', 6000, 0.52, '2025-06', null, 'data'],
    ['P12', 'C05', 'Commerce Cloud Replatform', 'Fixed project', 8000, 0.40, '2025-01', null, 'eng'],
    ['P13', 'C05', 'Loyalty Segmentation', 'Milestone', 4000, 0.68, '2026-01', null, 'data'],
    ['P14', 'C06', 'Sales Cloud Consolidation', 'Fixed project', 7000, 0.57, '2025-01', null, 'data'],
    ['P15', 'C06', 'Revenue Cloud Pilot', 'Time & materials', 3000, 0.30, '2026-02', null, 'eng'],
    ['P16', 'C07', 'Account Engagement Rebuild', 'Fixed project', 6000, 0.35, '2025-01', null, 'eng'],
    ['P17', 'C07', 'Store Ops Integration', 'Time & materials', 2500, 0.03, '2026-03', null, 'eng'],
    ['P18', 'C08', 'Student Success Portal', 'Fixed project', 5000, 0.50, '2025-01', null, 'eng'],
    ['P19', 'C08', 'Admissions Data Feed', 'Milestone', 2500, 0.63, '2026-01', null, 'data'],
    ['P20', 'C09', 'Fundraising Journeys', 'Fixed project', 4400, 0.46, '2025-01', null, 'eng'],
    ['P21', 'C09', 'Volunteer Portal', 'Retainer', 2200, 0.26, '2026-02', null, 'eng'],
    ['P22', 'C10', 'Einstein Forecasting', 'Fixed project', 4300, 0.64, '2025-01', null, 'data'],
    ['P23', 'C10', 'Service Cloud Voice', 'Time & materials', 2000, 0.38, '2026-04', null, 'eng'],
    ['P24', 'C11', 'Agentforce Claims Triage', 'Fixed project', 3500, 0.54, '2025-03', null, 'eng'],
    ['P25', 'C11', 'Policy Data Migration', 'Milestone', 2000, 0.42, '2026-02', null, 'data'],
    ['P26', 'C12', 'Grants Management Build', 'Fixed project', 3000, 0.49, '2025-05', null, 'eng'],
    ['P27', 'C12', 'Supporter Self-Service', 'Time & materials', 1600, 0.33, '2026-05', null, 'eng'],
    ['P28', 'C13', 'Alumni Engagement Hub', 'Fixed project', 3000, 0.56, '2025-07', null, 'eng'],
    ['P29', 'C13', 'Legacy Org Cleanup', 'Time & materials', 1200, 0.22, '2026-06', null, 'data'],
    ['P30', 'C14', 'Retail Media Activation', 'Fixed project', 3800, 0.51, '2025-10', null, 'eng'],
    ['P31', 'C15', 'Campus CRM Rollout', 'Fixed project', 3400, 0.60, '2025-12', null, 'devops'],
    ['P32', 'C16', 'Clienteling App', 'Fixed project', 2800, 0.45, '2026-02', null, 'eng'],
    ['P33', 'C17', 'MuleSoft Integration', 'Milestone', 2400, 0.37, '2026-04', null, 'data'],
    ['P34', 'C18', 'Matter Intake Automation', 'Fixed project', 1800, 0.41, '2026-06', null, 'eng'],
    // closed engagements — they hold history but are not active in Sep 2026
    ['P35', 'C01', 'Agentforce Discovery Pilot', 'Fixed project', 9000, 0.34, '2025-01', '2025-11', 'eng'],
    ['P36', 'C03', 'Classic to Lightning Migration', 'Milestone', 7000, 0.20, '2025-01', '2026-01', 'devops'],
    ['P37', 'C05', 'In-store Kiosk Pilot', 'Fixed project', 4000, 0.12, '2025-06', '2026-04', 'eng']
  ].map(function (r) {
    return {
      id: r[0], clientId: r[1], name: r[2], type: r[3], baseRev: r[4],
      health: r[5], start: r[6], end: r[7], disc: r[8]
    };
  });

  /* ---------- employees -----------------------------------------------------
     baseCtc is the CTC at hire. A 5% raise lands each January once the
     employee has a full year of tenure, so monthly cost is itself a
     month-dependent record — not a constant.                                   */
  var EMPLOYEES = [
    ['E01', 'John Smith', 'Lead Solution Architect', 'Architecture', 72000, '2022-03', 'eng', true],
    ['E02', 'Sarah Jones', 'Senior Salesforce Developer', 'Development', 60000, '2022-08', 'eng'],
    ['E03', 'Michael Brown', 'Senior Salesforce Developer', 'Development', 57000, '2023-01', 'eng'],
    ['E04', 'Priya Nair', 'Delivery Architect', 'Architecture', 78000, '2021-11', 'eng'],
    ['E05', 'David Okafor', 'Senior Salesforce Developer', 'Development', 54000, '2023-04', 'eng'],
    ['E06', 'Elena Vasquez', 'Salesforce Developer', 'Development', 45000, '2023-09', 'eng'],
    ['E07', 'Rahul Menon', 'Salesforce Developer', 'Development', 42000, '2024-02', 'eng'],
    ['E08', 'Grace Lin', 'Senior Salesforce Developer', 'Development', 55000, '2022-06', 'eng'],
    ['E09', 'Tomas Weber', 'Salesforce Developer', 'Development', 43000, '2024-05', 'eng'],
    ['E10', 'Amara Diallo', 'Salesforce Developer', 'Development', 41000, '2024-08', 'eng'],
    ['E11', 'Noah Feldman', 'Associate Developer', 'Development', 28000, '2025-02', 'eng'],
    ['E12', 'Ishita Rao', 'Associate Developer', 'Development', 27000, '2025-04', 'eng'],
    ['E13', 'Marcus Hale', 'Senior Salesforce Developer', 'Development', 56000, '2023-03', 'eng'],
    ['E14', 'Yuki Tanaka', 'Salesforce Developer', 'Development', 44000, '2024-01', 'eng'],
    ['E15', 'Sofia Marchetti', 'Salesforce Developer', 'Development', 43000, '2024-07', 'eng'],
    ['E16', 'Daniel Achterberg', 'Associate Developer', 'Development', 29000, '2025-07', 'eng'],
    ['E17', 'Leila Haddad', 'Salesforce Developer', 'Development', 42000, '2026-03', 'eng'],
    ['E18', 'Owen Pryce', 'Associate Developer', 'Development', 28000, '2026-02', 'eng'],
    ['E19', 'Ana Ferreira', 'Senior Marketing Cloud Consultant', 'Marketing Cloud', 51000, '2022-10', 'eng'],
    ['E20', 'Kwame Boateng', 'Marketing Cloud Consultant', 'Marketing Cloud', 39000, '2023-11', 'eng'],
    ['E21', 'Hana Kovac', 'Marketing Cloud Consultant', 'Marketing Cloud', 38000, '2024-09', 'eng'],
    ['E22', 'Julien Roy', 'Journey Strategist', 'Marketing Cloud', 41000, '2026-04', 'eng'],
    ['E23', 'Meera Shah', 'QA Lead', 'Quality', 46000, '2022-12', 'eng'],
    ['E24', 'Peter Novak', 'QA Analyst', 'Quality', 33000, '2023-08', 'eng'],
    ['E25', 'Rosa Delgado', 'QA Analyst', 'Quality', 32000, '2024-04', 'eng'],
    ['E26', 'Simon Okeke', 'QA Analyst', 'Quality', 31000, '2025-05', 'eng'],
    ['E27', 'Anika Bose', 'Data Cloud Engineer', 'Data 360', 57000, '2023-02', 'data'],
    ['E28', 'Felix Braun', 'Data Cloud Engineer', 'Data 360', 54000, '2024-03', 'data'],
    ['E29', 'Chloe Dubois', 'Data Analyst', 'Data 360', 36000, '2025-01', 'data'],
    ['E30', 'Ravi Iyer', 'Data Cloud Engineer', 'Data 360', 52000, '2026-02', 'data'],
    ['E31', 'Nadia Petrova', 'Platform Engineer', 'Platform', 55000, '2022-05', 'devops'],
    ['E32', 'Ben Sundqvist', 'Platform Engineer', 'Platform', 51000, '2024-06', 'devops'],
    ['E33', 'Carlos Mendes', 'Release Engineer', 'Platform', 53000, '2026-06', 'devops'],
    ['E34', 'Tara Whitfield', 'Engagement Lead', 'Delivery', 60000, '2021-09', 'eng'],
    ['E35', 'Ahmed Farouk', 'Delivery Manager', 'Delivery', 45000, '2023-06', 'eng'],
    ['E36', 'Lucy Barrett', 'Delivery Manager', 'Delivery', 44000, '2024-10', 'eng'],
    ['E37', 'Gustavo Rios', 'Delivery Manager', 'Delivery', 43000, '2025-10', 'eng'],
    ['E38', 'Emma Sorensen', 'Business Analyst', 'Delivery', 39000, '2026-01', 'data'],
    ['E39', 'Victor Alenin', 'AMS Consultant', 'AMS', 26000, '2023-07', 'support'],
    ['E40', 'Nina Costa', 'AMS Consultant', 'AMS', 25000, '2024-11', 'support'],
    ['E41', 'Jamal Wright', 'AMS Consultant', 'AMS', 25000, '2025-03', 'support'],
    ['E42', 'Beatrice Lund', 'AMS Lead', 'AMS', 34000, '2022-07', 'support']
  ].map(function (r) {
    return {
      id: r[0], name: r[1], title: r[2], dept: r[3], baseCtc: r[4],
      join: r[5], disc: r[6], pinned: !!r[7]
    };
  });

  var COST_CATEGORIES = ['Cloud', 'Software', 'Contractors', 'Travel', 'Other'];
  /* for display: the booked categories plus the derived licence line */
  var COST_GROUPS = COST_CATEGORIES.concat(['Software licences']);
  var CATEGORY_MIX = [0.279279, 0.184685, 0.220721, 0.092342, 0.222973]; // Sep-2026 mix, sums to 1

  /* ---------- CTC history ---------------------------------------------------- */
  function raiseCount(emp, month) {
    // a 5% raise on each employment anniversary, so payroll grows through the
    // year rather than stepping once in January
    var t = mindex(month) - mindex(emp.join);
    return t < 12 ? 0 : Math.floor(t / 12);
  }

  // Scale the roster (John Smith excluded — his $72,000 CTC is the worked
  // example in the spec) so September 2026 employee cost is exactly $142,800.
  var CTC_SCALE = (function () {
    var pinnedMonthly = 0, freeMonthly = 0;
    EMPLOYEES.forEach(function (e) {
      var m = e.baseCtc * Math.pow(1.05, raiseCount(e, DEMO_MONTH)) / 12;
      if (e.pinned) pinnedMonthly += e.baseCtc / 12; else freeMonthly += m;
    });
    return (142800 - pinnedMonthly) / freeMonthly;
  })();

  function rawCtc(emp, month) {
    if (emp.pinned) return emp.baseCtc;
    var raw = emp.baseCtc * Math.pow(1.05, raiseCount(emp, month)) * CTC_SCALE;
    return Math.round(raw / 600) * 600; // keep monthly cost a whole number
  }
  // rounding leaves a small residual; park it on the highest-paid manager so
  // September 2026 payroll lands on exactly $142,800
  var CTC_RESIDUAL = (function () {
    var sum = 0;
    EMPLOYEES.forEach(function (e) {
      if (mindex(DEMO_MONTH) >= mindex(e.join)) sum += rawCtc(e, DEMO_MONTH);
    });
    return 142800 * 12 - sum;
  })();
  function ctcAt(emp, month) {
    if (mindex(month) < mindex(emp.join)) return 0;
    return rawCtc(emp, month) + (emp.id === 'E04' ? CTC_RESIDUAL : 0);
  }
  function monthlyCost(emp, month) { return ctcAt(emp, month) / 12; }
  function isActiveEmp(emp, month) { return mindex(month) >= mindex(emp.join); }
  function isActiveProj(p, month) {
    var i = mindex(month);
    return i >= mindex(p.start) && (!p.end || i <= mindex(p.end));
  }

  /* ---------- monthly fact tables ------------------------------------------
     Everything below is generated once per month and then frozen in
     STORE[month]. A later month's records never touch an earlier month's —
     that is what makes each month a financial snapshot.                       */
  var STORE = {};
  /* month -> 'open' | 'closed'. The server is the authority; the browser keeps
     it so a backup can record which months were closed and a restore can put
     them back that way. */
  var PERIOD_STATUS = {};
  /* Sign-in accounts for this organization, filled from /api/state. These are
     logins, not the payroll register - EMPLOYEES is a different thing. */
  var USERS = [];

  var PINNED_REVENUE = { '2026-09': { P01: 40000 } };

  // Cost overruns actually happen. These are the months a project burned more
  // than its economics would predict — enough to push a thin one into a loss.
  var OVERRUNS = {
    'P17|2026-09': 1.42, 'P17|2026-07': 1.30, 'P29|2026-09': 1.38, 'P29|2026-08': 1.20,
    'P05|2026-08': 1.18, 'P03|2026-05': 1.22, 'P37|2025-05': 1.35, 'P36|2025-09': 1.25,
    'P21|2026-06': 1.28, 'P16|2026-03': 1.19
  };
  function overrun(pid, month) { return OVERRUNS[pid + '|' + month] || 1; }

  function buildRevenue(month) {
    var live = PROJECTS.filter(function (p) { return isActiveProj(p, month); });
    var age = function (p) { return mindex(month) - mindex(p.start); };
    var raw = live.map(function (p) {
      // ramp up over the first three months, then drift with monthly noise
      // projects that predate the record window are already at full run-rate
      var ramp = p.start === FIRST_MONTH ? 1 : Math.min(1, 0.45 + 0.28 * age(p));
      var drift = 1 - 0.006 * (mindex(DEMO_MONTH) - mindex(month));
      return { id: p.id, v: p.baseRev * ramp * drift * jitter(p.id + month + 'rev', 0.07) };
    });
    var sum = raw.reduce(function (a, r) { return a + r.v; }, 0);
    var k = TARGET[month][0] / sum;
    var pin = PINNED_REVENUE[month] || {};
    var out = {}, acc = 0;
    raw.forEach(function (r, i) {
      var v = pin[r.id] != null ? pin[r.id]
        : i === raw.length - 1 ? TARGET[month][0] - acc
          : Math.round(r.v * k / 100) * 100;
      acc += v; out[r.id] = v;
    });
    // any residual from pinning lands on the largest unpinned project
    var diff = TARGET[month][0] - acc;
    if (diff !== 0) {
      var biggest = raw.filter(function (r) { return pin[r.id] == null; })
        .sort(function (a, b) { return out[b.id] - out[a.id]; })[0];
      if (biggest) out[biggest.id] += diff;
    }
    return out;
  }

  function buildAllocations(month, revenue) {
    var emps = EMPLOYEES.filter(function (e) { return isActiveEmp(e, month); });
    var live = PROJECTS.filter(function (p) { return isActiveProj(p, month); });
    var totalEmpCost = emps.reduce(function (a, e) { return a + monthlyCost(e, month); }, 0);

    // How much employee cost each project *should* absorb, from its economics.
    var need = {};
    var rawSum = 0;
    live.forEach(function (p) {
      var ratio = (0.78 - 0.44 * p.health) * jitter(p.id + month + 'k', 0.09) * overrun(p.id, month);
      need[p.id] = revenue[p.id] * ratio;
      rawSum += need[p.id];
    });
    var projectPool = totalEmpCost * 0.9235; // rest is internal work + bench
    var scale = projectPool / rawSum;
    live.forEach(function (p) { need[p.id] *= scale; });

    // Capacity, in dollars, per employee. A slice is held back so the month
    // ends with a realistic unallocated (bench) figure.
    var cap = {}, cost = {};
    emps.forEach(function (e) {
      cost[e.id] = monthlyCost(e, month);
      var r = seeded(e.id + month + 'cap')();
      var pct = r < 0.58 ? 100 : r < 0.82 ? 95 : r < 0.94 ? 90 : 80;
      cap[e.id] = pct;
    });

    var alloc = {}; // alloc[empId] = { projectId|'INTERNAL': pct }
    emps.forEach(function (e) { alloc[e.id] = {}; });
    var used = {}; emps.forEach(function (e) { used[e.id] = 0; });

    function assign(empId, projId, pct) {
      if (pct <= 0) return 0;
      pct = Math.min(pct, cap[empId] - used[empId]);
      pct = Math.floor(pct / 5) * 5;
      if (pct <= 0) return 0;
      alloc[empId][projId] = (alloc[empId][projId] || 0) + pct;
      used[empId] += pct;
      return pct * cost[empId] / 100;
    }

    // Pinned worked example from the spec — John Smith, September 2026.
    if (month === DEMO_MONTH) {
      cap['E01'] = 100; assign('E01', 'P01', 60); assign('E01', 'P02', 30);
      alloc['E01'].INTERNAL = 10; used['E01'] = 100;
      cap['E02'] = 100; assign('E02', 'P01', 100);
      cap['E03'] = 100; assign('E03', 'P01', 50); assign('E03', 'P02', 25); assign('E03', 'P04', 25);
    }

    var order = live.slice().sort(function (a, b) { return need[b.id] - need[a.id]; });
    order.forEach(function (p) {
      var got = 0;
      Object.keys(alloc).forEach(function (eid) {
        if (alloc[eid][p.id]) got += alloc[eid][p.id] * cost[eid] / 100;
      });
      var remaining = need[p.id] - got;
      if (remaining <= 0) return;
      // candidates: discipline match first, then anyone with capacity left
      var rnd = seeded(p.id + month + 'team');
      var pool = emps.slice().sort(function (a, b) {
        var am = (a.disc === p.disc ? 0 : 1), bm = (b.disc === p.disc ? 0 : 1);
        if (am !== bm) return am - bm;
        return (hashStr(a.id + p.id + month) % 1000) - (hashStr(b.id + p.id + month) % 1000);
      });
      for (var i = 0; i < pool.length && remaining > 500; i++) {
        var e = pool[i];
        var free = cap[e.id] - used[e.id];
        if (free < 5) continue;
        if (Object.keys(alloc[e.id]).length >= 3 && rnd() < 0.75) continue;
        var wantPct = Math.min(free, Math.ceil(remaining / cost[e.id] * 100 / 5) * 5);
        // keep teams plausible: nobody lands on a project for a token 5%
        if (wantPct < 10 && free >= 10) wantPct = 10;
        remaining -= assign(e.id, p.id, wantPct);
      }
    });

    // Internal (non-billable) work absorbs a slice of what is left.
    emps.forEach(function (e) {
      var free = cap[e.id] - used[e.id];
      if (free <= 0) return;
      var r = seeded(e.id + month + 'int')();
      if (r < 0.72) assign(e.id, 'INTERNAL', Math.min(free, r < 0.28 ? 15 : 10));
    });

    return { alloc: alloc, cost: cost, cap: cap, used: used };
  }

  /* ---------- software licences ---------------------------------------------
     A licence is a purchase with a price and a period. Its monthly charge is
     price ÷ months, for every month inside the period. The charge is split
     equally across everyone on payroll that month, and each person's share
     follows their allocation into the projects they work on; the part of a
     share that sits on internal time or the bench is company overhead. Each
     person carries their share as "software cost" beside their payroll, so
     the loaded cost of a person is visible.                                  */
  var LICENCES = [
    ['L01', 'Salesforce Developer Pro Sandbox', 'Salesforce', 6000, '2026-01', 12, 'Sandbox for the Agentforce rollout'],
    ['L02', 'Copado CI/CD', 'Copado', 4800, '2025-10', 12, 'Release pipeline'],
    ['L03', 'Slack Business+', 'Slack', 9000, '2026-01', 12, ''],
    ['L04', 'GitHub Enterprise', 'GitHub', 7200, '2025-09', 12, ''],
    ['L05', 'Figma Organization', 'Figma', 3600, '2026-03', 12, '']
  ].map(function (r) {
    return { id: r[0], name: r[1], vendor: r[2], price: r[3], start: r[4], months: r[5], note: r[6] };
  });
  function licenceEnd(l) { return maddMonths(l.start, l.months - 1); }
  function licenceActive(l, month) {
    return mindex(month) >= mindex(l.start) && mindex(month) <= mindex(licenceEnd(l));
  }
  function licenceCharge(l, month) { return licenceActive(l, month) ? l.price / l.months : 0; }
  function licencesFor(month) { return LICENCES.filter(function (l) { return licenceActive(l, month); }); }
  function seedLicenceTotal(month) {
    return SEED_LICENCES.reduce(function (t, l) { return t + licenceCharge(l, month); }, 0);
  }
  var SEED_LICENCES = LICENCES.slice();   // the seed set, so normalisation ignores runtime additions

  /* ---------- demo data vs your data ------------------------------------------
     'demo' generates the sample company; 'own' starts every month empty so the
     only records are the ones the operator creates. Either way, the current
     state is autosaved in this browser and restored on the next visit.       */
  var SEED = JSON.parse(JSON.stringify({ clients: CLIENTS, projects: PROJECTS, employees: EMPLOYEES, licences: LICENCES }));
  var DATA_MODE = 'demo';
  var STORAGE_KEY = 'c2c-data';
  function dataMode() { return DATA_MODE; }
  function emptyMonth(month) { return { month: month, revenue: {}, alloc: {}, empCost: {}, other: [] }; }

  function buildOtherCosts(month, revenue, empCostTotal) {
    var otherTotal = TARGET[month][1] - empCostTotal - seedLicenceTotal(month);
    var live = PROJECTS.filter(function (p) { return isActiveProj(p, month); });
    var projectShare = 0.90;
    var rows = [];              // {projectId|null, category, amount}
    COST_CATEGORIES.forEach(function (cat, ci) {
      var catTotal = otherTotal * CATEGORY_MIX[ci];
      var companyPart = Math.round(catTotal * (1 - projectShare));
      var pool = catTotal - companyPart;
      var weights = live.map(function (p) {
        var w = revenue[p.id] * (0.19 - 0.10 * p.health) * overrun(p.id, month);
        return w * jitter(p.id + month + cat, 0.35);
      });
      var wsum = weights.reduce(function (a, b) { return a + b; }, 0);
      var acc = 0;
      live.forEach(function (p, i) {
        var v = i === live.length - 1 ? Math.round(pool - acc) : Math.round(pool * weights[i] / wsum);
        acc += v;
        if (v > 0) rows.push({ projectId: p.id, category: cat, amount: v });
      });
      if (companyPart > 0) rows.push({ projectId: null, category: cat, amount: companyPart });
    });
    return rows;
  }

  function buildMonth(month) {
    if (DATA_MODE === 'own') return emptyMonth(month);
    /* The sample company only has targets up to DEMO_MONTH. Once the clock
       passes it there is nothing to generate, and an empty month is the honest
       answer - the alternative is TARGET[month] coming back undefined and every
       figure on the screen throwing. */
    if (!TARGET[month]) return emptyMonth(month);
    var revenue = buildRevenue(month);
    var a = buildAllocations(month, revenue);
    var empCostTotal = 0;
    Object.keys(a.cost).forEach(function (id) { empCostTotal += a.cost[id]; });
    var other = buildOtherCosts(month, revenue, empCostTotal);
    return {
      month: month,
      revenue: revenue,          // projectId -> $
      alloc: a.alloc,            // empId -> {projectId|'INTERNAL': pct}
      empCost: a.cost,           // empId -> monthly $
      other: other               // [{projectId|null, category, amount}]
    };
  }

  function snapshot(month) {
    if (!STORE[month]) STORE[month] = buildMonth(month);
    return STORE[month];
  }
  MONTHS.forEach(snapshot);

  /* ---------- rollup engine -------------------------------------------------
     One function computes a month. Everything else in the app reads its
     output; nothing recomputes finance on its own.                             */
  var cache = {};
  function invalidate(month) { if (month) delete cache[month]; else cache = {}; persist(); }

  /* ---------- server sync -------------------------------------------------
     The database is the record. The browser keeps a working copy so the UI
     stays instant, sends every change to /api/mutate, and reloads from the
     server if a change is refused - so a rejected write can never leave the
     screen showing something the database does not agree with.             */
  var SYNC = { on: false, pending: 0, onError: null, onBusy: null };

  function busy(delta) {
    SYNC.pending += delta;
    if (SYNC.onBusy) SYNC.onBusy(SYNC.pending > 0);
  }

  /* quiet: handle the failure at the call site instead of raising the global
     error toast. A password form wants its message beside the field. */
  function sync(op, args, quiet) {
    if (!SYNC.on) return Promise.resolve({ ok: true });
    busy(1);
    return fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ op: op, args: args })
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
    }).then(function (out) {
      busy(-1);
      if (!out.ok) {
        var msg = (out.data && out.data.message) || 'That change could not be saved.';
        if (!quiet && SYNC.onError) SYNC.onError(msg, out.status);
      }
      return out;
    }).catch(function () {
      busy(-1);
      if (SYNC.onError) SYNC.onError('Could not reach the server. Your change was not saved.', 0);
      return { ok: false };
    });
  }

  /* Replace the whole working copy with what the server holds. */
  function applyServerState(st) {
    CLIENTS.length = 0;   (st.clients   || []).forEach(function (x) { CLIENTS.push(x); });
    PROJECTS.length = 0;  (st.projects  || []).forEach(function (x) { PROJECTS.push(x); });
    EMPLOYEES.length = 0; (st.employees || []).forEach(function (x) { EMPLOYEES.push(x); });
    LICENCES.length = 0;  (st.licences  || []).forEach(function (x) { LICENCES.push(x); });
    Object.keys(STORE).forEach(function (k) { delete STORE[k]; });
    MONTHS.forEach(function (m) { STORE[m] = emptyMonth(m); });
    Object.keys(st.ledger || {}).forEach(function (m) {
      var src = st.ledger[m];
      if (!STORE[m]) STORE[m] = emptyMonth(m);
      STORE[m].revenue = src.revenue || {};
      STORE[m].alloc   = src.alloc   || {};
      STORE[m].empCost = src.empCost || {};
      STORE[m].other   = src.other   || [];
    });
    USERS.length = 0; (st.users || []).forEach(function (x) { USERS.push(x); });
    Object.keys(PERIOD_STATUS).forEach(function (k) { delete PERIOD_STATUS[k]; });
    (st.periods || []).forEach(function (p) {
      if (p && p.month) PERIOD_STATUS[p.month] = p.status === 'closed' ? 'closed' : 'open';
    });
    if (st.org && st.org.fiscalStart) FISCAL_START = st.org.fiscalStart;
    DATA_MODE = 'own';
    cache = {};
  }

  function loadFromServer() {
    return fetch('/api/state', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.state) return false;
        SYNC.on = false;
        applyServerState(d.state);
        SYNC.on = true;
        return true;
      })
      .catch(function () { return false; });
  }

  /* Passwords. Unlike the figure mutations these are async on purpose: there is
     no local state to update, and the caller needs to know whether it worked.
     The server takes the caller from the session cookie - the browser never
     says who it is. */
  function setOwnPassword(current, next) {
    return sync('setOwnPassword', { current: current, next: next }, true);
  }
  function adminSetPassword(email, next) {
    return sync('adminSetPassword', { email: email, next: next }, true);
  }

  /* The audit trail. A read, not a mutation, and deliberately not part of the
     state load: it grows without bound and only one screen wants it. */
  function auditLog(opts) {
    opts = opts || {};
    var q = [];
    if (opts.month) q.push('month=' + encodeURIComponent(opts.month));
    if (opts.before) q.push('before=' + encodeURIComponent(opts.before));
    if (opts.limit) q.push('limit=' + (opts.limit | 0));
    return fetch('/api/audit' + (q.length ? '?' + q.join('&') : ''), { credentials: 'same-origin' })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, rows: d.rows || [], message: d.message };
        });
      })
      .catch(function () {
        return { ok: false, rows: [], message: 'Could not reach the server.' };
      });
  }

  function persist() { }          /* the server is the record now */
  function persistedAt() { return null; }
  function forgetPersisted() { }

  function rollup(month) {
    if (cache[month]) return cache[month];
    var s = snapshot(month);
    var live = PROJECTS.filter(function (p) { return isActiveProj(p, month); });
    var emps = EMPLOYEES.filter(function (e) { return isActiveEmp(e, month); });

    var byProject = {}, byEmployee = {}, byClient = {};
    live.forEach(function (p) {
      byProject[p.id] = {
        id: p.id, clientId: p.clientId, name: p.name, type: p.type, billable: p.billable !== false,
        revenue: p.billable === false ? 0 : (s.revenue[p.id] || 0), empCost: 0, otherCost: 0, byCategory: {}, team: []
      };
    });

    emps.forEach(function (e) {
      var mc = s.empCost[e.id] != null ? s.empCost[e.id] : monthlyCost(e, month);
      var a = s.alloc[e.id] || {};
      var allocated = 0, internal = 0, lines = [];
      Object.keys(a).forEach(function (key) {
        var pct = a[key], amt = mc * pct / 100;
        allocated += amt;
        if (key === 'INTERNAL') { internal += amt; lines.push({ projectId: null, pct: pct, amount: amt }); }
        else {
          var bp = byProject[key];
          if (bp) { bp.empCost += amt; bp.team.push({ empId: e.id, pct: pct, amount: amt }); }
          /* time on a non-billable project is internal time: it earns nothing */
          if (bp && !bp.billable) internal += amt;
          lines.push({ projectId: key, pct: pct, amount: amt, billable: !bp || bp.billable });
        }
      });
      byEmployee[e.id] = {
        id: e.id, name: e.name, dept: e.dept, title: e.title,
        ctc: ctcAt(e, month), monthlyCost: mc,
        allocatedPct: Object.keys(a).reduce(function (t, k) { return t + a[k]; }, 0),
        allocated: allocated, internal: internal,
        projectCost: allocated - internal,
        unallocated: mc - allocated,
        lines: lines
      };
    });

    var companyOther = 0, otherByCategory = {};
    COST_GROUPS.forEach(function (c) { otherByCategory[c] = 0; });
    s.other.forEach(function (r) {
      otherByCategory[r.category] += r.amount;
      if (r.projectId && byProject[r.projectId]) {
        byProject[r.projectId].otherCost += r.amount;
        byProject[r.projectId].byCategory[r.category] = (byProject[r.projectId].byCategory[r.category] || 0) + r.amount;
      } else companyOther += r.amount;
    });

    /* software licences: derived from the register, never typed into a month.
       Every licence is used by the whole company: its monthly charge is split
       equally across everyone on payroll, and each person's share then follows
       their allocation — 60% on a project puts 60% of their share on that
       project's other cost; internal time, non-billable work and bench go to
       company overhead. So a project's software cost is exactly the software
       carried by the people working on it, in proportion to their time. */
    var licenceTotal = 0, licenceProject = 0, licenceCompany = 0, licenceLines = [];
    var empIds = Object.keys(byEmployee);
    empIds.forEach(function (k) { byEmployee[k].toolCost = 0; byEmployee[k].tools = []; });
    licencesFor(month).forEach(function (l) {
      var charge = licenceCharge(l, month);
      if (!charge) return;
      licenceTotal += charge;
      var share = empIds.length ? charge / empIds.length : 0, toProjects = {}, toCompany = 0;
      empIds.forEach(function (eid) {
        var e = byEmployee[eid];
        e.toolCost += share;
        e.tools.push({ licenceId: l.id, name: l.name, amount: share });
        var placed = 0;
        e.lines.forEach(function (ln) {
          var amt = share * ln.pct / 100; placed += amt;
          var bp = ln.projectId && byProject[ln.projectId];
          if (bp) {
            bp.otherCost += amt;
            bp.byCategory['Software licences'] = (bp.byCategory['Software licences'] || 0) + amt;
            toProjects[ln.projectId] = (toProjects[ln.projectId] || 0) + amt;
            if (bp.billable) licenceProject += amt; else { licenceCompany += amt; }
          } else { companyOther += amt; licenceCompany += amt; toCompany += amt; }   /* internal time */
        });
        var idle = share - placed;                                                    /* bench */
        if (idle > 1e-9) { companyOther += idle; licenceCompany += idle; toCompany += idle; }
      });
      if (!empIds.length) { companyOther += charge; licenceCompany += charge; toCompany += charge; }
      licenceLines.push({ id: l.id, name: l.name, charge: charge, carriers: empIds.length, share: share, projects: toProjects, company: toCompany });
    });
    otherByCategory['Software licences'] = licenceTotal;
    Object.keys(byEmployee).forEach(function (k) { byEmployee[k].loadedCost = byEmployee[k].monthlyCost + byEmployee[k].toolCost; });

    Object.keys(byProject).forEach(function (id) {
      var p = byProject[id];
      p.totalCost = p.empCost + p.otherCost;
      p.profit = p.revenue - p.totalCost;
      p.margin = p.revenue ? p.profit / p.revenue : 0;
      p.team.sort(function (x, y) { return y.amount - x.amount; });
    });

    CLIENTS.forEach(function (c) {
      var ps = Object.keys(byProject).map(function (k) { return byProject[k]; })
        .filter(function (p) { return p.clientId === c.id; });
      if (!ps.length) return;
      var r = 0, ec = 0, oc = 0;
      ps.forEach(function (p) { r += p.revenue; ec += p.empCost; oc += p.otherCost; });
      byClient[c.id] = {
        id: c.id, name: c.name, industry: c.industry, projects: ps,
        revenue: r, empCost: ec, otherCost: oc, totalCost: ec + oc,
        profit: r - ec - oc, margin: r ? (r - ec - oc) / r : 0
      };
    });

    var totals = { revenue: 0, projectEmpCost: 0, projectOtherCost: 0, nonBillableEmpCost: 0, nonBillableOtherCost: 0, nonBillable: 0 };
    Object.keys(byProject).forEach(function (k) {
      var bp = byProject[k];
      if (bp.billable) { totals.revenue += bp.revenue; totals.projectEmpCost += bp.empCost; totals.projectOtherCost += bp.otherCost; }
      else { totals.nonBillableEmpCost += bp.empCost; totals.nonBillableOtherCost += bp.otherCost; totals.nonBillable++; }
    });
    companyOther += totals.nonBillableOtherCost;     // a cost centre's spend is overhead, not project cost
    var empTotal = 0, internalTotal = 0, unallocTotal = 0;
    Object.keys(byEmployee).forEach(function (k) {
      empTotal += byEmployee[k].monthlyCost;
      internalTotal += byEmployee[k].internal;
      unallocTotal += byEmployee[k].unallocated;
    });

    var otherTotal = 0;
    COST_GROUPS.forEach(function (c) { otherTotal += otherByCategory[c] || 0; });

    var company = {
      month: month,
      revenue: totals.revenue,
      employeeCost: empTotal,
      otherCost: otherTotal,
      totalCost: empTotal + otherTotal,
      profit: totals.revenue - empTotal - otherTotal,
      allocatedEmpCost: empTotal - unallocTotal,
      projectEmpCost: totals.projectEmpCost,
      internalEmpCost: internalTotal,
      unallocatedEmpCost: unallocTotal,
      companyOtherCost: companyOther,
      projectContribution: totals.revenue - totals.projectEmpCost - totals.projectOtherCost,
      otherByCategory: otherByCategory,
      licenceCost: licenceTotal, licenceProjectCost: licenceProject, licenceCompanyCost: licenceCompany,
      licences: licenceLines,
      nonBillableEmpCost: totals.nonBillableEmpCost, nonBillableOtherCost: totals.nonBillableOtherCost, nonBillableProjects: totals.nonBillable,
      activeClients: Object.keys(byClient).length,
      activeProjects: Object.keys(byProject).length,
      headcount: emps.length
    };
    company.margin = company.revenue ? company.profit / company.revenue : 0;

    var out = { month: month, company: company, byProject: byProject, byClient: byClient, byEmployee: byEmployee };
    cache[month] = out;
    return out;
  }

  /* ---------- period aggregation (always a sum over months) ------------------ */
  function aggregate(months) {
    var acc = {
      months: months, revenue: 0, employeeCost: 0, otherCost: 0, totalCost: 0, profit: 0,
      projectEmpCost: 0, internalEmpCost: 0, unallocatedEmpCost: 0, companyOtherCost: 0,
      projectContribution: 0, otherByCategory: {}
    };
    COST_GROUPS.forEach(function (c) { acc.otherByCategory[c] = 0; });
    acc.licenceCost = 0;
    months.forEach(function (m) {
      var c = rollup(m).company;
      acc.revenue += c.revenue; acc.employeeCost += c.employeeCost; acc.otherCost += c.otherCost;
      acc.totalCost += c.totalCost; acc.profit += c.profit;
      acc.projectEmpCost += c.projectEmpCost; acc.internalEmpCost += c.internalEmpCost;
      acc.unallocatedEmpCost += c.unallocatedEmpCost; acc.companyOtherCost += c.companyOtherCost;
      acc.projectContribution += c.projectContribution;
      COST_GROUPS.forEach(function (cat) { acc.otherByCategory[cat] += c.otherByCategory[cat] || 0; });
      acc.licenceCost += c.licenceCost || 0;
    });
    acc.margin = acc.revenue ? acc.profit / acc.revenue : 0;
    var last = months[months.length - 1];
    if (last) {
      var lc = rollup(last).company;
      acc.activeClients = lc.activeClients; acc.activeProjects = lc.activeProjects; acc.headcount = lc.headcount;
    }
    return acc;
  }

  function aggregateBy(months, dim) {
    // dim: 'client' | 'project'
    var out = {};
    months.forEach(function (m) {
      var r = rollup(m);
      var src = dim === 'client' ? r.byClient : r.byProject;
      Object.keys(src).forEach(function (id) {
        var row = src[id];
        if (!out[id]) out[id] = { id: id, name: row.name, clientId: row.clientId, billable: row.billable !== false, revenue: 0, empCost: 0, otherCost: 0, months: 0 };
        out[id].revenue += row.revenue; out[id].empCost += row.empCost;
        out[id].otherCost += row.otherCost; out[id].months++;
      });
    });
    return Object.keys(out).map(function (id) {
      var r = out[id];
      r.totalCost = r.empCost + r.otherCost;
      r.profit = r.revenue - r.totalCost;
      r.margin = r.revenue ? r.profit / r.revenue : 0;
      return r;
    });
  }

  /* ---------- period resolution --------------------------------------------- */
  function monthsFor(period, anchor, custom) {
    var i = mindex(anchor), p = mparse(anchor), out = [];
    function clamp(list) {
      return list.filter(function (m) { return MONTHS.indexOf(m) !== -1; });
    }
    switch (period) {
      case 'month': return [anchor];
      case 'prev': return clamp([maddMonths(anchor, -1)]);
      case 'quarter': {
        var qs = mindex(fiscalYearStart(anchor)) + Math.floor(fiscalOffset(anchor) / 3) * 3;
        for (var k = 0; k < 3; k++) out.push(mfromIndex(qs + k));
        return clamp(out);
      }
      case 'ytd': {
        var ys = mindex(fiscalYearStart(anchor));
        for (var m = ys; m <= i; m++) out.push(mfromIndex(m));
        return clamp(out);
      }
      case 'year': {
        var ys2 = mindex(fiscalYearStart(anchor));
        for (var m2 = 0; m2 < 12; m2++) out.push(mfromIndex(ys2 + m2));
        return clamp(out);
      }
      case 'trailing12': {
        for (var k2 = 11; k2 >= 0; k2--) out.push(mfromIndex(i - k2));
        return clamp(out);
      }
      case 'custom': {
        if (!custom) return [anchor];
        var a = Math.min(mindex(custom[0]), mindex(custom[1]));
        var b = Math.max(mindex(custom[0]), mindex(custom[1]));
        for (var j = a; j <= b; j++) out.push(mfromIndex(j));
        return clamp(out);
      }
      default: return [anchor];
    }
  }

  /* ---------- mutation (prototype data entry) ------------------------------- */
  function setRevenue(month, projectId, amount) {
    sync('setRevenue', { month: month, projectId: projectId, amount: +amount || 0 });
    snapshot(month).revenue[projectId] = Math.max(0, Math.round(amount));
    invalidate(month);
  }
  function addCost(month, projectId, category, amount) {
    sync('addCost', { month: month, projectId: projectId, category: category, amount: +amount || 0 });
    snapshot(month).other.push({ projectId: projectId || null, category: category, amount: Math.round(amount) });
    invalidate(month);
  }
  /* Apply to the working copy only. The allocation editor uses this while
     someone is dragging sliders, so the figures on screen move without a write
     - and without an audit row - behind every adjustment. setAllocation is the
     one that commits. */
  function setAllocationLocal(month, empId, map) {
    var total = Object.keys(map).reduce(function (t, k) { return t + (map[k] || 0); }, 0);
    if (total > 100) return { ok: false, error: 'Allocation totals ' + total + '%. Reduce it to 100% or less before saving.' };
    var clean = {};
    Object.keys(map).forEach(function (k) { if (map[k] > 0) clean[k] = map[k]; });
    snapshot(month).alloc[empId] = clean;
    invalidate(month);
    return { ok: true, total: total };
  }

  function setAllocation(month, empId, map) {
    sync('setAllocation', { month: month, employeeId: empId, map: map });
    var total = Object.keys(map).reduce(function (t, k) { return t + (map[k] || 0); }, 0);
    if (total > 100) return { ok: false, error: 'Allocation totals ' + total + '%. Reduce it to 100% or less before saving.' };
    var clean = {};
    Object.keys(map).forEach(function (k) { if (map[k] > 0) clean[k] = map[k]; });
    snapshot(month).alloc[empId] = clean;
    invalidate(month);
    return { ok: true, total: total };
  }
  // whole-month allocation snapshot — used for undo and for carrying a month forward
  function getAllocations(month) { return JSON.parse(JSON.stringify(snapshot(month).alloc)); }
  function setAllocations(month, alloc) {
    snapshot(month).alloc = alloc; invalidate(month);
    Object.keys(alloc).forEach(function (eid) { sync('setAllocation', { month: month, employeeId: eid, map: alloc[eid] }); });
  }
  function copyAllocations(from, to) {
    var src = snapshot(from).alloc, dst = {}, copied = 0, dropped = 0, skipped = 0;
    EMPLOYEES.forEach(function (e) {
      if (!isActiveEmp(e, to)) return;
      if (!isActiveEmp(e, from) || !src[e.id]) { skipped++; dst[e.id] = {}; return; }
      var line = {}, any = false;
      Object.keys(src[e.id]).forEach(function (k) {
        if (k === 'INTERNAL') { line.INTERNAL = src[e.id][k]; any = true; return; }
        var pr = PROJECTS.filter(function (x) { return x.id === k; })[0];
        if (pr && isActiveProj(pr, to)) { line[k] = src[e.id][k]; any = true; } else dropped++;
      });
      dst[e.id] = line;
      if (any) copied++;
    });
    setAllocations(to, dst);
    return { copied: copied, dropped: dropped, skipped: skipped };
  }

  // discard every session edit and rebuild the generated ledger
  function resetData() {
    Object.keys(STORE).forEach(function (k) { delete STORE[k]; });
    invalidate();
    MONTHS.forEach(snapshot);
  }

  function addEmployee(rec) {
    var id = 'E' + String(EMPLOYEES.length + 1).padStart(2, '0');
    EMPLOYEES.push({
      id: id, name: rec.name, title: rec.title, dept: rec.dept,
      baseCtc: rec.ctc, join: rec.join, disc: rec.disc || 'eng', pinned: true
    });
    MONTHS.forEach(function (m) {
      if (mindex(m) >= mindex(rec.join)) { snapshot(m).empCost[id] = rec.ctc / 12; snapshot(m).alloc[id] = {}; }
    });
    invalidate();
    sync('addEmployee', { id: id, name: rec.name, title: rec.title, dept: rec.dept,
                          ctc: rec.ctc, join: rec.join, disc: rec.disc || 'eng' })
      .then(function (r) {
        if (!r || !r.ok) return;
        MONTHS.forEach(function (m) {
          if (mindex(m) >= mindex(rec.join)) sync('setEmpCost', { month: m, employeeId: id, monthly: rec.ctc / 12 });
        });
      });
    return id;
  }


  /* ---------- administration: create, amend, retire, remove ----------------
     Amendments follow the product's rule — a change applies from the month
     you are standing in, and closed months keep what they closed with.
     Deletion is the one exception: it strips the record from every month,
     which is why the UI makes you confirm it separately from archiving.   */
  function nextId(list, prefix, width) {
    var max = 0;
    list.forEach(function (x) { var n = +String(x.id).slice(prefix.length); if (n > max) max = n; });
    return prefix + String(max + 1).padStart(width, '0');
  }
  function byId(list, id) { return list.filter(function (x) { return x.id === id; })[0] || null; }

  function addClient(rec) {
    var id = nextId(CLIENTS, 'C', 2);
    var row = { id: id, name: rec.name, industry: rec.industry || 'Professional services', since: rec.since || CURRENT_MONTH };
    CLIENTS.push(row);
    invalidate();
    sync('addClient', row);
    return id;
  }
  function updateClient(id, patch) {
    var c = byId(CLIENTS, id); if (!c) return false;
    ['name', 'industry', 'since'].forEach(function (k) { if (patch[k] != null) c[k] = patch[k]; });
    invalidate(); sync('updateClient', { id: id, patch: patch }); return true;
  }
  function clientProjects(id) { return PROJECTS.filter(function (p) { return p.clientId === id; }); }
  function deleteClient(id) {
    clientProjects(id).forEach(function (p) { deleteProject(p.id); });
    var i = CLIENTS.indexOf(byId(CLIENTS, id));
    if (i === -1) return false;
    CLIENTS.splice(i, 1); invalidate(); sync('deleteClient', { id: id }); return true;
  }

  function addProject(rec) {
    var id = nextId(PROJECTS, 'P', 2);
    PROJECTS.push({
      id: id, clientId: rec.clientId, name: rec.name, type: rec.type || 'Fixed project',
      billable: rec.billable !== false,
      baseRev: +rec.revenue || 0, health: 0.5, start: rec.start || CURRENT_MONTH,
      end: rec.end || null, disc: rec.disc || 'eng'
    });
    // seed the revenue the operator entered into the months the project runs
    var seeded = [];
    if (+rec.revenue && rec.billable !== false) {
      MONTHS.forEach(function (m) {
        if (mindex(m) >= mindex(rec.start || CURRENT_MONTH) && (!rec.end || mindex(m) <= mindex(rec.end))) {
          snapshot(m).revenue[id] = +rec.revenue; seeded.push(m);
        }
      });
    }
    invalidate();
    sync('addProject', { id: id, clientId: rec.clientId, name: rec.name, type: rec.type || 'Fixed project',
                         billable: rec.billable !== false, disc: rec.disc || 'eng',
                         start: rec.start || CURRENT_MONTH, end: rec.end || null })
      .then(function (r) {
        if (!r || !r.ok) return;
        seeded.forEach(function (m) { sync('setRevenue', { month: m, projectId: id, amount: +rec.revenue }); });
      });
    return id;
  }
  function updateProject(id, patch) {
    var p = byId(PROJECTS, id); if (!p) return false;
    ['name', 'type', 'clientId', 'start', 'end', 'disc', 'billable'].forEach(function (k) {
      if (patch[k] !== undefined) p[k] = patch[k];
    });
    invalidate(); sync('updateProject', { id: id, patch: patch }); return true;
  }
  function archiveProject(id, endMonth) {
    var p = byId(PROJECTS, id); if (!p) return false;
    p.end = endMonth; invalidate(); sync('updateProject', { id: id, patch: { end: endMonth } }); return true;
  }
  function deleteProject(id) {
    var p = byId(PROJECTS, id); if (!p) return false;
    MONTHS.forEach(function (m) {
      var snap = STORE[m]; if (!snap) return;
      delete snap.revenue[id];
      snap.other = snap.other.filter(function (o) { return o.projectId !== id; });
      Object.keys(snap.alloc).forEach(function (eid) { delete snap.alloc[eid][id]; });
    });
    /* a project's own licences go with it; company-wide ones are untouched */
    PROJECTS.splice(PROJECTS.indexOf(p), 1);
    invalidate(); sync('deleteProject', { id: id }); return true;
  }

  function updateEmployee(id, patch) {
    var e = byId(EMPLOYEES, id); if (!e) return false;
    ['name', 'title', 'dept', 'disc', 'join'].forEach(function (k) { if (patch[k] != null) e[k] = patch[k]; });
    invalidate(); sync('updateEmployee', { id: id, patch: patch }); return true;
  }
  // a pay change takes effect from a month forward; earlier months are untouched
  function setEmployeeCtc(id, ctc, fromMonth) {
    var e = byId(EMPLOYEES, id); if (!e) return false;
    e.pinned = true;
    MONTHS.forEach(function (m) {
      if (mindex(m) < mindex(fromMonth) || mindex(m) < mindex(e.join)) return;
      snapshot(m).empCost[id] = ctc / 12;
    });
    e.baseCtc = ctc;
    invalidate();
    /* The salary register, so the headline CTC survives a reload. Without this
       the monthly costs below moved and baseCtc came back from the server as
       the joining figure - the two disagreeing on the same person's pay. */
    sync('setEmployeeCtc', { employeeId: id, ctc: ctc, from: fromMonth });
    MONTHS.forEach(function (m) {
      if (mindex(m) < mindex(fromMonth) || mindex(m) < mindex(e.join)) return;
      sync('setEmpCost', { month: m, employeeId: id, monthly: ctc / 12 });
    });
    return true;
  }
  function deleteEmployee(id) {
    var e = byId(EMPLOYEES, id); if (!e) return false;
    MONTHS.forEach(function (m) {
      var snap = STORE[m]; if (!snap) return;
      delete snap.empCost[id]; delete snap.alloc[id];
    });
    EMPLOYEES.splice(EMPLOYEES.indexOf(e), 1);
    invalidate(); sync('deleteEmployee', { id: id }); return true;
  }

  /* ---------- backup and restore ------------------------------------------ */
  var BACKUP_VERSION = 2;   /* 2 adds period open/closed status */


  /* ---------- every cost line in a month, booked or derived ------------------
     The single source for cost registers and reports. Booked records come from
     the month's ledger; licence charges are derived from the register the same
     way the rollup derives them, so a register and its total always agree.  */
  function costLines(month) {
    var r = rollup(month), s = snapshot(month), out = [];
    s.other.forEach(function (o) {
      if (o.projectId && !r.byProject[o.projectId]) return;
      out.push({ projectId: o.projectId || null, category: o.category, amount: o.amount, source: 'booked', name: null });
    });
    (r.company.licences || []).forEach(function (l) {
      Object.keys(l.projects || {}).forEach(function (pid) {
        out.push({ projectId: pid, category: 'Software licences', amount: l.projects[pid], source: 'licence', name: l.name, licenceId: l.id, carriers: l.carriers, share: l.share });
      });
      if (l.company > 1e-9) out.push({ projectId: null, category: 'Software licences', amount: l.company, source: 'licence', name: l.name, licenceId: l.id, carriers: l.carriers, share: l.share });
    });
    return out;
  }

  /* ---------- licence register: create, amend, delete ----------------------- */
  function addLicence(rec) {
    var id = nextId(LICENCES, 'L', 2);
    var row = { id: id, name: rec.name, vendor: rec.vendor || '', price: +rec.price || 0, start: rec.start,
      months: Math.max(1, +rec.months || 1), note: rec.note || '' };
    LICENCES.push(row);
    invalidate(); sync('addLicence', row); return id;
  }
  function updateLicence(id, rec) {
    var l = byId(LICENCES, id); if (!l) return false;
    ['name', 'vendor', 'note', 'start'].forEach(function (k) { if (rec[k] != null) l[k] = rec[k]; });
    if (rec.price != null) l.price = +rec.price || 0;
    if (rec.months != null) l.months = Math.max(1, +rec.months || 1);
    invalidate(); sync('updateLicence', { id: id, patch: rec }); return true;
  }
  function deleteLicence(id) {
    var l = byId(LICENCES, id); if (!l) return false;
    LICENCES.splice(LICENCES.indexOf(l), 1); invalidate(); sync('deleteLicence', { id: id }); return true;
  }

  function exportState() {
    MONTHS.forEach(snapshot);
    return {
      format: 'codetoclick-profitability-backup',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      currentMonth: CURRENT_MONTH,
      mode: DATA_MODE,
      months: MONTHS.slice(),
      periods: MONTHS.map(function (m) {
        return { month: m, status: PERIOD_STATUS[m] === 'closed' ? 'closed' : 'open' };
      }),
      clients: JSON.parse(JSON.stringify(CLIENTS)),
      projects: JSON.parse(JSON.stringify(PROJECTS)),
      employees: JSON.parse(JSON.stringify(EMPLOYEES)),
      licences: JSON.parse(JSON.stringify(LICENCES)),
      ledger: JSON.parse(JSON.stringify(STORE))
    };
  }
  function importState(obj) {
    if (!obj || obj.format !== 'codetoclick-profitability-backup') {
      return { ok: false, error: 'That file is not a Code to Click backup.' };
    }
    if (+obj.version > BACKUP_VERSION) {
      return { ok: false, error: 'That backup was written by a newer version (v' + obj.version + ').' };
    }
    if (!Array.isArray(obj.clients) || !Array.isArray(obj.projects) || !Array.isArray(obj.employees) || !obj.ledger) {
      return { ok: false, error: 'The backup is missing one of clients, projects, employees or the ledger.' };
    }
    DATA_MODE = obj.mode === 'own' ? 'own' : 'demo';
    CLIENTS.length = 0; obj.clients.forEach(function (x) { CLIENTS.push(x); });
    PROJECTS.length = 0; obj.projects.forEach(function (x) { PROJECTS.push(x); });
    EMPLOYEES.length = 0; obj.employees.forEach(function (x) { EMPLOYEES.push(x); });
    if (Array.isArray(obj.licences)) { LICENCES.length = 0; obj.licences.forEach(function (x) { LICENCES.push(x); }); }
    Object.keys(STORE).forEach(function (k) { delete STORE[k]; });
    Object.keys(obj.ledger).forEach(function (k) { if (MONTHS.indexOf(k) !== -1) STORE[k] = obj.ledger[k]; });
    Object.keys(PERIOD_STATUS).forEach(function (k) { delete PERIOD_STATUS[k]; });
    if (Array.isArray(obj.periods)) {
      obj.periods.forEach(function (p) {
        if (p && p.month) PERIOD_STATUS[p.month] = p.status === 'closed' ? 'closed' : 'open';
      });
    }
    MONTHS.forEach(snapshot);
    invalidate();
    /* The database is the record. Without this the restore lived only in this
       tab and the next /api/state quietly replaced it with the old figures. */
    sync('restoreSnapshot', { snapshot: obj });
    return {
      ok: true,
      clients: CLIENTS.length, projects: PROJECTS.length, employees: EMPLOYEES.length,
      months: Object.keys(STORE).length
    };
  }

  function refill(list, seed) { list.length = 0; JSON.parse(JSON.stringify(seed)).forEach(function (x) { list.push(x); }); }
  function clearAll() {
    DATA_MODE = 'own';
    CLIENTS.length = 0; PROJECTS.length = 0; EMPLOYEES.length = 0; LICENCES.length = 0;
    Object.keys(STORE).forEach(function (k) { delete STORE[k]; });
    MONTHS.forEach(snapshot);
    invalidate();
  }
  function restoreDemo() {
    DATA_MODE = 'demo';
    refill(CLIENTS, SEED.clients); refill(PROJECTS, SEED.projects); refill(EMPLOYEES, SEED.employees); refill(LICENCES, SEED.licences);
    Object.keys(STORE).forEach(function (k) { delete STORE[k]; });
    MONTHS.forEach(snapshot);
    invalidate();
  }
  /* boot: pick up whatever this browser saved last time */
  /* No boot from browser storage any more. The app starts empty and the
     signed-in session fills it from /api/state - see App.auth.mount(). */

  root.CTC = {
    dataMode: dataMode, clearAll: clearAll, restoreDemo: restoreDemo, persistedAt: persistedAt, forgetPersisted: forgetPersisted,
    MONTHS: MONTHS, CURRENT_MONTH: CURRENT_MONTH, MONTH_NAMES: MONTH_NAMES, MONTH_ABBR: MONTH_ABBR,
    CLIENTS: CLIENTS, PROJECTS: PROJECTS, EMPLOYEES: EMPLOYEES, COST_CATEGORIES: COST_CATEGORIES, COST_GROUPS: COST_GROUPS,
    LICENCES: LICENCES, costLines: costLines, licenceCharge: licenceCharge, licenceActive: licenceActive, licenceEnd: licenceEnd, licencesFor: licencesFor,
    addLicence: addLicence, updateLicence: updateLicence, deleteLicence: deleteLicence,
    mkey: mkey, mparse: mparse, mlabel: mlabel, mshort: mshort, mabbr: mabbr,
    mindex: mindex, maddMonths: maddMonths, mquarter: mquarter,
    setFiscalStart: setFiscalStart, getFiscalStart: getFiscalStart,
    fiscalYearStart: fiscalYearStart, fiscalLabel: fiscalLabel, resetData: resetData,
    isActiveEmp: isActiveEmp, isActiveProj: isActiveProj, ctcAt: ctcAt,
    snapshot: snapshot, rollup: rollup, aggregate: aggregate, aggregateBy: aggregateBy,
    monthsFor: monthsFor, invalidate: invalidate,
    setRevenue: setRevenue, addCost: addCost, setAllocation: setAllocation,
    setAllocationLocal: setAllocationLocal, addEmployee: addEmployee,
    getAllocations: getAllocations, setAllocations: setAllocations, copyAllocations: copyAllocations,
    addClient: addClient, updateClient: updateClient, deleteClient: deleteClient, clientProjects: clientProjects,
    addProject: addProject, updateProject: updateProject, archiveProject: archiveProject, deleteProject: deleteProject,
    updateEmployee: updateEmployee, setEmployeeCtc: setEmployeeCtc, deleteEmployee: deleteEmployee,
    exportState: exportState, importState: importState, byId: byId,
    USERS: USERS, setOwnPassword: setOwnPassword, adminSetPassword: adminSetPassword,
    auditLog: auditLog,
    loadFromServer: loadFromServer, syncState: SYNC
  };
})(typeof window !== 'undefined' ? window : globalThis);
