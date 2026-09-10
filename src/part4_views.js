/* ============================================================================
   Screens. Every one of them reads CTC.rollup(month) — none does its own math.
   ========================================================================== */
(function (root) {
  'use strict';
  var C = root.CTC, U = root.UI;
  var money = U.money, moneyK = U.moneyK, pct = U.pct, esc = U.esc, el = U.el;
  var VIEWS = {};

  /* ---------- shared ---------------------------------------------------- */
  function frag() { return document.createDocumentFragment(); }
  function head(title, lede, actions, stampHtml) {
    var h = el('<div class="page-head"><div class="ph-top">' +
      '<div class="ph-main"><h1>' + esc(title) + '</h1>' +
      (lede ? '<div class="ph-sub">' + lede + '</div>' : '') + '</div>' +
      '<div class="ph-acts"></div></div></div>');
    if (stampHtml) h.querySelector('.ph-main').insertAdjacentHTML('afterbegin', stampHtml);
    if (actions) actions.forEach(function (a) { h.querySelector('.ph-acts').appendChild(a); });
    return h;
  }
  function section(title, note) {
    return el('<div class="section"><h2>' + esc(title) + '</h2><span class="rule"></span>' +
      (note ? '<span class="note">' + esc(note) + '</span>' : '') + '</div>');
  }
  function btn(label, cls, fn, iconId) {
    var b = el('<button class="btn ' + (cls || '') + '">' +
      (iconId ? U.icon(iconId) : '') + '<span>' + esc(label) + '</span></button>');
    b.addEventListener('click', fn); return b;
  }
  function trailing12(month) {
    var out = [];
    for (var i = 11; i >= 0; i--) { var m = C.maddMonths(month, -i); if (C.MONTHS.indexOf(m) !== -1) out.push(m); }
    return out;
  }
  function copyBtn(getRows) {
    return btn('Copy as TSV', 'btn-sm', function (e) {
      var txt = getRows().map(function (r) { return r.join('\t'); }).join('\n');
      navigator.clipboard.writeText(txt).then(function () {
        var b = e.target; var old = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = old; }, 1400);
      }, function () { });
    });
  }
  function projName(id) { var p = C.PROJECTS.filter(function (x) { return x.id === id; })[0]; return p ? p.name : id; }
  function clientOf(pid) {
    var p = C.PROJECTS.filter(function (x) { return x.id === pid; })[0];
    if (!p) return null;
    return C.CLIENTS.filter(function (c) { return c.id === p.clientId; })[0];
  }
  function empName(id) { var e = C.EMPLOYEES.filter(function (x) { return x.id === id; })[0]; return e ? e.name : id; }

  function periodBlock(s) {
    // s = App.state; returns {months, agg, prevAgg, label, isSingle}
    var months = C.monthsFor(s.period, s.month, s.custom);
    var agg = C.aggregate(months);
    var len = months.length;
    var prevMonths = [];
    var shift = (s.period === 'ytd' || s.period === 'year') ? 12 : len;
    months.forEach(function (m) { var p = C.maddMonths(m, -shift); if (C.MONTHS.indexOf(p) !== -1) prevMonths.push(p); });
    var prevAgg = prevMonths.length ? C.aggregate(prevMonths) : null;
    var label = len === 1 ? C.mlabel(months[0]) : C.mlabel(months[0]) + ' – ' + C.mlabel(months[len - 1]);
    var prevLabel = prevMonths.length ? (prevMonths.length === 1 ? C.mlabel(prevMonths[0]) : C.mlabel(prevMonths[0]) + ' – ' + C.mlabel(prevMonths[prevMonths.length - 1])) : null;
    return { months: months, agg: agg, prevAgg: prevAgg, label: label, prevLabel: prevLabel, isSingle: len === 1 };
  }

  function kpiStrip(p) {
    var a = p.agg, b = p.prevAgg;
    var vs = p.prevAgg ? ' vs ' + (p.isSingle ? C.mshort(C.maddMonths(p.months[0], -1)) : 'prior period') : '';
    var h = '<div class="kpis">';
    h += U.kpi('Revenue', moneyK(a.revenue), U.deltaChip(a.revenue, b && b.revenue) + '<span>' + vs + '</span>', true);
    h += U.kpi('Employee cost', moneyK(a.employeeCost), U.deltaChip(a.employeeCost, b && b.employeeCost, { inverse: true }) + '<span>' + pct(a.employeeCost / a.totalCost, 0) + ' of cost</span>');
    h += U.kpi('Other cost', moneyK(a.otherCost), U.deltaChip(a.otherCost, b && b.otherCost, { inverse: true }) + '<span>' + pct(a.otherCost / a.totalCost, 0) + ' of cost</span>');
    h += U.kpi('Total cost', moneyK(a.totalCost), U.deltaChip(a.totalCost, b && b.totalCost, { inverse: true }) + '<span>' + vs + '</span>');
    h += U.kpi('Gross profit', moneyK(a.profit), U.deltaChip(a.profit, b && b.profit) + '<span>' + vs + '</span>', true);
    h += U.kpi('Gross margin', pct(a.margin), U.deltaChip(a.margin, b && b.margin, { points: true }) + '<span>' + vs + '</span>');
    h += U.kpi('Unallocated employee cost', moneyK(a.unallocatedEmpCost), '<span>' + pct(a.unallocatedEmpCost / a.employeeCost) + ' of payroll on the bench</span>');
    h += '</div>';
    return el(h);
  }

  function scopeRow(month) {
    var c = C.rollup(month).company;
    return el('<div class="stat-line" style="margin:12px 2px 0">' +
      '<span>Active clients <b>' + c.activeClients + '</b></span>' +
      '<span>Active projects <b>' + c.activeProjects + '</b></span>' +
      '<span>Employees <b>' + c.headcount + '</b></span>' +
      '<span>Average employee cost <b>' + money(c.employeeCost / c.headcount) + '</b>/month</span>' +
      '</div>');
  }

  function reconPanel(a) {
    var body = el('<div class="recon">' +
      '<div class="r"><span>Project revenue</span><span>' + money(a.revenue) + '</span></div>' +
      '<div class="r neg"><span>Employee cost charged to projects</span><span>−' + money(a.projectEmpCost) + '</span></div>' +
      '<div class="r neg"><span>Other cost charged to projects</span><span>−' + money(a.otherCost - a.companyOtherCost) + '</span></div>' +
      '<div class="r total"><span>Project contribution</span><span>' + money(a.projectContribution) + '</span></div>' +
      '<div class="r neg" style="margin-top:8px"><span>Internal / non-billable time</span><span>−' + money(a.internalEmpCost) + '</span></div>' +
      '<div class="r neg"><span>Unallocated employee cost (bench)</span><span>−' + money(a.unallocatedEmpCost) + '</span></div>' +
      '<div class="r neg"><span>Company-level other cost</span><span>−' + money(a.companyOtherCost) + '</span></div>' +
      '<div class="r total"><span>Company gross profit</span><span>' + money(a.profit) + '</span></div>' +
      '</div>');
    var wrap = el('<div></div>');
    wrap.appendChild(el('<div class="callout" style="margin-bottom:14px">Project margins are always higher than the company margin, because a project only carries the cost that was actually booked to it. <strong>' +
      money(a.internalEmpCost + a.unallocatedEmpCost + a.companyOtherCost) + '</strong> of cost sits above the project line this period.</div>'));
    wrap.appendChild(body);
    return wrap;
  }

  /* ================= DASHBOARD ============================================ */
  /* An empty company gets a guided start instead of a page of zeros. */
  function gettingStarted(s) {
    var f = frag(), m = s.month;
    f.appendChild(head('Welcome to your company', 'Nothing is recorded yet. Work down the list — each step unlocks the next, and every figure in the product is computed from what you enter.'));
    var hasClient = C.CLIENTS.length > 0, hasProject = C.PROJECTS.length > 0, hasEmp = C.EMPLOYEES.length > 0;
    var anyRev = C.MONTHS.some(function (x) { var rv = C.snapshot(x).revenue; return Object.keys(rv).some(function (k) { return rv[k] > 0; }); });
    var anyAlloc = C.MONTHS.some(function (x) { var al = C.snapshot(x).alloc; return Object.keys(al).some(function (k) { return Object.keys(al[k]).length > 0; }); });
    var anyCost = C.MONTHS.some(function (x) { return C.snapshot(x).other.length > 0; }) || C.LICENCES.length > 0;
    var steps = [
      { n: 1, title: 'Add a client', body: 'Who you bill. Name, sector and the month the relationship began.', done: hasClient, ready: true, label: 'New client', go: function () { root.App.go('admin', { tab: 'clients' }); } },
      { n: 2, title: 'Add a project', body: 'Belongs to a client, has a revenue type, a start month and optionally an end month.', done: hasProject, ready: hasClient, label: 'New project', go: function () { root.App.go('admin', { tab: 'projects' }); } },
      { n: 3, title: 'Add people', body: 'Annual CTC and joining month. Monthly cost is CTC ÷ 12 from the month they join.', done: hasEmp, ready: true, label: 'New employee', go: function () { root.App.dialogs.employee(); } },
      { n: 4, title: 'Allocate people to projects', body: 'Percentages per month, never above 100%. Allocation × monthly cost is the cost charged to the project; the rest is bench.', done: anyAlloc, ready: hasEmp && hasProject, label: 'Open allocations', go: function () { root.App.go('allocations'); } },
      { n: 5, title: 'Book revenue', body: 'One figure per project per month. Use the sheet to fill a whole month at once.', done: anyRev, ready: hasProject, label: 'Revenue sheet', go: function () { root.App.dialogs.revenueSheet(m); } },
      { n: 6, title: 'Book other cost and licences', body: 'Cloud, contractors, travel — to a project or to the company. Licences are spread over their period, shared by everyone on payroll, and reach projects through allocation.', done: anyCost, ready: true, label: 'Book a cost', go: function () { root.App.dialogs.cost(); } }
    ];
    var list = el('<div class="gs"></div>');
    steps.forEach(function (st) {
      var row = el('<div class="gs-step' + (st.done ? ' done' : st.ready ? '' : ' wait') + '"><div class="gs-n">' + (st.done ? U.icon('check') : st.n) + '</div>' +
        '<div class="gs-txt"><strong>' + esc(st.title) + '</strong><span>' + esc(st.body) + '</span></div></div>');
      var b = btn(st.done ? 'Add another' : st.label, st.done || !st.ready ? 'btn-sm' : 'btn-primary btn-sm', st.go);
      if (!st.ready) { b.disabled = true; b.setAttribute('data-tip', 'Finish the earlier step first'); }
      row.appendChild(b); list.appendChild(row);
    });
    f.appendChild(U.panel('Six steps to a working ledger', 'Reporting month: ' + C.mlabel(m) + ' · use the month control at the top to record earlier months', list, true));
    var how = el('<div class="grid-2" style="margin-top:16px"></div>');
    how.appendChild(U.panel('How the numbers are built', null, el('<div class="recon">' +
      '<div class="r"><span>Employee monthly cost</span><span>annual CTC ÷ 12</span></div>' +
      '<div class="r"><span>Cost to a project</span><span>monthly cost × allocation %</span></div>' +
      '<div class="r"><span>Bench</span><span>monthly cost × (100% − allocated %)</span></div>' +
      '<div class="r"><span>Licence charge per month</span><span>price ÷ months ÷ headcount, then by allocation</span></div>' +
      '<div class="r"><span>Project profit</span><span>revenue − people − other cost</span></div>' +
      '<div class="r total"><span>Company profit</span><span>revenue − all payroll − all other cost</span></div>' +
      '<div class="r"><span>Margin</span><span>profit ÷ revenue</span></div></div>')));
    how.appendChild(U.panel('Bring the demo back', 'Administration → Backup & restore also takes and restores backup files',
      el('<div class="stack" style="gap:12px"><p class="muted" style="font-size:13px;margin:0">The sample company is one click away if you want reference figures to compare against, and every change you make here is saved in this browser automatically.</p></div>'),
      false, btn('Administration', 'btn-sm', function () { root.App.go('admin', { tab: 'backup' }); })));
    f.appendChild(how);
    return f;
  }

  VIEWS.dashboard = function (s) {
    if (C.dataMode() === 'own' && !C.CLIENTS.length && !C.PROJECTS.length && !C.EMPLOYEES.length) return gettingStarted(s);
    var f = frag(), p = periodBlock(s), a = p.agg, b = p.prevAgg;
    var t12 = trailing12(s.month);
    var vsShort = p.isSingle ? C.mshort(C.maddMonths(p.months[0], -1)) : 'prior period';
    var last = p.months[p.months.length - 1];
    var scope = C.rollup(last).company;

    f.appendChild(head('Monthly performance',
      esc(p.label) + (p.prevLabel ? ' &nbsp;&middot;&nbsp; measured against ' + esc(p.prevLabel) : ''),
      [btn('Open management report', 'btn-primary', function () { root.App.go('report-management'); }, 'arrow-right')],
      '<div class="ph-stamp' + (root.App.periodClosed ? ' closed' : '') + '"><span class="dotlive"></span>' +
      (root.App.periodClosed ? 'Closed period' : 'Current period') + ' &middot; ' + esc(C.mlabel(last)) + '</div>'));

    /* --- 1. headline metrics ---------------------------------------------
       Six cards, each with its own semantic accent, its own icon, and a
       twelve-month sparkline. Clicking a card opens the screen that explains
       it; hovering the sparkline reads the month out.                      */
    f.appendChild(section('Period summary', p.months.length + ' month' + (p.months.length > 1 ? 's' : '') + ' of records'));
    var series = function (k) { return t12.map(function (m) { return C.rollup(m).company[k]; }); };
    var sparkLabels = t12.map(function (m) { return C.mshort(m); });
    var spark = function (vals, colour, name, fmt) {
      return U.sparkline(vals, colour, 300, 44, { labels: sparkLabels, name: name, fmt: fmt || 'money' });
    };
    var go = function (route) { return function () { root.App.go(route); }; };

    var CARDS = [
      { kind: 'revenue', label: 'Revenue', value: moneyK(a.revenue),
        foot: U.deltaChip(a.revenue, b && b.revenue) + '<span>vs ' + vsShort + '</span>',
        spark: spark(series('revenue'), 'var(--m-revenue)', 'Revenue'), accent: true, route: 'revenue',
        tip: 'Revenue booked to projects in this period. Exact: ' + money(a.revenue) },
      { kind: 'people', label: 'Employee cost', value: moneyK(a.employeeCost),
        foot: U.deltaChip(a.employeeCost, b && b.employeeCost, { inverse: true }) +
          '<span>' + pct(a.employeeCost / a.totalCost, 0) + ' of cost</span>',
        spark: spark(series('employeeCost'), 'var(--m-people)', 'Employee cost'), route: 'empcost',
        tip: 'Total payroll for the period, from annual CTC ÷ 12. Exact: ' + money(a.employeeCost) },
      { kind: 'other', label: 'Other cost', value: moneyK(a.otherCost),
        foot: U.deltaChip(a.otherCost, b && b.otherCost, { inverse: true }) +
          '<span>' + pct(a.otherCost / a.totalCost, 0) + ' of cost</span>',
        spark: spark(series('otherCost'), 'var(--m-other)', 'Other cost'), route: 'costs',
        tip: 'Cloud, software, contractors, travel and overhead. Exact: ' + money(a.otherCost) },
      { kind: 'cost', label: 'Total cost', value: moneyK(a.totalCost),
        foot: U.deltaChip(a.totalCost, b && b.totalCost, { inverse: true }) + '<span>vs ' + vsShort + '</span>',
        spark: spark(series('totalCost'), 'var(--m-cost)', 'Total cost'), route: 'costs',
        tip: 'Employee cost plus other cost. Exact: ' + money(a.totalCost) },
      { kind: 'profit', label: 'Gross profit', value: moneyK(a.profit),
        foot: U.deltaChip(a.profit, b && b.profit) + '<span>vs ' + vsShort + '</span>',
        spark: spark(series('profit'), 'var(--m-profit)', 'Gross profit'), accent: true, route: 'profitability',
        tip: 'Revenue minus total cost. Exact: ' + money(a.profit) },
      { kind: 'margin', label: 'Gross margin', value: pct(a.margin),
        foot: U.deltaChip(a.margin, b && b.margin, { points: true }) + '<span>vs ' + vsShort + '</span>',
        spark: U.sparkline(t12.map(function (m) { return C.rollup(m).company.margin; }), 'var(--m-margin)',
          300, 44, { labels: sparkLabels, name: 'Gross margin', fmt: 'pct' }), route: 'profitability',
        tip: 'Gross profit ÷ revenue.' }
    ];
    var tiles = el('<div class="tiles"></div>');
    CARDS.forEach(function (c) {
      tiles.appendChild(U.tile({
        kind: c.kind, label: c.label, value: c.value, foot: c.foot, spark: c.spark,
        accent: c.accent, tip: c.tip, on: go(c.route)
      }));
    });
    f.appendChild(tiles);

    /* --- the counts that frame the money --------------------------------- */
    var pm = C.MONTHS.indexOf(last) > 0 ? C.rollup(C.MONTHS[C.MONTHS.indexOf(last) - 1]).company : null;
    var step = function (now, was, unit) {
      if (!was && was !== 0) return '';
      var d = now - was;
      if (!d) return '<span>no change</span>';
      return '<span class="delta ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '↑' : '↓') + ' ' +
        Math.abs(d) + '</span><span>vs last month</span>';
    };
    f.appendChild(el(U.sumStrip([
      { label: 'Active clients', value: scope.activeClients, foot: step(scope.activeClients, pm && pm.activeClients),
        tip: 'Clients with revenue booked in ' + C.mlabel(last) + '.' },
      { label: 'Active projects', value: scope.activeProjects, foot: step(scope.activeProjects, pm && pm.activeProjects),
        tip: 'Projects running in ' + C.mlabel(last) + '.' },
      { label: 'Employees', value: scope.headcount, foot: step(scope.headcount, pm && pm.headcount),
        tip: 'People on payroll in ' + C.mlabel(last) + '.' },
      { label: 'Avg employee cost', value: money(scope.employeeCost / scope.headcount), unit: '/ month',
        foot: '<span>across ' + scope.headcount + ' people</span>',
        tip: 'Total payroll ÷ headcount.' },
      { label: 'Unallocated payroll', value: moneyK(a.unallocatedEmpCost),
        foot: '<span class="delta ' + (a.unallocatedEmpCost / a.employeeCost > 0.08 ? 'down' : 'flat') + '">' +
          pct(a.unallocatedEmpCost / a.employeeCost) + '</span><span>of payroll</span>',
        tip: 'Payroll not yet assigned to a client or project. Exact: ' + money(a.unallocatedEmpCost) }
    ])));

    /* --- 2. the bridge ---------------------------------------------------- */
    f.appendChild(section('Profit bridge', 'Revenue to gross profit'));
    f.appendChild(U.panel('Where the money goes', 'Each step is a booked figure for ' + p.label + ' — nothing is apportioned', U.waterfall({
      height: 276,
      steps: [
        { label: 'Project revenue', value: a.revenue, kind: 'total' },
        { label: 'People on projects', value: -a.projectEmpCost, kind: 'sub', note: 'Payroll that reached a client project' },
        { label: 'Other project cost', value: -(a.otherCost - a.companyOtherCost), kind: 'sub', note: 'Cloud, software, contractors, travel' },
        { label: 'Project contribution', value: a.projectContribution, kind: 'total' },
        { label: 'Internal time', value: -a.internalEmpCost, kind: 'sub', note: 'Internal and non-billable project work' },
        { label: 'Bench', value: -a.unallocatedEmpCost, kind: 'sub', note: 'Payroll with nowhere to go' },
        { label: 'Company overhead', value: -a.companyOtherCost, kind: 'sub', note: 'Cost not booked to any project' },
        { label: 'Gross profit', value: a.profit, kind: 'total' }
      ],
      aria: 'Bridge from project revenue to company gross profit'
    })));

    /* --- 3. trends -------------------------------------------------------- */
    f.appendChild(section('Trends', 'Trailing twelve months'));
    var g = el('<div class="grid-2"></div>');
    g.appendChild(U.panel('Revenue, cost and profit', 'Select a month to make it the reporting month', U.lineChart({
      months: t12, height: 254, onClickMonth: function (m) { root.App.setMonth(m); },
      series: [
        { label: 'Revenue', color: 'var(--s1)', area: true, values: series('revenue') },
        { label: 'Total cost', color: 'var(--s2)', values: series('totalCost') },
        { label: 'Gross profit', color: 'var(--s3)', values: series('profit') }
      ],
      aria: 'Twelve month revenue, cost and profit'
    })));
    g.appendChild(U.panel('Gross margin', 'Percentage points, computed from each month’s own records', U.columnChart({
      months: t12, values: t12.map(function (m) { return C.rollup(m).company.margin; }), height: 254, label: 'Gross margin',
      tickFmt: function (v) { return (v * 100).toFixed(0) + '%'; }, tipFmt: function (v) { return pct(v); },
      colorFor: function () { return 'var(--s1)'; },
      opacityFor: function (v, i) { return t12[i] === s.month ? 1 : 0.4; },
      onClickMonth: function (m) { root.App.setMonth(m); }
    })));
    f.appendChild(g);

    /* --- 4. cost structure ------------------------------------------------ */
    f.appendChild(section('Cost structure', p.label));
    var cats = C.COST_GROUPS.map(function (c, i) {
      return { label: c, value: p.agg.otherByCategory[c] || 0, color: ['var(--s1)', 'var(--s3)', 'var(--s2)', 'var(--s4)', 'var(--s5)', 'var(--m-other)'][i] };
    });
    cats.unshift({ label: 'Employee cost', value: a.employeeCost, color: 'var(--text-3)' });
    var g2 = el('<div class="grid-2"></div>');
    g2.appendChild(U.panel('Total cost by type', money(a.totalCost) + ' booked', U.segbar(cats, a.totalCost, { aria: 'Cost composition' })));
    g2.appendChild(U.panel('Payroll by destination', money(a.employeeCost) + ' of employee cost', U.segbar([
      { label: 'Client projects', value: a.projectEmpCost, color: 'var(--s1)' },
      { label: 'Internal work', value: a.internalEmpCost, color: 'var(--s4)' },
      { label: 'Bench (unallocated)', value: a.unallocatedEmpCost, color: 'var(--s2)' }
    ], a.employeeCost, { aria: 'Where payroll went' })));
    f.appendChild(g2);

    /* --- 5. clients and projects ------------------------------------------ */
    f.appendChild(section('Clients and projects', p.label));
    var clients = C.aggregateBy(p.months, 'client').sort(function (x, y) { return y.revenue - x.revenue; }).slice(0, 6);
    var maxRev = clients.length ? clients[0].revenue : 0;
    var ct = U.table([
      { key: 'name', label: 'Client', cell: function (r) { return '<strong class="link">' + esc(r.name) + '</strong>'; } },
      { key: 'revenue', label: 'Revenue', num: true, cell: function (r) { return U.bullet(r.revenue, maxRev, 'var(--s1)'); } },
      { key: 'profit', label: 'Profit', num: true, cell: function (r) { return money(r.profit); } },
      { key: 'margin', label: 'Margin', num: true, cell: function (r) { return U.marginPill(r.margin); } }
    ], clients, { sortKey: 'revenue', onRow: function (r) { root.App.go('client', { id: r.id }); } });
    var projects = C.aggregateBy(p.months, 'project').filter(function (x) { return x.billable; }).sort(function (x, y) { return x.margin - y.margin; }).slice(0, 6);
    var pt = U.table([
      { key: 'name', label: 'Project', cell: function (r) { return '<strong class="link">' + esc(r.name) + '</strong><div class="muted" style="font-size:12px">' + esc((clientOf(r.id) || {}).name || '') + '</div>'; } },
      { key: 'revenue', label: 'Revenue', num: true, cell: function (r) { return money(r.revenue); } },
      { key: 'profit', label: 'Profit', num: true, cell: function (r) { return money(r.profit); } },
      { key: 'margin', label: 'Margin', num: true, cell: function (r) { return U.marginPill(r.margin); } }
    ], projects, { sortKey: 'margin', sortDir: 1, onRow: function (r) { root.App.go('project', { id: r.id }); } });
    var g3 = el('<div class="grid-2"></div>');
    g3.appendChild(U.panel('Largest clients by revenue', 'Top six', ct, true));
    g3.appendChild(U.panel('Weakest projects by margin', 'Lowest six', pt, true));
    f.appendChild(g3);

    /* --- 6. notes --------------------------------------------------------- */
    f.appendChild(section('Analysis', 'Derived from ' + p.label + ' records only'));
    var list = el('<div class="insight-list"></div>');
    insights(s, p).forEach(function (i) {
      list.appendChild(el('<div class="insight ' + (i.tone || '') + '"><span class="mark"></span><div><p>' + esc(i.text) + '</p>' +
        (i.why ? '<div class="why">' + esc(i.why) + '</div>' : '') + '</div></div>'));
    });
    var ip = el('<section class="panel"></section>');
    ip.appendChild(list);
    f.appendChild(ip);
    return f;
  };

  /* ---------- insights ---------------------------------------------------- */
  function insights(s, p) {
    var out = [], a = p.agg, b = p.prevAgg, m = p.months[p.months.length - 1];
    var r = C.rollup(m);
    if (!a.revenue && !a.totalCost) {
      out.push({ tone: '', text: 'No revenue or cost is booked in ' + p.label + ' yet.', why: 'Add a client and a project, then book revenue and allocate people to see the analysis.' });
      return out;
    }
    if (b && b.revenue && b.totalCost) {
      var rc = (a.revenue - b.revenue) / b.revenue * 100;
      out.push({ tone: rc >= 0 ? 'pos' : 'neg', text: 'Revenue ' + (rc >= 0 ? 'increased' : 'fell') + ' ' + Math.abs(rc).toFixed(1) + '% versus ' + p.prevLabel + ', from ' + money(b.revenue) + ' to ' + money(a.revenue) + '.' });
      var mp = (a.margin - b.margin) * 100;
      out.push({ tone: mp >= 0 ? 'pos' : 'neg', text: 'Gross margin moved ' + (mp >= 0 ? 'up' : 'down') + ' ' + Math.abs(mp).toFixed(1) + ' percentage points to ' + pct(a.margin) + '.', why: 'Cost grew ' + ((a.totalCost - b.totalCost) / b.totalCost * 100).toFixed(1) + '% while revenue grew ' + ((a.revenue - b.revenue) / b.revenue * 100).toFixed(1) + '%.' });
    }
    var projs = C.aggregateBy(p.months, 'project').filter(function (x) { return x.billable; });
    var worst = projs.slice().sort(function (x, y) { return x.margin - y.margin; })[0];
    if (worst) out.push({ tone: worst.margin < 0 ? 'neg' : 'warnc', text: worst.name + ' is the weakest active project at ' + pct(worst.margin) + ' margin on ' + money(worst.revenue) + ' of revenue.', why: 'Booked cost ' + money(worst.totalCost) + ' — ' + money(worst.empCost) + ' of it people.' });
    var below = projs.filter(function (x) { return x.margin < U.BANDS.watch; });
    if (below.length) out.push({ tone: 'warnc', text: below.length + ' project' + (below.length > 1 ? 's are' : ' is') + ' below the ' + pct(U.BANDS.watch, 0) + ' margin threshold, carrying ' + money(below.reduce(function (t, x) { return t + x.revenue; }, 0)) + ' of revenue between them.' });
    if (a.employeeCost) out.push({ tone: a.unallocatedEmpCost / a.employeeCost > 0.07 ? 'warnc' : '', text: money(a.unallocatedEmpCost) + ' of employee cost is unallocated — ' + pct(a.unallocatedEmpCost / a.employeeCost) + ' of payroll sitting on the bench.', why: 'A further ' + money(a.internalEmpCost) + ' went to internal, non-billable work.' });
    var clients = C.aggregateBy(p.months, 'client').sort(function (x, y) { return y.revenue - x.revenue; });
    if (clients[0] && a.revenue) out.push({ tone: '', text: clients[0].name + ' generated ' + money(clients[0].revenue) + ' — ' + pct(clients[0].revenue / a.revenue) + ' of all revenue, at ' + pct(clients[0].margin) + ' margin.', why: clients.length > 2 ? 'The top three clients are ' + pct((clients[0].revenue + clients[1].revenue + clients[2].revenue) / a.revenue) + ' of revenue: concentration risk worth watching.' : '' });
    if (a.employeeCost && a.totalCost) out.push({ tone: '', text: 'Employee cost is ' + pct(a.employeeCost / a.totalCost) + ' of total company cost; ' + pct(a.projectEmpCost / a.employeeCost) + ' of payroll reached a client project.' });
    var best = projs.slice().sort(function (x, y) { return y.margin - x.margin; })[0];
    if (best) out.push({ tone: 'pos', text: best.name + ' is the strongest at ' + pct(best.margin) + ' margin, contributing ' + money(best.profit) + '.' });
    return out;
  }
  function insightsPanel(s, p) {
    var list = el('<div class="insight-list"></div>');
    insights(s, p).forEach(function (i) {
      list.appendChild(el('<div class="insight ' + (i.tone || '') + '"><span class="mark"></span><div><p>' + esc(i.text) + '</p>' +
        (i.why ? '<div class="why">' + esc(i.why) + '</div>' : '') + '</div></div>'));
    });
    var pnl = U.panel('Management insights', 'Generated from ' + p.label + ' records only', list, true);
    pnl.style.marginTop = '16px';
    return pnl;
  }

  /* Revenue lives in part14_revenue.js: the editable month grid. */

  /* ================= COSTS ================================================ */
  VIEWS.costs = function (s) {
    var f = frag(), p = periodBlock(s);
    f.appendChild(head('Costs', 'Non-payroll cost by month, project and category — booked records plus each month’s share of software licences.',
      [btn('Add cost', 'btn-primary', function () { root.App.dialogs.cost(); })]));
    f.appendChild(filterBar(s, ['client', 'category'], function () { root.App.render(); }));

    var rows = [];
    p.months.forEach(function (m) {
      var r = C.rollup(m);
      C.costLines(m).forEach(function (o) {
        var proj = o.projectId ? r.byProject[o.projectId] : null;
        var cl = o.projectId ? clientOf(o.projectId) : null;
        rows.push({
          month: m, client: cl ? cl.name : 'Company-level', clientId: cl ? cl.id : null,
          project: proj ? proj.name : '— not project-specific', pid: o.projectId,
          category: o.category, amount: o.amount, source: o.source, name: o.name, licenceId: o.licenceId, carriers: o.carriers
        });
      });
    });
    var filtered = rows.filter(function (r) {
      return (!s.filters.client || r.clientId === s.filters.client) && (!s.filters.category || r.category === s.filters.category);
    });
    // collapse to one row per month/project/category
    var mapz = {};
    filtered.forEach(function (r) {
      var k = r.month + '|' + r.pid + '|' + r.category + '|' + (r.licenceId || '');
      if (!mapz[k]) mapz[k] = Object.assign({}, r); else mapz[k].amount += r.amount;
    });
    var list = Object.keys(mapz).map(function (k) { return mapz[k]; });
    var total = list.reduce(function (t, r) { return t + r.amount; }, 0);

    var cats = C.COST_GROUPS.map(function (c, i) {
      return { label: c, value: p.agg.otherByCategory[c] || 0, color: ['var(--s1)', 'var(--s3)', 'var(--s2)', 'var(--s4)', 'var(--s5)', 'var(--m-other)'][i],
        onClick: c === 'Software licences' ? function () { root.App.go('licences'); } : null };
    });
    var g = el('<div class="grid-2"></div>');
    g.appendChild(U.panel('Other cost by category', p.label + ' · total ' + money(p.agg.otherCost), U.breakdown(cats, p.agg.otherCost)));
    var t12 = trailing12(s.month);
    g.appendChild(U.panel('Employee cost vs other cost', 'Trailing twelve months', U.lineChart({
      months: t12, height: 210, onClickMonth: function (m) { root.App.setMonth(m); },
      series: [
        { label: 'Employee cost', color: 'var(--s1)', area: true, values: t12.map(function (m) { return C.rollup(m).company.employeeCost; }) },
        { label: 'Other cost', color: 'var(--s2)', values: t12.map(function (m) { return C.rollup(m).company.otherCost; }) }
      ]
    })));
    f.appendChild(g);

    var t = U.table([
      { key: 'month', label: 'Month', cell: function (r) { return '<span class="mono">' + C.mshort(r.month) + '</span>'; }, sortVal: function (r) { return C.mindex(r.month); } },
      { key: 'client', label: 'Client', cell: function (r) { return esc(r.client); } },
      { key: 'project', label: 'Project', cell: function (r) { return r.pid ? '<span class="link">' + esc(r.project) + '</span>' : '<span class="muted">' + esc(r.project) + '</span>'; } },
      { key: 'category', label: 'Category', cell: function (r) {
        return '<span class="tag">' + esc(r.category) + '</span>' + (r.source === 'licence' ? '<div class="muted" style="font-size:11px">' + esc(r.name) + (r.carriers ? ' · shared by ' + r.carriers : '') + '</div>' : ''); } },
      { key: 'source', label: 'Source', cell: function (r) { return r.source === 'licence' ? '<span class="pill neutral">Licence</span>' : '<span class="muted">Booked</span>'; } },
      { key: 'amount', label: 'Cost', num: true, cell: function (r) { return money(r.amount); } }
    ], list, {
      title: 'Cost records', subtitle: 'Code to Click · ' + p.label, exportName: 'Costs ' + p.label,
      sortKey: 'amount', onRow: function (r) { if (r.source === 'licence') root.App.go('licences'); else if (r.pid) root.App.go('project', { id: r.pid }); },
      foot: { month: list.length + ' records', amount: money(total) }
    });
    var pn = U.panel('Cost records', p.label, t, true);
    pn.style.marginTop = '16px';
    f.appendChild(pn);
    return f;
  };

  /* ================= EMPLOYEE COST ======================================== */
  VIEWS.empcost = function (s) {
    var f = frag(), m = s.month, r = C.rollup(m);
    f.appendChild(head('Employee cost', 'Annual CTC ÷ 12 = monthly cost. Allocation decides how much of it reaches a project. ' + esc(C.mlabel(m)) + '.'));
    var c = r.company;
    var h = '<div class="kpis">';
    h += U.kpi('Total employee cost', moneyK(c.employeeCost), '<span>' + c.headcount + ' employees</span>', true);
    h += U.kpi('Charged to projects', moneyK(c.projectEmpCost), '<span>' + pct(c.projectEmpCost / c.employeeCost) + ' of payroll</span>');
    h += U.kpi('Internal / non-billable', moneyK(c.internalEmpCost), '<span>' + pct(c.internalEmpCost / c.employeeCost) + ' of payroll</span>');
    h += U.kpi('Unallocated', moneyK(c.unallocatedEmpCost), '<span>' + pct(c.unallocatedEmpCost / c.employeeCost) + ' on the bench</span>');
    h += U.kpi('Software licences', moneyK(c.licenceCost), '<span>' + money(c.headcount ? c.licenceCost / c.headcount : 0) + ' per person</span>');
    h += U.kpi('Loaded cost', moneyK(c.employeeCost + c.licenceCost), '<span>payroll + software</span>', true);
    h += '</div>';
    f.appendChild(el(h));

    var rows = Object.keys(r.byEmployee).map(function (id) { return r.byEmployee[id]; });
    var byDept = {};
    rows.forEach(function (e) { byDept[e.dept] = (byDept[e.dept] || 0) + e.monthlyCost; });
    var deptRows = Object.keys(byDept).sort(function (a, b) { return byDept[b] - byDept[a]; }).map(function (d, i) {
      return { label: d, value: byDept[d], color: ['var(--s1)', 'var(--s3)', 'var(--s2)', 'var(--s4)', 'var(--axis)', 'var(--text-3)', 'var(--border-strong)'][i % 7] };
    });
    var byClient = {};
    Object.keys(r.byClient).forEach(function (cid) { byClient[cid] = r.byClient[cid].empCost; });
    var clientRows = Object.keys(byClient).sort(function (a, b) { return byClient[b] - byClient[a]; }).slice(0, 8).map(function (cid) {
      return { label: r.byClient[cid].name, value: byClient[cid], color: 'var(--s1)' };
    });
    var g = el('<div class="grid-2" style="margin-top:16px"></div>');
    g.appendChild(U.panel('Employee cost by department', C.mlabel(m), U.breakdown(deptRows, c.employeeCost)));
    g.appendChild(U.panel('Employee cost by client', 'Top 8 · ' + C.mlabel(m), U.breakdown(clientRows, c.employeeCost)));
    f.appendChild(g);

    var t = U.table([
      { key: 'name', label: 'Employee', cell: function (e) { return '<div class="name-cell"><strong class="link">' + esc(e.name) + '</strong><span class="tag">' + esc(e.dept) + '</span></div>'; } },
      { key: 'ctc', label: 'Annual CTC', num: true, cell: function (e) { return money(e.ctc); } },
      { key: 'monthlyCost', label: 'Payroll', num: true, cell: function (e) { return money(e.monthlyCost); } },
      { key: 'toolCost', label: 'Software', num: true, cell: function (e) { return e.toolCost > 0.005 ? '<span data-tip="' + esc(e.tools.map(function (t) { return t.name + ' ' + money(t.amount); }).join(' · ')) + '">' + money(e.toolCost) + '<div class="muted" style="font-size:11px">' + money(U.toolOnProjects(e)) + ' on projects</div></span>' : '<span class="muted">—</span>'; } },
      { key: 'loadedCost', label: 'Loaded cost', num: true, cell: function (e) { return '<strong>' + money(e.loadedCost) + '</strong>'; } },
      { key: 'projectCost', label: 'To projects', num: true, cell: function (e) { return money(e.projectCost); } },
      { key: 'internal', label: 'Internal', num: true, cell: function (e) { return e.internal ? money(e.internal) : '<span class="muted">—</span>'; } },
      { key: 'unallocated', label: 'Unallocated', num: true, cell: function (e) { return e.unallocated > 0.5 ? '<span style="color:var(--err)">' + money(e.unallocated) + '</span>' : '<span class="muted">—</span>'; } },
      {
        key: 'allocatedPct', label: 'Allocated', num: true, cell: function (e) {
          var st = e.allocatedPct >= 100 ? 'good' : e.allocatedPct > 100 ? 'crit' : 'watch';
          return '<span class="pill ' + st + '">' + e.allocatedPct + '%</span>';
        }
      }
    ], rows, {
      title: 'Employee cost register', subtitle: 'Code to Click · ' + C.mlabel(m), exportName: 'Employee cost ' + C.mlabel(m),
      sortKey: 'monthlyCost', onRow: function (e) { root.App.go('employee', { id: e.id }); },
      foot: {
        name: rows.length + ' employees', monthlyCost: money(c.employeeCost), toolCost: money(c.licenceCost), loadedCost: money(c.employeeCost + c.licenceCost), projectCost: money(c.projectEmpCost),
        internal: money(c.internalEmpCost), unallocated: money(c.unallocatedEmpCost)
      }
    });
    var pn = U.panel('Employee cost register', C.mlabel(m) + ' — one row per employee, one month', t, true);
    pn.style.marginTop = '16px';
    f.appendChild(pn);
    return f;
  };

  function allocStatus(e) {
    if (e.allocatedPct > 100) return '<span class="pill crit">✕ Over allocated</span>';
    if (e.allocatedPct === 100) return '<span class="pill good">✓ Fully allocated</span>';
    return '<span class="pill watch">⚠ ' + money(e.unallocated) + ' unallocated</span>';
  }

  /* ================= FILTER BAR =========================================== */
  function filterBar(s, keys, onChange) {
    var bar = el('<div class="filters"></div>');
    function sel(key, label, options, cur) {
      var w = el('<label class="field"><span>' + label + '</span><select></select></label>');
      var sl = w.querySelector('select');
      sl.appendChild(el('<option value="">All</option>'));
      options.forEach(function (o) {
        var op = el('<option value="' + esc(o.v) + '">' + esc(o.l) + '</option>');
        if (cur === o.v) op.selected = true;
        sl.appendChild(op);
      });
      sl.addEventListener('change', function () { s.filters[key] = sl.value; onChange(); });
      bar.appendChild(w);
    }
    if (keys.indexOf('client') !== -1) sel('client', 'Client', C.CLIENTS.map(function (c) { return { v: c.id, l: c.name }; }), s.filters.client);
    if (keys.indexOf('project') !== -1) sel('project', 'Project', C.PROJECTS.map(function (p) { return { v: p.id, l: p.name }; }), s.filters.project);
    if (keys.indexOf('type') !== -1) sel('type', 'Revenue type', ['Fixed project', 'Retainer', 'Time & materials', 'Milestone'].map(function (t) { return { v: t, l: t }; }), s.filters.type);
    if (keys.indexOf('category') !== -1) sel('category', 'Cost category', C.COST_CATEGORIES.map(function (t) { return { v: t, l: t }; }), s.filters.category);
    if (keys.indexOf('dept') !== -1) sel('dept', 'Department', dedupe(C.EMPLOYEES.map(function (e) { return e.dept; })).map(function (t) { return { v: t, l: t }; }), s.filters.dept);
    if (keys.indexOf('band') !== -1) sel('band', 'Margin band', [{ v: 'healthy', l: 'Healthy' }, { v: 'watch', l: 'Watch' }, { v: 'critical', l: 'Critical' }, { v: 'loss', l: 'Loss making' }], s.filters.band);
    var clear = btn('Clear filters', 'btn-sm', function () { s.filters = {}; onChange(); });
    clear.style.marginBottom = '1px';
    bar.appendChild(clear);
    return bar;
  }
  function dedupe(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

  root.VIEWS = VIEWS;
  root.VIEWHELP = {
    frag: frag, head: head, btn: btn, trailing12: trailing12, copyBtn: copyBtn, projName: projName,
    clientOf: clientOf, empName: empName, periodBlock: periodBlock, kpiStrip: kpiStrip,
    filterBar: filterBar, insights: insights, insightsPanel: insightsPanel, reconPanel: reconPanel, section: section,
    allocStatus: allocStatus, dedupe: dedupe
  };
})(typeof window !== 'undefined' ? window : globalThis);
