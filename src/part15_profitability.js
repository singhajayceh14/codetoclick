/* ============================================================================
   Profitability 360 — company, clients and projects on one screen.

   One page answers the questions a leadership team asks each month: are we
   making money, is it getting better, where does it come from, who is
   dragging it down, and how much of our payroll is actually earning. Every
   figure is a sum of monthly records over the reporting period; the tabs
   only change which layer is expanded, never the numbers.
   ========================================================================== */
(function (root) {
  'use strict';
  var C = root.CTC, U = root.UI, V = root.VIEWS, H = root.VIEWHELP;
  var money = U.money, moneyK = U.moneyK, pct = U.pct, esc = U.esc, el = U.el, icon = U.icon;
  var head = H.head, btn = H.btn, frag = H.frag, section = H.section;

  var tab = 'company';                 // company | clients | projects — survives re-renders
  var matrixSort = 'revenue';

  function deltaPts(a, b) { return b == null ? '' : U.deltaChip(a, b, { points: true }); }

  /* ---------- the numbers behind the page ---------------------------------- */
  function compute(s) {
    var p = H.periodBlock(s), a = p.agg, b = p.prevAgg, ms = p.months, last = ms[ms.length - 1];
    var heads = ms.map(function (m) { return C.rollup(m).company.headcount; });
    var avgHead = heads.reduce(function (t, x) { return t + x; }, 0) / (ms.length || 1);
    var clients = C.aggregateBy(ms, 'client').sort(function (x, y) { return y.revenue - x.revenue; });
    var projects = C.aggregateBy(ms, 'project');
    var billable = projects.filter(function (x) { return x.billable; });
    var costCentres = projects.filter(function (x) { return !x.billable; });
    var bands = { healthy: [], watch: [], critical: [], loss: [] };
    billable.forEach(function (x) { bands[U.band(x.margin).key].push(x); });
    var top1 = clients[0], top3 = clients.slice(0, 3).reduce(function (t, x) { return t + x.revenue; }, 0);
    var t12 = H.trailing12(last);
    var series = function (k) { return t12.map(function (m) { return C.rollup(m).company[k]; }); };
    return {
      p: p, a: a, b: b, ms: ms, last: last, avgHead: avgHead, clients: clients, projects: projects, billable: billable, costCentres: costCentres, bands: bands,
      util: a.employeeCost ? a.projectEmpCost / a.employeeCost : 0,
      utilPrev: b && b.employeeCost ? b.projectEmpCost / b.employeeCost : null,
      bench: a.employeeCost ? a.unallocatedEmpCost / a.employeeCost : 0,
      benchPrev: b && b.employeeCost ? b.unallocatedEmpCost / b.employeeCost : null,
      revPerHead: avgHead ? a.revenue / ms.length / avgHead : 0,
      profitPerHead: avgHead ? a.profit / ms.length / avgHead : 0,
      conc1: a.revenue && top1 ? top1.revenue / a.revenue : 0, conc3: a.revenue ? top3 / a.revenue : 0, top1: top1,
      t12: t12, series: series
    };
  }

  /* ---------- decision strip ------------------------------------------------- */
  function decisionStrip(d) {
    var a = d.a, b = d.b, vs = b ? (d.p.isSingle ? 'vs ' + C.mshort(C.maddMonths(d.ms[0], -1)) : 'vs prior period') : '';
    var cells = [
      { label: 'Revenue', value: moneyK(a.revenue), foot: U.deltaChip(a.revenue, b && b.revenue) + ' ' + vs, tip: 'Exact: ' + money(a.revenue) },
      { label: 'Gross profit', value: moneyK(a.profit), foot: U.deltaChip(a.profit, b && b.profit) + ' ' + vs, tip: 'Revenue − all payroll − all other cost. Exact: ' + money(a.profit) },
      { label: 'Gross margin', value: pct(a.margin), foot: deltaPts(a.margin, b && b.margin) + ' <span class="pill ' + U.band(a.margin).cls + '">' + U.band(a.margin).label + '</span>', tip: 'Profit ÷ revenue' },
      { label: 'Billable utilisation', value: pct(d.util), foot: deltaPts(d.util, d.utilPrev) + ' of payroll on client projects', tip: 'Payroll allocated to billable projects ÷ total payroll. Internal time, non-billable projects and bench are the rest.' },
      { label: 'Bench', value: pct(d.bench), foot: money(a.unallocatedEmpCost) + ' unallocated', tip: 'Payroll with no allocation at all — the first place to look when margin slips.' },
      { label: 'Revenue per head', value: money(Math.round(d.revPerHead)), unit: '/ month', foot: 'across ' + d.avgHead.toFixed(1) + ' people on average', tip: 'Monthly revenue ÷ average headcount in the period' },
      { label: 'Profit per head', value: money(Math.round(d.profitPerHead)), unit: '/ month', foot: money(Math.round(a.employeeCost / (d.ms.length || 1) / (d.avgHead || 1))) + ' payroll per head', tip: 'Monthly gross profit ÷ average headcount' },
      { label: 'Client concentration', value: pct(d.conc1, 0), foot: (d.top1 ? esc(d.top1.name) + ' · top 3 = ' + pct(d.conc3, 0) : '—'), tip: 'Share of revenue from the largest client. Above 30–35% is a dependency worth managing.' }
    ];
    var n = el(U.sumStrip(cells)); n.classList.add('four'); return n;
  }

  /* ---------- layer 1: company ---------------------------------------------- */
  function companyLayer(d) {
    var f = frag(), a = d.a;
    var g = el('<div class="grid-2"></div>');
    g.appendChild(U.panel('Revenue, cost and profit', 'Trailing twelve months to ' + C.mshort(d.last) + ' · click a month to open it', U.lineChart({
      months: d.t12, height: 240, onClickMonth: function (m) { root.App.setMonth(m); },
      series: [
        { label: 'Revenue', color: 'var(--s1)', area: true, values: d.series('revenue') },
        { label: 'Total cost', color: 'var(--s2)', values: d.series('totalCost') },
        { label: 'Gross profit', color: 'var(--s3)', values: d.series('profit') }
      ]
    })));
    g.appendChild(U.panel('Where the money goes', d.p.label, U.waterfall({
      height: 240,
      steps: [
        { label: 'Revenue', value: a.revenue, kind: 'total' },
        { label: 'Project people', value: -a.projectEmpCost, kind: 'sub', note: 'Payroll on billable projects' },
        { label: 'Project cost', value: -(a.otherCost - a.companyOtherCost), kind: 'sub', note: 'Cloud, contractors, travel, licences' },
        { label: 'Idle payroll', value: -(a.internalEmpCost + a.unallocatedEmpCost), kind: 'sub', note: 'Internal ' + money(a.internalEmpCost) + ' + bench ' + money(a.unallocatedEmpCost) },
        { label: 'Overhead', value: -a.companyOtherCost, kind: 'sub', note: 'Company-level cost' },
        { label: 'Profit', value: a.profit, kind: 'total' }
      ]
    })));
    f.appendChild(g);

    /* margin trend with the bands drawn in */
    var mg = el('<div class="grid-2" style="margin-top:16px"></div>');
    var margins = d.t12.map(function (m) { return C.rollup(m).company.margin; });
    mg.appendChild(U.panel('Gross margin by month', 'Healthy ≥ ' + pct(U.BANDS.healthy, 0) + ' · watch ' + pct(U.BANDS.watch, 0) + '–' + pct(U.BANDS.healthy, 0) + ' · critical below', U.columnChart({
      months: d.t12, values: margins, label: 'Margin', height: 200,
      tickFmt: function (v) { return (v * 100).toFixed(0) + '%'; }, tipFmt: function (v) { return pct(v); },
      colorFor: function (v) { return v < 0 ? 'var(--err)' : v < U.BANDS.watch ? 'var(--s2)' : v < U.BANDS.healthy ? 'var(--s1)' : 'var(--s3)'; },
      onClickMonth: function (m) { root.App.setMonth(m); }
    })));
    /* payroll destination: the utilisation story in one bar */
    var pay = [
      { label: 'Client projects', value: a.projectEmpCost, color: 'var(--s1)' },
      { label: 'Internal & non-billable', value: a.internalEmpCost, color: 'var(--s4)' },
      { label: 'Bench', value: a.unallocatedEmpCost, color: 'var(--m-other)' }
    ];
    var payBox = el('<div></div>');
    payBox.appendChild(U.segbar(pay, a.employeeCost, { aria: 'Payroll by destination' }));
    payBox.appendChild(el('<div class="recon" style="margin-top:14px">' +
      '<div class="r"><span>Payroll</span><span>' + money(a.employeeCost) + '</span></div>' +
      '<div class="r"><span>Software licences carried by people</span><span>' + money(a.licenceCost || 0) + '</span></div>' +
      '<div class="r"><span>Cost centres (non-billable projects)</span><span>' + money(d.costCentres.reduce(function (t, x) { return t + x.totalCost; }, 0)) + '</span></div>' +
      '<div class="r total"><span>Every $1 of payroll earned</span><span>' + (a.employeeCost ? '$' + (a.revenue / a.employeeCost).toFixed(2) : '—') + '</span></div></div>'));
    mg.appendChild(U.panel('Payroll by destination', pct(d.util) + ' of payroll reached a client project in ' + d.p.label, payBox));
    f.appendChild(mg);

    /* the same ladder as the project tables, at company level */
    var pl = el('<div class="recon">' +
      '<div class="r"><span>Revenue</span><span>' + money(a.revenue) + '</span></div>' +
      '<div class="r neg"><span>Employee cost (all payroll)</span><span>−' + money(a.employeeCost) + '</span></div>' +
      '<div class="r total"><span>Contribution after people · ' + pct(a.revenue ? (a.revenue - a.employeeCost) / a.revenue : 0) + ' people margin</span><span>' + money(a.revenue - a.employeeCost) + '</span></div>' +
      '<div class="r neg"><span>Other cost (projects + overhead)</span><span>−' + money(a.otherCost) + '</span></div>' +
      '<div class="r total"><span>Profit · ' + pct(a.margin) + ' margin</span><span>' + money(a.profit) + '</span></div></div>');
    var plg = el('<div class="grid-2" style="margin-top:16px"></div>');
    plg.appendChild(U.panel('Company ladder', d.p.label + ' · the project columns, summed for the whole company', pl));
    var pm12 = d.t12.map(function (m) { var c = C.rollup(m).company; return c.revenue ? (c.revenue - c.employeeCost) / c.revenue : 0; });
    plg.appendChild(U.panel('People margin by month', 'Revenue less all payroll, ÷ revenue · the gap to gross margin is other cost', U.columnChart({
      months: d.t12, values: pm12, label: 'People margin', height: 200,
      tickFmt: function (v) { return (v * 100).toFixed(0) + '%'; }, tipFmt: function (v) { return pct(v); },
      colorFor: function () { return 'var(--m-people)'; }, onClickMonth: function (m) { root.App.setMonth(m); }
    })));
    f.appendChild(plg);

    /* quarters and year-to-date, summed from months */
    var groups = {}, order = [];
    C.MONTHS.forEach(function (m) { var k = C.fiscalLabel(m) + ' Q' + C.mquarter(m); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(m); });
    var qrows = order.map(function (k) { var ms2 = groups[k], q = C.aggregate(ms2); return { label: k, months: ms2.length, revenue: q.revenue, totalCost: q.totalCost, profit: q.profit, margin: q.margin, ms: ms2 }; });
    var cols = [
      { key: 'label', label: 'Period', cell: function (r) { return '<strong>' + esc(r.label) + '</strong><div class="muted" style="font-size:11px">' + r.months + ' month' + (r.months === 1 ? '' : 's') + '</div>'; } },
      { key: 'revenue', label: 'Revenue', num: true, cell: function (r) { return money(r.revenue); } },
      { key: 'totalCost', label: 'Total cost', num: true, cell: function (r) { return money(r.totalCost); } },
      { key: 'profit', label: 'Profit', num: true, cell: function (r) { return '<strong>' + money(r.profit) + '</strong>'; } },
      { key: 'margin', label: 'Margin', num: true, cell: function (r) { return U.marginPill(r.margin); } }
    ];
    var qt = U.table(cols, qrows, { sortKey: 'label', sortDir: 1, bar: false, pageSize: 0, onRow: function (r) { root.App.setMonth(r.ms[r.ms.length - 1]); root.App.setPeriod('quarter'); } });
    var starts = [];
    C.MONTHS.forEach(function (m) { var st = C.fiscalYearStart(m); if (starts.indexOf(st) === -1) starts.push(st); });
    var span = C.mindex(d.last) - C.mindex(C.fiscalYearStart(d.last));
    var yrows = starts.map(function (st) {
      var ms2 = []; for (var i = 0; i <= span; i++) { var m = C.maddMonths(st, i); if (C.MONTHS.indexOf(m) !== -1) ms2.push(m); }
      if (!ms2.length) return null; var q = C.aggregate(ms2);
      return { label: C.fiscalLabel(st) + ' · ' + C.mabbr(ms2[0]) + '–' + C.mabbr(ms2[ms2.length - 1]), months: ms2.length, revenue: q.revenue, totalCost: q.totalCost, profit: q.profit, margin: q.margin, ms: ms2 };
    }).filter(Boolean);
    var yt = U.table(cols, yrows, { sortKey: 'label', sortDir: 1, bar: false, pageSize: 0 });
    var qg = el('<div class="grid-2" style="margin-top:16px"></div>');
    qg.appendChild(U.panel('Quarters', 'Financial year starts in ' + C.MONTH_NAMES[C.getFiscalStart() - 1] + ' · click one to report on it', qt, true));
    qg.appendChild(U.panel('Year to date', 'Like-for-like months against the same point in earlier years', yt, true));
    f.appendChild(qg);
    return f;
  }

  /* ---------- layer 2: clients ----------------------------------------------- */
  function clientLayer(d) {
    var f = frag(), a = d.a, clients = d.clients;
    var maxRev = Math.max.apply(null, clients.map(function (c) { return c.revenue; }).concat([1]));
    var trend = function (cid) { return U.sparkline(d.t12.map(function (m) { var r = C.rollup(m).byClient[cid]; return r ? r.margin : 0; }), 'var(--m-margin)', 72, 22); };
    var t = U.table([
      { key: 'name', label: 'Client', cell: function (c) { return '<strong class="link">' + esc(c.name) + '</strong><div class="muted" style="font-size:11px">' + (C.byId(C.CLIENTS, c.id) || {}).industry + '</div>'; } },
      { key: 'revenue', label: 'Revenue', num: true, cell: function (c) { return U.bullet(c.revenue, maxRev, 'var(--m-revenue)', money(c.revenue)); } },
      { key: 'share', label: 'Share', num: true, sortVal: function (c) { return c.revenue; }, cell: function (c) { var sh = a.revenue ? c.revenue / a.revenue : 0; return '<span class="' + (sh > 0.3 ? 'bad' : '') + '">' + pct(sh, 0) + '</span>'; } },
      { key: 'empCost', label: 'Employee cost', num: true, cell: function (c) { return money(c.empCost); } },
      { key: 'afterPeople', label: 'Contribution after people', num: true, sortVal: function (c) { return c.revenue - c.empCost; }, cell: function (c) { return money(c.revenue - c.empCost); } },
      { key: 'peopleMargin', label: 'People margin', num: true, sortVal: function (c) { return c.revenue ? (c.revenue - c.empCost) / c.revenue : -9; }, cell: function (c) { return c.revenue ? pct((c.revenue - c.empCost) / c.revenue) : '—'; } },
      { key: 'otherCost', label: 'Other cost', num: true, cell: function (c) { return money(c.otherCost); } },
      { key: 'profit', label: 'Profit', num: true, cell: function (c) { return '<strong class="' + (c.profit < 0 ? 'bad' : '') + '">' + money(c.profit) + '</strong>'; } },
      { key: 'margin', label: 'Margin', num: true, cell: function (c) { return U.marginPill(c.margin); } },
      { key: 'trend', label: 'Margin trend', sortable: false, noExport: true, cell: function (c) { return trend(c.id); } },
      { key: 'n', label: 'Projects', num: true, sortVal: function (c) { return d.projects.filter(function (x) { return x.clientId === c.id; }).length; },
        cell: function (c) { var ps = d.projects.filter(function (x) { return x.clientId === c.id; }); var weak = ps.filter(function (x) { return x.billable && x.margin < U.BANDS.watch; }).length; return ps.length + (weak ? ' <span class="bad" data-tip="' + weak + ' below the watch line">· ' + weak + ' weak</span>' : ''); } }
    ], clients, {
      title: 'Client profitability', subtitle: 'Code to Click · ' + d.p.label, exportName: 'Client profitability ' + d.p.label, sortKey: 'profit', search: false, pageSize: 0,
      onRow: function (c) { root.App.go('client', { id: c.id }); },
      foot: (function () { var e = clients.reduce(function (t2, c) { return t2 + c.empCost; }, 0), o = clients.reduce(function (t2, c) { return t2 + c.otherCost; }, 0);
        return { name: clients.length + ' clients', revenue: money(a.revenue), empCost: money(e), afterPeople: money(a.revenue - e), peopleMargin: a.revenue ? pct((a.revenue - e) / a.revenue) : '—', otherCost: money(o), profit: money(a.revenue - e - o) }; })(),
      empty: 'No client had an active project in ' + esc(d.p.label) + '.'
    });
    f.appendChild(U.panel('Clients ranked', d.p.label + ' · revenue bar is relative to the largest client · share above 30% is flagged', t, true));

    /* revenue vs margin: who is big and who is good */
    var g = el('<div class="grid-2" style="margin-top:16px"></div>');
    var quad = el('<div class="quad"></div>');
    var medRev = clients.length ? clients[Math.floor(clients.length / 2)].revenue : 0;
    var Q = [['Large & healthy', 'Protect and grow', function (c) { return c.revenue >= medRev && c.margin >= U.BANDS.healthy; }, 'good'],
             ['Large & thin', 'Reprice or re-staff — biggest lever on company margin', function (c) { return c.revenue >= medRev && c.margin < U.BANDS.healthy; }, 'watch'],
             ['Small & healthy', 'Expand the relationship', function (c) { return c.revenue < medRev && c.margin >= U.BANDS.healthy; }, 'neutral'],
             ['Small & thin', 'Fix the scope or let go', function (c) { return c.revenue < medRev && c.margin < U.BANDS.healthy; }, 'crit']];
    Q.forEach(function (q) {
      var list = clients.filter(q[2]);
      var box = el('<div class="quad-cell"><div class="quad-head"><span class="pill ' + q[3] + '">' + list.length + '</span><strong>' + q[0] + '</strong><span class="muted">' + q[1] + '</span></div><div class="quad-list"></div></div>');
      var ul = box.querySelector('.quad-list');
      if (!list.length) ul.appendChild(el('<span class="muted" style="font-size:12px">None</span>'));
      list.slice(0, 6).forEach(function (c) {
        var row = el('<button type="button" class="quad-row"><span>' + esc(c.name) + '</span><span class="mono muted">' + moneyK(c.revenue) + '</span>' + U.marginPill(c.margin) + '</button>');
        row.addEventListener('click', function () { root.App.go('client', { id: c.id }); }); ul.appendChild(row);
      });
      if (list.length > 6) ul.appendChild(el('<span class="muted" style="font-size:12px">+ ' + (list.length - 6) + ' more</span>'));
      quad.appendChild(box);
    });
    g.appendChild(U.panel('Size against margin', 'Split at the median client (' + money(medRev) + ') and the healthy line (' + pct(U.BANDS.healthy, 0) + ')', quad, true));

    /* concentration */
    var conc = el('<div></div>');
    var top = clients.slice(0, 5), rest = clients.slice(5);
    var rows = top.map(function (c, i) { return { label: c.name, value: c.revenue, color: ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'][i] }; });
    if (rest.length) rows.push({ label: rest.length + ' other clients', value: rest.reduce(function (t2, c) { return t2 + c.revenue; }, 0), color: 'var(--text-3)' });
    conc.appendChild(U.segbar(rows, a.revenue, { aria: 'Revenue concentration' }));
    conc.appendChild(el('<div class="callout" style="margin-top:14px;font-size:13px">' +
      (d.conc1 > 0.35 ? '<strong>' + esc(d.top1.name) + ' is ' + pct(d.conc1, 0) + ' of revenue.</strong> Losing them would take the period to ' + money(a.revenue - d.top1.revenue) + ' revenue and ' + money(a.profit - d.top1.profit) + ' profit.'
        : d.conc3 > 0.6 ? '<strong>Top three clients are ' + pct(d.conc3, 0) + ' of revenue.</strong> Healthy for a small firm, but a second tier is worth building.'
        : 'Revenue is well spread — no client above ' + pct(d.conc1, 0) + '.') + '</div>'));
    g.appendChild(U.panel('Revenue concentration', 'Largest five clients and the rest', conc));
    f.appendChild(g);
    return f;
  }

  /* ---------- layer 3: projects ---------------------------------------------- */
  function projectLayer(d) {
    var f = frag(), a = d.a, bands = d.bands;
    var B = [['healthy', 'Healthy', 'good'], ['watch', 'Watch', 'watch'], ['critical', 'Critical', 'crit'], ['loss', 'Loss making', 'loss']];
    f.appendChild(el(U.sumStrip(B.map(function (b) {
      var list = bands[b[0]], rev = list.reduce(function (t, x) { return t + x.revenue; }, 0), pr = list.reduce(function (t, x) { return t + x.profit; }, 0);
      return { label: b[1], value: '<span class="pill ' + b[2] + '">' + list.length + '</span> ' + moneyK(rev), foot: (a.revenue ? pct(rev / a.revenue, 0) : '0%') + ' of revenue · ' + money(pr) + ' profit' };
    }).concat([{ label: 'Cost centres', value: String(d.costCentres.length), foot: money(d.costCentres.reduce(function (t, x) { return t + x.totalCost; }, 0)) + ' non-billable cost' }]))));

    /* watch list with the reason */
    var weak = d.billable.filter(function (x) { return x.margin < U.BANDS.watch; }).sort(function (x, y) { return x.profit - y.profit; });
    var why = function (x) {
      var people = x.revenue ? x.empCost / x.revenue : 1, other = x.revenue ? x.otherCost / x.revenue : 1;
      if (!x.revenue) return 'No revenue booked against ' + money(x.totalCost) + ' of cost';
      if (people > 0.6 && other > 0.25) return 'Both people (' + pct(people, 0) + ' of revenue) and other cost (' + pct(other, 0) + ') are heavy';
      if (people > 0.6) return 'Over-staffed for its revenue: people are ' + pct(people, 0) + ' of revenue';
      if (other > 0.25) return 'Other cost is ' + pct(other, 0) + ' of revenue — check contractors, cloud and licences';
      return 'Thin margin on ' + money(x.revenue) + ' of revenue';
    };
    var wt = U.table([
      { key: 'name', label: 'Project', cell: function (x) { return '<strong class="link">' + esc(x.name) + '</strong><div class="muted" style="font-size:11px">' + esc((H.clientOf(x.id) || {}).name || '') + '</div>'; } },
      { key: 'revenue', label: 'Revenue', num: true, cell: function (x) { return money(x.revenue); } },
      { key: 'peopleMargin', label: 'People margin', num: true, sortVal: function (x) { return x.revenue ? (x.revenue - x.empCost) / x.revenue : -9; }, cell: function (x) { return x.revenue ? pct((x.revenue - x.empCost) / x.revenue) + '<div class="muted" style="font-size:11px">' + money(x.revenue - x.empCost) + ' after people</div>' : '—'; } },
      { key: 'profit', label: 'Profit', num: true, cell: function (x) { return '<strong class="' + (x.profit < 0 ? 'bad' : '') + '">' + money(x.profit) + '</strong>'; } },
      { key: 'margin', label: 'Margin', num: true, cell: function (x) { return U.marginPill(x.margin); } },
      { key: 'gap', label: 'To reach ' + pct(U.BANDS.healthy, 0), num: true, sortVal: function (x) { return x.revenue * U.BANDS.healthy - x.profit; },
        cell: function (x) { var gap = x.revenue * U.BANDS.healthy - x.profit; return gap > 0 ? '<span class="bad">' + money(gap) + '</span><div class="muted" style="font-size:11px">less cost, or more revenue</div>' : '—'; } },
      { key: 'why', label: 'Likely cause', sortable: false, cell: function (x) { return '<span style="white-space:normal;font-size:12.5px">' + esc(why(x)) + '</span>'; } }
    ], weak, { sortKey: 'profit', sortDir: 1, bar: false, pageSize: 0, onRow: function (x) { root.App.go('project', { id: x.id }); },
      empty: 'Every billable project is above the ' + pct(U.BANDS.watch, 0) + ' watch line in ' + esc(d.p.label) + '.' });
    var wp = U.panel('Watch list', weak.length + ' project' + (weak.length === 1 ? '' : 's') + ' below ' + pct(U.BANDS.watch, 0) + ' margin · the gap column is the cost you would have to remove (or revenue add) to make each one healthy', wt, true);
    wp.style.marginTop = '16px'; f.appendChild(wp);

    /* the full table */
    var t = U.table([
      { key: 'name', label: 'Project', cell: function (r) { return '<strong class="link">' + esc(r.name) + '</strong><div class="muted" style="font-size:11px">' + esc((H.clientOf(r.id) || {}).name || '') + (r.billable ? '' : ' · <span class="tag">Non-billable</span>') + '</div>'; } },
      { key: 'revenue', label: 'Revenue', num: true, cell: function (r) { return r.billable ? money(r.revenue) : '<span class="muted">—</span>'; } },
      { key: 'empCost', label: 'Employee cost', num: true, cell: function (r) { return money(r.empCost); } },
      { key: 'afterPeople', label: 'Contribution after people', num: true, sortVal: function (r) { return r.revenue - r.empCost; }, cell: function (r) { return r.billable ? money(r.revenue - r.empCost) : '<span class="muted">—</span>'; } },
      { key: 'peopleMargin', label: 'People margin', num: true, sortVal: function (r) { return r.revenue ? (r.revenue - r.empCost) / r.revenue : -9; }, cell: function (r) { return r.billable && r.revenue ? pct((r.revenue - r.empCost) / r.revenue) : '<span class="muted">—</span>'; } },
      { key: 'otherCost', label: 'Other cost', num: true, cell: function (r) { return money(r.otherCost); } },
      { key: 'profit', label: 'Profit', num: true, cell: function (r) { return r.billable ? '<strong class="' + (r.profit < 0 ? 'bad' : '') + '">' + money(r.profit) + '</strong>' : '<span class="muted">cost centre</span>'; } },
      { key: 'margin', label: 'Margin', num: true, sortVal: function (r) { return r.billable ? r.margin : 9; }, cell: function (r) { return r.billable ? U.marginPill(r.margin) : '<span class="pill neutral">n/a</span>'; } },
      { key: 'trend', label: 'Margin trend', sortable: false, noExport: true, cell: function (r) { return r.billable ? U.sparkline(d.t12.map(function (m) { var q = C.rollup(m).byProject[r.id]; return q ? q.margin : 0; }), 'var(--m-margin)', 72, 22) : ''; } }
    ], d.projects, { title: 'Project profitability', subtitle: 'Code to Click · ' + d.p.label, exportName: 'Project profitability ' + d.p.label, sortKey: 'margin', sortDir: 1,
      onRow: function (r) { root.App.go('project', { id: r.id }); },
      foot: { name: d.projects.length + ' projects', revenue: money(a.revenue), empCost: money(d.projects.reduce(function (t2, x) { return t2 + x.empCost; }, 0)), otherCost: money(d.projects.reduce(function (t2, x) { return t2 + x.otherCost; }, 0)), profit: money(d.billable.reduce(function (t2, x) { return t2 + x.profit; }, 0)) } });
    var tp = U.panel('All projects', d.p.label + ' · sorted weakest first', t, true); tp.style.marginTop = '16px'; f.appendChild(tp);

    /* client → project matrix */
    var clients = d.clients.slice().sort(function (x, y) { return y[matrixSort] - x[matrixSort]; });
    var h = '<div class="dt-scroll capped"><table class="grid"><thead><tr><th class="stick">Client / project</th><th class="n">Revenue</th><th class="n">Employee cost</th><th class="n">After people</th><th class="n">People margin</th><th class="n">Other cost</th><th class="n">Profit</th><th class="n">Margin</th></tr></thead><tbody>';
    clients.forEach(function (c) {
      h += '<tr class="group-row clickable" data-c="' + c.id + '"><td class="stick"><span class="mono muted" data-x="' + c.id + '">▸</span> <strong>' + esc(c.name) + '</strong></td>' +
        '<td class="n">' + money(c.revenue) + '</td><td class="n">' + money(c.empCost) + '</td><td class="n">' + money(c.revenue - c.empCost) + '</td><td class="n">' + (c.revenue ? pct((c.revenue - c.empCost) / c.revenue) : '—') + '</td><td class="n">' + money(c.otherCost) + '</td><td class="n">' + money(c.profit) + '</td><td class="n">' + U.marginPill(c.margin) + '</td></tr>';
      d.projects.filter(function (x) { return x.clientId === c.id; }).sort(function (x, y) { return y.revenue - x.revenue; }).forEach(function (x) {
        h += '<tr class="sub-row clickable" data-p="' + x.id + '" data-parent="' + c.id + '" hidden><td class="stick">' + esc(x.name) + (x.billable ? '' : ' <span class="tag">Non-billable</span>') + '</td>' +
          '<td class="n">' + (x.billable ? money(x.revenue) : '—') + '</td><td class="n">' + money(x.empCost) + '</td><td class="n">' + (x.billable ? money(x.revenue - x.empCost) : '—') + '</td><td class="n">' + (x.billable && x.revenue ? pct((x.revenue - x.empCost) / x.revenue) : '—') + '</td><td class="n">' + money(x.otherCost) + '</td><td class="n">' + (x.billable ? money(x.profit) : '—') + '</td><td class="n">' + (x.billable ? U.marginPill(x.margin) : '<span class="pill neutral">n/a</span>') + '</td></tr>';
      });
    });
    h += '</tbody></table></div>';
    var node = el(h);
    node.querySelectorAll('tr[data-c]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var id = tr.dataset.c, open = tr.querySelector('[data-x]').textContent === '▾';
        tr.querySelector('[data-x]').textContent = open ? '▸' : '▾';
        node.querySelectorAll('tr[data-parent="' + id + '"]').forEach(function (r) { r.hidden = open; });
      });
    });
    node.querySelectorAll('tr[data-p]').forEach(function (tr) { tr.addEventListener('click', function (ev) { ev.stopPropagation(); root.App.go('project', { id: tr.dataset.p }); }); });
    var sorter = el('<div class="chips"></div>');
    [['revenue', 'Revenue'], ['profit', 'Profit'], ['margin', 'Margin'], ['totalCost', 'Cost']].forEach(function (k) {
      var b = el('<button class="chip" aria-pressed="' + (matrixSort === k[0]) + '">' + k[1] + '</button>');
      b.addEventListener('click', function () { matrixSort = k[0]; root.App.render(); });
      sorter.appendChild(b);
    });
    var mp = U.panel('Client → project matrix', 'Expand a client to see its projects · sorted by ' + matrixSort, node, true, sorter);
    mp.style.marginTop = '16px'; f.appendChild(mp);
    return f;
  }

  /* ---------- the page -------------------------------------------------------- */
  V.profitability = function (s) {
    var f = frag(), d = compute(s), a = d.a, band = U.band(a.margin);
    if (s.params && s.params.tab) { tab = s.params.tab; delete s.params.tab; }
    f.appendChild(head('Profitability', 'Company, clients and projects for ' + esc(d.p.label) + ' — every figure is a sum of that period’s monthly records.',
      [btn('Management report', 'btn-ghost', function () { root.App.go('report-management'); }, 'report')],
      '<div class="ph-stamp' + (band.cls === 'good' ? '' : band.cls === 'watch' ? ' watch' : ' closed') + '"><span class="dotlive"></span>' + esc(band.label) + ' &middot; ' + pct(a.margin) + ' gross margin &middot; ' + esc(d.p.label) + '</div>'));
    f.appendChild(decisionStrip(d));

    /* insights: the sentences a manager would write */
    var ins = H.insights(s, d.p).slice(0, 4);
    if (ins.length) {
      var row = el('<div class="insights-row" style="margin-top:16px"></div>');
      ins.forEach(function (i) { row.appendChild(el(U.insightCard(esc(i.text) + (i.why ? ' <span class="muted">' + esc(i.why) + '</span>' : ''), i.tone === 'neg' ? 'crit' : i.tone === 'warnc' ? 'warn' : i.tone === 'pos' ? 'good' : '', i.tone === 'neg' || i.tone === 'warnc' ? 'info' : 'spark'))); });
      f.appendChild(row);
    }

    /* the three layers */
    var tabs = el('<div class="tabbar" role="tablist" aria-label="Profitability layers" style="margin-top:20px;margin-bottom:0"></div>');
    [['company', 'Company', 'i-company'], ['clients', 'Clients', 'i-clientprofit'], ['projects', 'Projects', 'i-projectprofit']].forEach(function (t) {
      var on = tab === t[0];
      var b = el('<button type="button" role="tab" aria-selected="' + on + '"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + t[2] + '"></use></svg>' + t[1] +
        (t[0] === 'clients' ? '<em class="cnt">' + d.clients.length + '</em>' : t[0] === 'projects' ? '<em class="cnt">' + d.projects.length + '</em>' : '') + '</button>');
      b.addEventListener('click', function () { tab = t[0]; var y = window.scrollY; root.App.render(); window.scrollTo(0, y); });
      tabs.appendChild(b);
    });
    f.appendChild(tabs);
    var body = el('<div style="margin-top:16px"></div>');
    body.appendChild(tab === 'clients' ? clientLayer(d) : tab === 'projects' ? projectLayer(d) : companyLayer(d));
    f.appendChild(body);
    return f;
  };

  /* the three old screens live on as bookmarks into the tabs */
  V['profit-company'] = function (s) { tab = 'company'; return V.profitability(s); };
  V['profit-client'] = function (s) { tab = 'clients'; return V.profitability(s); };
  V['profit-project'] = function (s) { tab = 'projects'; return V.profitability(s); };
})(typeof window !== 'undefined' ? window : globalThis);
