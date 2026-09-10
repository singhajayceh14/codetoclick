/* ============================================================================
   Business entities, analytics, reports.
   ========================================================================== */
(function (root) {
  'use strict';
  var C = root.CTC, U = root.UI, V = root.VIEWS, H = root.VIEWHELP;
  var money = U.money, moneyK = U.moneyK, pct = U.pct, esc = U.esc, el = U.el;
  var frag = H.frag, head = H.head, btn = H.btn, trailing12 = H.trailing12, copyBtn = H.copyBtn;

  function monthHistoryTable(rowsFor, months, onMonth, opts) {
    var rows = months.map(rowsFor);
    return U.table([
      { key: 'month', label: 'Month', cell: function (r) { return '<span class="link mono">' + C.mlabel(r.month) + '</span>'; }, sortVal: function (r) { return C.mindex(r.month); } },
      { key: 'revenue', label: 'Revenue', num: true, cell: function (r) { return money(r.revenue); } },
      { key: 'empCost', label: 'Employee cost', num: true, cell: function (r) { return money(r.empCost); } },
      { key: 'otherCost', label: 'Other cost', num: true, cell: function (r) { return money(r.otherCost); } },
      { key: 'totalCost', label: 'Total cost', num: true, cell: function (r) { return money(r.totalCost); } },
      { key: 'profit', label: 'Profit', num: true, cell: function (r) { return money(r.profit); } },
      { key: 'margin', label: 'Margin', num: true, cell: function (r) { return U.marginPill(r.margin); } }
    ], rows, { title: opts && opts.title || 'Monthly history', subtitle: opts && opts.subtitle || '', exportName: (opts && opts.title) || 'Monthly history',
      sortKey: 'month', sortDir: 1, onRow: function (r) { onMonth(r.month); }, empty: 'No months on record.' });
  }

  /* ================= CLIENTS ============================================== */
  V.clients = function (s) {
    var f = frag(), p = H.periodBlock(s);
    f.appendChild(head('Clients', 'Client profitability for ' + esc(p.label) + '. Margin is always computed from total revenue and total cost — never an average of project margins.'));
    var rows = C.aggregateBy(p.months, 'client');
    var tot = rows.reduce(function (a, r) { return { revenue: a.revenue + r.revenue, empCost: a.empCost + r.empCost, otherCost: a.otherCost + r.otherCost, profit: a.profit + r.profit }; },
      { revenue: 0, empCost: 0, otherCost: 0, profit: 0 });
    var t = U.table([
      { key: 'name', label: 'Client', cell: function (r) { return '<strong class="link">' + esc(r.name) + '</strong>'; } },
      { key: 'projects', label: 'Projects', num: true, sortVal: function (r) { return projCount(r.id, p.months); }, cell: function (r) { return projCount(r.id, p.months); } },
      { key: 'revenue', label: 'Revenue', num: true, cell: function (r) { return money(r.revenue); } },
      { key: 'empCost', label: 'Employee cost', num: true, cell: function (r) { return money(r.empCost); } },
      { key: 'otherCost', label: 'Other cost', num: true, cell: function (r) { return money(r.otherCost); } },
      { key: 'profit', label: 'Profit', num: true, cell: function (r) { return money(r.profit); } },
      { key: 'margin', label: 'Margin', num: true, cell: function (r) { return U.marginPill(r.margin); } }
    ], rows, {
      title: 'Client profitability', subtitle: 'Code to Click · ' + p.label, exportName: 'Client profitability ' + p.label,
      sortKey: 'revenue', onRow: function (r) { root.App.go('client', { id: r.id }); },
      foot: {
        name: rows.length + ' clients', revenue: money(tot.revenue), empCost: money(tot.empCost),
        otherCost: money(tot.otherCost), profit: money(tot.profit),
        margin: tot.revenue ? pct(tot.profit / tot.revenue) : '—'
      }
    });
    f.appendChild(U.panel('Client profitability', p.label, t, true));
    return f;
  };
  function projCount(clientId, months) {
    var ids = {};
    months.forEach(function (m) {
      var r = C.rollup(m);
      Object.keys(r.byProject).forEach(function (pid) { if (r.byProject[pid].clientId === clientId) ids[pid] = 1; });
    });
    return Object.keys(ids).length;
  }

  V.client = function (s) {
    var f = frag(), id = s.params.id, m = s.month, r = C.rollup(m), cl = r.byClient[id];
    var meta = C.CLIENTS.filter(function (c) { return c.id === id; })[0];
    if (!meta) return el('<div class="empty">Client not found.</div>');
    f.appendChild(head(meta.name, esc(meta.industry) + ' · client since ' + C.mlabel(meta.since) + ' · showing <strong>' + esc(C.mlabel(m)) + '</strong>',
      cl ? [btn('Add revenue', 'btn-primary', function () { root.App.dialogs.revenue({ clientId: id, month: m }); }, 'plus')] : null));
    if (!cl) { f.appendChild(el('<div class="empty">No active projects for this client in ' + esc(C.mlabel(m)) + '.</div>')); return f; }

    var prevM = C.maddMonths(m, -1), prev = C.MONTHS.indexOf(prevM) !== -1 ? C.rollup(prevM).byClient[id] : null;
    var h = '<div class="kpis">';
    h += U.kpi('Revenue', moneyK(cl.revenue), U.deltaChip(cl.revenue, prev && prev.revenue), true);
    h += U.kpi('Employee cost', moneyK(cl.empCost), U.deltaChip(cl.empCost, prev && prev.empCost, { inverse: true }));
    h += U.kpi('Contribution after people', moneyK(cl.revenue - cl.empCost), '<span>' + (cl.revenue ? pct((cl.revenue - cl.empCost) / cl.revenue) : '—') + ' people margin</span>');
    h += U.kpi('Other cost', moneyK(cl.otherCost), U.deltaChip(cl.otherCost, prev && prev.otherCost, { inverse: true }));
    h += U.kpi('Profit', moneyK(cl.profit), U.deltaChip(cl.profit, prev && prev.profit), true);
    h += U.kpi('Margin', pct(cl.margin), U.deltaChip(cl.margin, prev && prev.margin, { points: true }));
    h += '</div>';
    f.appendChild(el(h));

    var pt = U.table([
      { key: 'name', label: 'Project', cell: function (x) { return '<strong class="link">' + esc(x.name) + '</strong>'; } },
      { key: 'type', label: 'Type', cell: function (x) { return '<span class="tag">' + esc(x.type) + '</span>'; } },
      { key: 'revenue', label: 'Revenue', num: true, cell: function (x) { return money(x.revenue); } },
      { key: 'empCost', label: 'Employee cost', num: true, cell: function (x) { return money(x.empCost); } },
      { key: 'otherCost', label: 'Other cost', num: true, cell: function (x) { return money(x.otherCost); } },
      { key: 'profit', label: 'Profit', num: true, cell: function (x) { return money(x.profit); } },
      { key: 'margin', label: 'Margin', num: true, cell: function (x) { return U.marginPill(x.margin); } }
    ], cl.projects, {
      sortKey: 'revenue', onRow: function (x) { root.App.go('project', { id: x.id }); },
      foot: {
        name: 'Client total', revenue: money(cl.revenue), empCost: money(cl.empCost), otherCost: money(cl.otherCost),
        profit: money(cl.profit), margin: pct(cl.margin)
      }
    });
    f.appendChild(U.panel('Projects in ' + C.mlabel(m), 'Client margin ' + pct(cl.margin) + ' is computed on the totals, not averaged across projects', pt, true));

    var hist = C.MONTHS.filter(function (x) { return C.rollup(x).byClient[id]; });
    var ht = monthHistoryTable(function (x) {
      var c = C.rollup(x).byClient[id];
      return { month: x, revenue: c.revenue, empCost: c.empCost, otherCost: c.otherCost, totalCost: c.totalCost, profit: c.profit, margin: c.margin };
    }, hist, function (x) { root.App.setMonth(x); }, { title: 'Monthly history · ' + meta.name, subtitle: 'Code to Click' });
    var pn = U.panel('Monthly history', 'Click a month to open it', ht, true); pn.style.marginTop = '16px';
    f.appendChild(pn);

    if (hist.length > 1) {
      var last = hist.slice(-12);
      var ch = U.lineChart({
        months: last, height: 220, onClickMonth: function (x) { root.App.setMonth(x); },
        series: [
          { label: 'Revenue', color: 'var(--s1)', area: true, values: last.map(function (x) { return C.rollup(x).byClient[id].revenue; }) },
          { label: 'Total cost', color: 'var(--s2)', values: last.map(function (x) { return C.rollup(x).byClient[id].totalCost; }) },
          { label: 'Profit', color: 'var(--s3)', values: last.map(function (x) { return C.rollup(x).byClient[id].profit; }) }
        ]
      });
      var pn2 = U.panel('Trend', 'Last ' + last.length + ' months on record', ch); pn2.style.marginTop = '16px';
      f.appendChild(pn2);
    }
    return f;
  };

  /* ================= PROJECTS ============================================= */
  V.projects = function (s) {
    var f = frag(), p = H.periodBlock(s);
    f.appendChild(head('Projects', 'Project profitability for ' + esc(p.label) + '.'));
    f.appendChild(H.filterBar(s, ['client', 'band'], function () { root.App.render(); }));
    var rows = C.aggregateBy(p.months, 'project').filter(function (r) {
      if (s.filters.client && r.clientId !== s.filters.client) return false;
      if (s.filters.band && (!r.billable || U.band(r.margin).key !== s.filters.band)) return false;
      return true;
    });
    var bands = { healthy: 0, watch: 0, critical: 0, loss: 0 }, nonBillable = 0;
    C.aggregateBy(p.months, 'project').forEach(function (r) { if (r.billable) bands[U.band(r.margin).key]++; else nonBillable++; });
    f.appendChild(el('<div class="stat-line" style="margin-bottom:14px">' +
      '<span><span class="pill good">●</span> Healthy (≥' + pct(U.BANDS.healthy, 0) + ') <b>' + bands.healthy + '</b></span>' +
      '<span><span class="pill watch">●</span> Watch <b>' + bands.watch + '</b></span>' +
      '<span><span class="pill crit">●</span> Critical (&lt;' + pct(U.BANDS.watch, 0) + ') <b>' + bands.critical + '</b></span>' +
      (nonBillable ? '<span><span class="pill neutral">●</span> Non-billable <b>' + nonBillable + '</b></span>' : '') +
      '<span><span class="pill loss">▼</span> Loss making <b>' + bands.loss + '</b></span></div>'));

    var t = U.table([
      { key: 'name', label: 'Project', cell: function (r) { return '<strong class="link">' + esc(r.name) + '</strong><div class="muted" style="font-size:11px">' + esc((H.clientOf(r.id) || {}).name || '') + (r.billable ? '' : ' · <span class="tag">Non-billable</span>') + '</div>'; } },
      { key: 'revenue', label: 'Revenue', num: true, cell: function (r) { return r.billable ? money(r.revenue) : '<span class="muted">—</span>'; } },
      { key: 'empCost', label: 'Employee cost', num: true, cell: function (r) { return money(r.empCost); } },
      { key: 'afterPeople', label: 'Contribution after people', num: true, sortVal: function (r) { return r.revenue - r.empCost; }, cell: function (r) { return r.billable ? money(r.revenue - r.empCost) : '<span class="muted">—</span>'; } },
      { key: 'peopleMargin', label: 'People margin', num: true, sortVal: function (r) { return r.revenue ? (r.revenue - r.empCost) / r.revenue : -9; }, cell: function (r) { return r.billable && r.revenue ? pct((r.revenue - r.empCost) / r.revenue) : '<span class="muted">—</span>'; } },
      { key: 'otherCost', label: 'Other cost', num: true, cell: function (r) { return money(r.otherCost); } },
      { key: 'profit', label: 'Profit', num: true, cell: function (r) { return r.billable ? money(r.profit) : '<span class="muted">cost centre</span>'; } },
      { key: 'margin', label: 'Margin', num: true, sortVal: function (r) { return r.billable ? r.margin : 9; }, cell: function (r) { return r.billable ? U.marginPill(r.margin) : '<span class="pill neutral">n/a</span>'; } }
    ], rows, { title: 'Project profitability', subtitle: 'Code to Click · ' + p.label, exportName: 'Project profitability ' + p.label,
      sortKey: 'margin', sortDir: 1, onRow: function (r) { root.App.go('project', { id: r.id }); } });
    f.appendChild(U.panel('Project profitability', p.label, t, true));
    return f;
  };

  V.project = function (s) {
    var f = frag(), id = s.params.id, m = s.month, r = C.rollup(m), pr = r.byProject[id];
    var meta = C.PROJECTS.filter(function (x) { return x.id === id; })[0];
    if (!meta) return el('<div class="empty">Project not found.</div>');
    var cl = C.CLIENTS.filter(function (c) { return c.id === meta.clientId; })[0];
    f.appendChild(head(meta.name, esc(cl.name) + ' · ' + esc(meta.type) + ' · started ' + C.mlabel(meta.start) +
      (meta.end ? ' · closed ' + C.mlabel(meta.end) : '') + ' · showing <strong>' + esc(C.mlabel(m)) + '</strong>',
      pr ? [btn('Book cost', 'btn-ghost', function () { root.App.dialogs.cost({ projectId: id, month: m }); }, 'cost'),
            btn('Add revenue', 'btn-primary', function () { root.App.dialogs.revenue({ projectId: id, month: m }); }, 'plus')] : null));

    if (!pr) {
      f.appendChild(el('<div class="empty">This project was not active in ' + esc(C.mlabel(m)) + '. It ran from ' + esc(C.mlabel(meta.start)) + (meta.end ? ' to ' + esc(C.mlabel(meta.end)) : '') + '.</div>'));
      return f;
    }
    var prevM = C.maddMonths(m, -1), prev = C.MONTHS.indexOf(prevM) !== -1 ? C.rollup(prevM).byProject[id] : null;
    var band = U.band(pr.margin);
    var hist = C.MONTHS.filter(function (x) { return C.rollup(x).byProject[id]; });
    var upto = hist.filter(function (x) { return C.mindex(x) <= C.mindex(m); }), t12 = upto.slice(-12);
    var at = function (x) { return C.rollup(x).byProject[id]; };
    var series = function (k) { return t12.map(function (x) { return at(x)[k]; }); };
    var labels = t12.map(function (x) { return C.mshort(x); });
    var spark = function (k, colour, name, fmt) { return U.sparkline(series(k), colour, 300, 44, { labels: labels, name: name, fmt: fmt || 'money' }); };
    var vs = prev ? 'vs ' + C.mshort(prevM) : 'first month';

    /* --- stamp: the margin band, right under the title -------------------- */
    var nb = !pr.billable;
    f.querySelector('.ph-main').insertAdjacentHTML('afterbegin', nb
      ? '<div class="ph-stamp closed"><span class="dotlive"></span>Non-billable &middot; cost centre &middot; ' + money(pr.totalCost) + ' in ' + esc(C.mshort(m)) + '</div>'
      : '<div class="ph-stamp' + (band.cls === 'good' ? '' : band.cls === 'watch' ? ' watch' : ' closed') + '"><span class="dotlive"></span>' +
        esc(band.label) + ' &middot; ' + pct(pr.margin) + ' margin in ' + esc(C.mshort(m)) + '</div>');
    if (nb) { var arb = f.querySelector('.ph-acts .btn-primary'); if (arb) arb.remove(); }

    /* --- 1. the six figures, with this project's own twelve-month trace ---- */
    var tiles = el('<div class="tiles"></div>');
    (nb ? [
      { kind: 'people', label: 'Employee cost', value: money(pr.empCost), foot: U.deltaChip(pr.empCost, prev && prev.empCost, { inverse: true }) + '<span>' + pr.team.length + (pr.team.length === 1 ? ' person' : ' people') + ' allocated</span>', spark: spark('empCost', 'var(--m-people)', 'Employee cost') },
      { kind: 'other', label: 'Other cost', value: money(pr.otherCost), foot: U.deltaChip(pr.otherCost, prev && prev.otherCost, { inverse: true }) + '<span>' + Object.keys(pr.byCategory).length + ' categories</span>', spark: spark('otherCost', 'var(--m-other)', 'Other cost') },
      { kind: 'cost', label: 'Total cost', value: money(pr.totalCost), foot: U.deltaChip(pr.totalCost, prev && prev.totalCost, { inverse: true }) + '<span>counted as internal time and overhead</span>', spark: spark('totalCost', 'var(--m-cost)', 'Total cost'), accent: true }
    ] : [
      { kind: 'revenue', label: 'Revenue', value: money(pr.revenue), foot: U.deltaChip(pr.revenue, prev && prev.revenue) + '<span>' + vs + '</span>', spark: spark('revenue', 'var(--m-revenue)', 'Revenue'), accent: true },
      { kind: 'people', label: 'Employee cost', value: money(pr.empCost), foot: U.deltaChip(pr.empCost, prev && prev.empCost, { inverse: true }) + '<span>' + pr.team.length + (pr.team.length === 1 ? ' person' : ' people') + ' allocated</span>', spark: spark('empCost', 'var(--m-people)', 'Employee cost') },
      { kind: 'other', label: 'Other cost', value: money(pr.otherCost), foot: U.deltaChip(pr.otherCost, prev && prev.otherCost, { inverse: true }) + '<span>' + Object.keys(pr.byCategory).length + ' categories</span>', spark: spark('otherCost', 'var(--m-other)', 'Other cost') },
      { kind: 'cost', label: 'Total cost', value: money(pr.totalCost), foot: U.deltaChip(pr.totalCost, prev && prev.totalCost, { inverse: true }) + '<span>' + pct(pr.totalCost / (pr.revenue || 1), 0) + ' of revenue</span>', spark: spark('totalCost', 'var(--m-cost)', 'Total cost') },
      { kind: 'profit', label: 'Profit', value: money(pr.profit), foot: U.deltaChip(pr.profit, prev && prev.profit) + '<span>' + vs + '</span>', spark: spark('profit', 'var(--m-profit)', 'Profit'), accent: true },
      { kind: 'margin', label: 'Margin', value: pct(pr.margin), foot: U.deltaChip(pr.margin, prev && prev.margin, { points: true }) + '<span>' + esc(band.label) + '</span>', spark: spark('margin', 'var(--m-margin)', 'Margin', 'pct') }
    ]).forEach(function (c) { tiles.appendChild(U.tile(c)); });
    f.appendChild(tiles);

    /* --- 2. where the month's money went -------------------------------- */
    var g = el('<div class="grid-wide" style="margin-top:16px"></div>');
    if (nb) g.appendChild(U.panel('Non-billable project', 'What this means for the numbers', el('<div class="stack" style="gap:10px;font-size:13.5px;color:var(--text-2)">' +
      '<p style="margin:0">This project earns no revenue, so it has no profit or margin of its own. Its cost still counts in full: people allocated here show under <strong>internal time</strong> on the dashboard and management report, and any cost booked to it lands in <strong>company overhead</strong>.</p>' +
      '<p style="margin:0">Use it for internal tooling, R&amp;D, pre-sales or a free pilot — anything you want to track the cost of without it distorting project margins.</p></div>')));
    else g.appendChild(U.panel('Where the money goes', C.mlabel(m) + ' · revenue less the cost booked to this project', U.waterfall({
      height: 300,
      steps: [
        { label: 'Revenue', value: pr.revenue, kind: 'total' },
        { label: 'Employee cost', value: -pr.empCost, kind: 'sub', note: 'Allocated payroll' },
        { label: 'Other cost', value: -pr.otherCost, kind: 'sub', note: 'Cloud, software, contractors, travel' },
        { label: 'Profit', value: pr.profit, kind: 'total' }
      ]
    })));
    var catRows = [{ label: 'Employee cost', value: pr.empCost, color: 'var(--m-people)' }].concat(
      Object.keys(pr.byCategory).filter(function (k) { return pr.byCategory[k] > 0.005; }).sort(function (x, y) { return pr.byCategory[y] - pr.byCategory[x]; }).map(function (k) {
        return { label: k, value: pr.byCategory[k], color: ['var(--s1)', 'var(--s3)', 'var(--s2)', 'var(--s4)', 'var(--s5)', 'var(--m-other)'][Math.max(0, C.COST_GROUPS.indexOf(k))] };
      }));
    var side = el('<div></div>');
    side.appendChild(U.segbar(catRows, pr.totalCost, { aria: 'Cost mix' }));
    side.appendChild(el('<div class="recon" style="margin-top:14px">' + (nb ?
      '<div class="r neg"><span>Total cost</span><span>−' + money(pr.totalCost) + '</span></div>' :
      '<div class="r"><span>Revenue</span><span>' + money(pr.revenue) + '</span></div>' +
      '<div class="r neg"><span>Employee cost</span><span>−' + money(pr.empCost) + '</span></div>' +
      '<div class="r total"><span>Contribution after people · ' + pct(pr.revenue ? (pr.revenue - pr.empCost) / pr.revenue : 0) + '</span><span>' + money(pr.revenue - pr.empCost) + '</span></div>' +
      '<div class="r neg"><span>Other cost</span><span>−' + money(pr.otherCost) + '</span></div>' +
      '<div class="r total"><span>Profit · ' + pct(pr.margin) + '</span><span>' + money(pr.profit) + '</span></div>') + '</div>'));
    g.appendChild(U.panel('Cost mix', C.mlabel(m) + ' · share of total cost', side));
    f.appendChild(g);

    /* --- 3. the team behind the employee cost ------------------------------ */
    var maxPct = Math.max.apply(null, pr.team.map(function (t) { return t.pct; }).concat([100]));
    var team = U.table([
      { key: 'name', label: 'Employee', cell: function (t) { var e = r.byEmployee[t.empId]; return '<strong class="link" style="white-space:nowrap">' + esc(H.empName(t.empId)) + '</strong><div class="muted" style="font-size:11px">' + esc(e ? e.title : '') + '</div>'; }, sortVal: function (t) { return H.empName(t.empId); } },
      { key: 'pct', label: 'Allocation', num: true, cell: function (t) { return U.bullet(t.pct, maxPct, t.pct >= 100 ? 'var(--ok)' : 'var(--s1)', t.pct + '%'); } },
      { key: 'monthly', label: 'Monthly cost', num: true, sortVal: function (t) { return r.byEmployee[t.empId].monthlyCost; }, cell: function (t) { return money(r.byEmployee[t.empId].monthlyCost); } },
      { key: 'amount', label: 'Cost to project', num: true, cell: function (t) { return '<strong>' + money(t.amount) + '</strong>'; } },
      { key: 'share', label: 'Share', num: true, sortVal: function (t) { return t.amount; }, cell: function (t) { return '<span class="muted">' + pct(t.amount / (pr.empCost || 1), 0) + '</span>'; } }
    ], pr.team, {
      sortKey: 'amount', bar: false, pageSize: 0,
      onRow: function (t) { root.App.go('employee', { id: t.empId }); },
      foot: { name: pr.team.length + ' people', amount: money(pr.empCost), share: '100%' },
      empty: 'Nobody is allocated to this project in ' + esc(C.mlabel(m)) + '.'
    });
    var tp = U.panel('Team', C.mlabel(m) + ' · monthly cost × allocation = cost to project', team, true,
      btn('Edit allocations', 'btn-ghost btn-sm', function () { root.App.go('allocations'); }, 'sliders'));
    tp.style.marginTop = '16px';
    f.appendChild(tp);

    /* --- 4. history: months across, the P&L down --------------------------- */
    if (hist.length > 1) {
      var range = hist.length > 12 ? 12 : 0, hbody = el('<div></div>');
      function drawHist() {
        var ms = range ? hist.slice(-range) : hist;
        hbody.innerHTML = '';
        var cw = el('<div style="padding:14px 20px 0"></div>');
        cw.appendChild(U.lineChart({
          months: ms, height: 210, onClickMonth: function (x) { root.App.setMonth(x); },
          series: nb ? [
            { label: 'Employee cost', color: 'var(--m-people)', area: true, values: ms.map(function (x) { return at(x).empCost; }) },
            { label: 'Other cost', color: 'var(--m-other)', values: ms.map(function (x) { return at(x).otherCost; }) }
          ] : [
            { label: 'Revenue', color: 'var(--s1)', area: true, values: ms.map(function (x) { return at(x).revenue; }) },
            { label: 'Total cost', color: 'var(--s2)', values: ms.map(function (x) { return at(x).totalCost; }) },
            { label: 'Profit', color: 'var(--s3)', values: ms.map(function (x) { return at(x).profit; }) }
          ]
        }));
        hbody.appendChild(cw);
        var sum = function (k) { return ms.reduce(function (t, x) { return t + at(x)[k]; }, 0); };
        var tot = { revenue: sum('revenue'), empCost: sum('empCost'), otherCost: sum('otherCost'), totalCost: sum('totalCost'), profit: sum('profit') };
        var mcell = function (k) { return function (x) { return money(at(x)[k]); }; };
        hbody.appendChild(U.pivot({
          months: ms, current: m, corner: 'Per month', totalLabel: ms.length + ' months', onMonth: function (x) { root.App.setMonth(x); },
          rows: (nb ? [] : [{ label: 'Revenue', sub: 'booked to the project', cell: mcell('revenue'), total: money(tot.revenue) }]).concat([
            { label: 'Employee cost', sub: 'allocated payroll', cell: mcell('empCost'), total: money(tot.empCost) }
          ], nb ? [] : [
            { label: 'Contribution after people', sub: 'revenue − employee cost', cls: 'pv-sep', cell: function (x) { var q = at(x); return money(q.revenue - q.empCost); }, total: money(tot.revenue - tot.empCost) },
            { label: 'People margin', sub: 'after people ÷ revenue', cell: function (x) { var q = at(x); return q.revenue ? pct((q.revenue - q.empCost) / q.revenue) : '—'; }, total: pct(tot.revenue ? (tot.revenue - tot.empCost) / tot.revenue : 0) }
          ], [
            { label: 'Other cost', sub: 'incl. licence shares', cls: nb ? '' : 'pv-sep', cell: mcell('otherCost'), total: money(tot.otherCost) },
            { label: 'Total cost', cls: nb ? 'pv-sep pv-strong' : 'pv-sep', cell: mcell('totalCost'), total: money(tot.totalCost) }
          ], nb ? [] : [
            { label: 'Profit', sub: 'revenue − total cost', cls: 'pv-strong', cell: function (x) { var v = at(x).profit; return '<span class="' + (v < 0 ? 'bad' : '') + '">' + money(v) + '</span>'; }, total: money(tot.profit) },
            { label: 'Margin', sub: 'profit ÷ revenue', cell: function (x) { var q = at(x); return U.marginPill ? U.marginPill(q.margin) : pct(q.margin); }, total: pct(tot.revenue ? tot.profit / tot.revenue : 0) }
          ], [
            { label: 'Team', sub: 'people allocated', cell: function (x) { return at(x).team.length; }, total: Math.max.apply(null, ms.map(function (x) { return at(x).team.length; })) + ' <span class="dim" style="font-size:11px">max</span>' }
          ])
        }));
      }
      drawHist();
      var seg = null;
      if (hist.length > 12) {
        seg = el('<div class="seg-toggle" role="group" aria-label="History range"><button type="button" aria-pressed="true">Last 12 months</button><button type="button" aria-pressed="false">All ' + hist.length + ' months</button></div>');
        seg.querySelectorAll('button').forEach(function (bb, i) {
          bb.addEventListener('click', function () {
            range = i ? 0 : 12;
            seg.querySelectorAll('button').forEach(function (x, j) { x.setAttribute('aria-pressed', String(j === i)); });
            drawHist();
          });
        });
      }
      var pn = U.panel('Monthly history', 'Months across, the P&L down · each month is its own snapshot, never restated · click a month to open it', hbody, true, seg);
      pn.style.marginTop = '16px';
      f.appendChild(pn);
    }
    var back = f.querySelector('[data-go="client"]');
    if (back) back.addEventListener('click', function () { root.App.go('client', { id: cl.id }); });
    return f;
  };

  /* ================= EMPLOYEES ============================================ */
  V.employees = function (s) {
    var f = frag(), m = s.month, r = C.rollup(m);
    f.appendChild(head('Employees', 'Roster and cost for ' + esc(C.mlabel(m)) + '.',
      [btn('Add employee', 'btn-primary', function () { root.App.dialogs.employee(); })]));
    f.appendChild(H.filterBar(s, ['dept'], function () { root.App.render(); }));
    var rows = Object.keys(r.byEmployee).map(function (id) { return r.byEmployee[id]; })
      .filter(function (e) { return !s.filters.dept || e.dept === s.filters.dept; });
    var t = U.table([
      { key: 'name', label: 'Employee', cell: function (e) { return '<strong class="link">' + esc(e.name) + '</strong><div class="muted" style="font-size:11px">' + esc(e.title) + '</div>'; } },
      { key: 'dept', label: 'Department', cell: function (e) { return '<span class="tag">' + esc(e.dept) + '</span>'; } },
      { key: 'ctc', label: 'Annual CTC', num: true, cell: function (e) { return money(e.ctc); } },
      { key: 'monthlyCost', label: 'Payroll', num: true, cell: function (e) { return money(e.monthlyCost); } },
      { key: 'toolCost', label: 'Software', num: true, cell: function (e) {
        var on = U.toolOnProjects(e);
        return e.toolCost > 0.005 ? '<span data-tip="' + esc(e.tools.map(function (t) { return t.name + ' · ' + money(t.amount); }).join('  |  ') + '  |  ' + money(on) + ' followed allocation onto projects, ' + money(e.toolCost - on) + ' is overhead') + '">' + money(e.toolCost) +
          '<div class="muted" style="font-size:11px">' + money(on) + ' on projects · ' + e.tools.length + ' licence' + (e.tools.length === 1 ? '' : 's') + '</div></span>' : '<span class="muted">—</span>'; } },
      { key: 'loadedCost', label: 'Loaded cost', num: true, cell: function (e) { return '<strong>' + money(e.loadedCost) + '</strong>'; } },
      { key: 'projects', label: 'Projects', num: true, sortVal: function (e) { return e.lines.filter(function (l) { return l.projectId; }).length; }, cell: function (e) { return e.lines.filter(function (l) { return l.projectId; }).length; } },
      { key: 'allocatedPct', label: 'Allocated', num: true, cell: function (e) { return '<span class="mono">' + e.allocatedPct + '%</span>'; } },
      { key: 'unallocated', label: 'Status', num: true, cell: H.allocStatus }
    ], rows, { title: 'Employee roster', subtitle: 'Code to Click · ' + C.mlabel(m), exportName: 'Employee roster ' + C.mlabel(m),
      sortKey: 'loadedCost', onRow: function (e) { root.App.go('employee', { id: e.id }); },
      foot: { name: rows.length + ' people', monthlyCost: money(rows.reduce(function (t2, e) { return t2 + e.monthlyCost; }, 0)),
        toolCost: money(rows.reduce(function (t2, e) { return t2 + e.toolCost; }, 0)), loadedCost: money(rows.reduce(function (t2, e) { return t2 + e.loadedCost; }, 0)) } });
    f.appendChild(U.panel('Roster', C.mlabel(m) + ' · ' + rows.length + ' people · payroll plus each person’s share of software licences · the sub-line is how much of that share followed their allocation onto projects', t, true));
    return f;
  };

  V.employee = function (s) {
    var f = frag(), id = s.params.id, m = s.month, r = C.rollup(m), e = r.byEmployee[id];
    var meta = C.EMPLOYEES.filter(function (x) { return x.id === id; })[0];
    if (!meta) return el('<div class="empty">Employee not found.</div>');
    f.appendChild(head(meta.name, esc(meta.title) + ' · ' + esc(meta.dept) + ' · joined ' + C.mlabel(meta.join) + ' · showing <strong>' + esc(C.mlabel(m)) + '</strong>',
      e ? [btn('Edit allocation', 'btn-primary', function () { root.App.openAllocation(id); })] : null));
    if (!e) { f.appendChild(el('<div class="empty">' + esc(meta.name) + ' had not joined in ' + esc(C.mlabel(m)) + ' (start date ' + esc(C.mlabel(meta.join)) + ').</div>')); return f; }

    var h = '<div class="kpis">';
    h += U.kpi('Annual CTC', money(e.ctc), '<span>÷ 12</span>', true);
    h += U.kpi('Payroll', money(e.monthlyCost), '<span>' + C.mlabel(m) + '</span>', true);
    h += U.kpi('Software', money(e.toolCost), '<span>' + money(U.toolOnProjects(e)) + ' on projects · ' + e.tools.length + ' licence' + (e.tools.length === 1 ? '' : 's') + '</span>');
    h += U.kpi('Loaded cost', money(e.loadedCost), '<span>payroll + software</span>', true);
    h += U.kpi('Allocated to projects', money(e.projectCost), '<span>' + pct(e.projectCost / e.monthlyCost) + ' of the month</span>');
    h += U.kpi('Unallocated', money(e.unallocated), H.allocStatus(e));
    h += '</div>';
    f.appendChild(el(h));

    var lines = e.lines.slice().sort(function (a, b) { return b.amount - a.amount; });
    var lt = U.table([
      { key: 'p', label: 'Allocated to', sortable: false, cell: function (l) { return l.projectId ? '<strong class="link">' + esc(H.projName(l.projectId)) + '</strong><div class="muted" style="font-size:11px">' + esc((H.clientOf(l.projectId) || {}).name || '') + '</div>' : '<strong>Internal</strong><div class="muted" style="font-size:11px">Non-billable</div>'; } },
      { key: 'pct', label: 'Allocation', num: true, cell: function (l) { return '<span class="mono">' + l.pct + '%</span>'; } },
      { key: 'amount', label: 'Cost', num: true, cell: function (l) { return money(l.amount); } }
    ], lines, {
      sortKey: 'amount', onRow: function (l) { if (l.projectId) root.App.go('project', { id: l.projectId }); },
      foot: { p: 'Allocated', pct: e.allocatedPct + '%', amount: money(e.allocated) },
      empty: 'Nothing allocated this month — the full ' + money(e.monthlyCost) + ' sits on the bench.'
    });
    f.appendChild(U.panel('Allocation in ' + C.mlabel(m), 'Monthly cost × allocation % = cost charged to the project', lt, true));

    /* --- software and licences this person uses ---------------------------- */
    var tools = e.tools.slice().sort(function (a, b) { return b.amount - a.amount; }).map(function (t) {
      var l = C.byId(C.LICENCES, t.licenceId) || {};
      return { id: t.licenceId, name: t.name, vendor: l.vendor || '', monthly: l.price && l.months ? l.price / l.months : 0,
        sharedBy: r.company.headcount, amount: t.amount, start: l.start, end: l.start ? C.licenceEnd(l) : null };
    });
    var onProj = e.monthlyCost ? e.projectCost / e.monthlyCost : 0;
    var tt = U.table([
      { key: 'name', label: 'Licence', cell: function (t) { return '<strong class="link">' + esc(t.name) + '</strong>' + (t.vendor ? '<div class="muted" style="font-size:11px">' + esc(t.vendor) + '</div>' : ''); } },
      { key: 'end', label: 'Runs until', cell: function (t) { return t.end ? C.mshort(t.end) : '—'; }, sortVal: function (t) { return t.end ? C.mindex(t.end) : 0; } },
      { key: 'monthly', label: 'Licence / month', num: true, cell: function (t) { return money(t.monthly); } },
      { key: 'sharedBy', label: 'Shared by', num: true, cell: function (t) { return t.sharedBy + ' people'; } },
      { key: 'amount', label: 'This person', num: true, cell: function (t) { return '<strong>' + money(t.amount) + '</strong>'; } },
      { key: 'toProj', label: 'To projects', num: true, sortVal: function (t) { return t.amount * onProj; }, cell: function (t) { return money(t.amount * onProj) + '<div class="muted" style="font-size:11px">' + pct(onProj, 0) + ' allocated</div>'; } }
    ], tools, {
      sortKey: 'amount', search: false, pageSize: 0,
      onRow: function () { root.App.go('licences'); },
      foot: { name: tools.length + ' licence' + (tools.length === 1 ? '' : 's'), amount: money(e.toolCost), toProj: money(e.toolCost * onProj) },
      empty: 'No software licence is active in ' + esc(C.mlabel(m)) + '.'
    });
    var tp = U.panel('Software and licences', C.mlabel(m) + ' · every licence is shared equally across everyone on payroll; this person’s share follows their allocation into projects', tt, true);
    tp.style.marginTop = '16px';
    f.appendChild(tp);

    /* --- cost history: months across, metrics down ------------------------- */
    var hist = C.MONTHS.filter(function (x) { return C.rollup(x).byEmployee[id]; });
    var byM = {};
    hist.forEach(function (x) {
      var q = C.rollup(x).byEmployee[id];
      byM[x] = { ctc: q.ctc, pay: q.monthlyCost, tool: q.toolCost || 0, loaded: q.loadedCost || q.monthlyCost, proj: q.projectCost || 0,
        internal: q.internal || 0, alloc: q.allocated, bench: q.unallocated, pct: q.allocatedPct, n: q.lines.filter(function (l) { return l.projectId; }).length,
        licences: (q.tools || []).length };
    });
    var flags = {};
    hist.forEach(function (x, i) {
      if (i && byM[x].ctc !== byM[hist[i - 1]].ctc) flags[x] = 'Anniversary raise: ' + money(byM[hist[i - 1]].ctc) + ' → ' + money(byM[x].ctc) + ' a year';
      else if (!i) flags[x] = 'Joined · ' + C.mlabel(x);
    });
    var range = hist.length > 12 ? 12 : 0;              /* 12 = trailing twelve, 0 = everything */
    var body = el('<div></div>');
    function sum(ms, k) { return ms.reduce(function (t, x) { return t + byM[x][k]; }, 0); }
    function cellMoney(v, cls) { return v > 0.005 ? '<span class="' + (cls || '') + '">' + money(v) + '</span>' : '<span class="muted">—</span>'; }
    function drawHistory() {
      var ms = range ? hist.slice(-range) : hist;
      body.innerHTML = '';
      var chart = U.stackedColumnChart({
        months: ms, height: 200, totalLabel: 'Loaded cost',
        series: [{ label: 'Payroll', values: ms.map(function (x) { return byM[x].pay; }), color: 'var(--m-people)' },
                 { label: 'Software', values: ms.map(function (x) { return byM[x].tool; }), color: 'var(--m-other)' }],
        extra: function (i) { var q = byM[ms[i]]; return '<div class="t-row"><span class="t-key">Allocated</span><span>' + q.pct + '% · ' + money(q.alloc) + '</span></div>' +
          (q.bench > 0.5 ? '<div class="t-row"><span class="t-key">On the bench</span><span style="color:var(--err)">' + money(q.bench) + '</span></div>' : ''); },
        onClickMonth: function (x) { root.App.setMonth(x); }
      });
      var cw = el('<div style="padding:14px 20px 0"></div>'); cw.appendChild(chart); body.appendChild(cw);
      body.appendChild(el('<div class="pv-legend"><span><i style="background:var(--m-people)"></i>Payroll</span><span><i style="background:var(--m-other)"></i>Software licence share</span>' +
        '<span><i style="background:var(--s1);height:3px;border-radius:2px"></i>Raise or joining month</span></div>'));
      var tot = ms.length + (ms.length === 1 ? ' month' : ' months');
      body.appendChild(U.pivot({
        months: ms, current: m, flags: flags, corner: 'Per month', totalLabel: tot,
        onMonth: function (x) { root.App.setMonth(x); },
        rows: [
          { label: 'Annual CTC', sub: 'as recorded that month', cell: function (x) { return '<span class="dim">' + money(byM[x].ctc) + '</span>'; }, total: '<span class="dim">—</span>' },
          { label: 'Payroll', sub: 'CTC ÷ 12', cell: function (x) { return money(byM[x].pay); }, total: money(sum(ms, 'pay')) },
          { label: 'Software', sub: 'licence share', cell: function (x) { return byM[x].tool > 0.005 ? money(byM[x].tool) + '<span class="dim" style="font-size:11px"> · ' + byM[x].licences + '</span>' : '<span class="muted">—</span>'; }, total: cellMoney(sum(ms, 'tool')) },
          { label: 'Loaded cost', sub: 'payroll + software', cls: 'pv-strong', cell: function (x) { return money(byM[x].loaded); }, total: money(sum(ms, 'loaded')) },
          { label: 'On projects', sub: 'billable allocation', cls: 'pv-sep', cell: function (x) { return cellMoney(byM[x].proj); }, total: cellMoney(sum(ms, 'proj')) },
          { label: 'Internal', sub: 'non-billable', cell: function (x) { return cellMoney(byM[x].internal); }, total: cellMoney(sum(ms, 'internal')) },
          { label: 'Bench', sub: 'unallocated payroll', cell: function (x) { return cellMoney(byM[x].bench, 'bad'); }, total: cellMoney(sum(ms, 'bench'), 'bad') },
          { label: 'Allocation', sub: 'share of the month', cls: 'pv-sep', cell: function (x) { var q = byM[x]; return '<span class="' + (q.pct >= 100 ? 'ok' : q.pct >= 80 ? '' : 'bad') + '">' + q.pct + '%</span>'; },
            total: Math.round(ms.reduce(function (t, x) { return t + byM[x].pct; }, 0) / ms.length) + '% <span class="dim" style="font-size:11px">avg</span>' },
          { label: 'Projects', sub: 'charged that month', cell: function (x) { return byM[x].n || '<span class="muted">—</span>'; },
            total: Math.max.apply(null, ms.map(function (x) { return byM[x].n; })) + ' <span class="dim" style="font-size:11px">max</span>' }
        ]
      }));
    }
    drawHistory();
    var seg = null;
    if (hist.length > 12) {
      seg = el('<div class="seg-toggle" role="group" aria-label="History range"><button type="button" aria-pressed="true">Last 12 months</button><button type="button" aria-pressed="false">All ' + hist.length + ' months</button></div>');
      seg.querySelectorAll('button').forEach(function (b, i) {
        b.addEventListener('click', function () {
          range = i ? 0 : 12;
          seg.querySelectorAll('button').forEach(function (bb, j) { bb.setAttribute('aria-pressed', String(j === i)); });
          drawHistory();
        });
      });
    }
    var pn = U.panel('Cost history', 'Months across, costs down · click a month to open it · a raise only changes the months after it', body, true, seg);
    pn.style.marginTop = '16px';
    f.appendChild(pn);
    return f;
  };

  /* ================= ANALYTICS ============================================ */
  /* Company, client and project profitability live in part15_profitability.js as one 360 view. */

  V['emp-analytics'] = function (s) {
    var f = frag(), t12 = trailing12(s.month);
    f.appendChild(head('Employee analytics', 'Payroll, allocation and utilisation across the trailing twelve months.'));
    var m = s.month, c = C.rollup(m).company;
    var h = '<div class="kpis">';
    h += U.kpi('Total employee cost', moneyK(c.employeeCost), '<span>' + C.mlabel(m) + '</span>', true);
    h += U.kpi('Allocated', moneyK(c.allocatedEmpCost), '<span>' + pct(c.allocatedEmpCost / c.employeeCost) + ' of payroll</span>');
    h += U.kpi('On client projects', moneyK(c.projectEmpCost), '<span>' + pct(c.projectEmpCost / c.employeeCost) + ' billable-facing</span>');
    h += U.kpi('Unallocated', moneyK(c.unallocatedEmpCost), '<span>' + pct(c.unallocatedEmpCost / c.employeeCost) + '</span>');
    h += U.kpi('Software licences', moneyK(c.licenceCost || 0), '<span>' + money(c.headcount ? (c.licenceCost || 0) / c.headcount : 0) + ' per person</span>');
    h += U.kpi('Loaded cost', moneyK(c.employeeCost + (c.licenceCost || 0)), '<span>payroll + software</span>', true);
    h += U.kpi('Headcount', String(c.headcount), '<span>average ' + money(c.employeeCost / c.headcount) + '</span>');
    h += '</div>';
    f.appendChild(el(h));

    var g = el('<div class="grid-2" style="margin-top:16px"></div>');
    g.appendChild(U.panel('Payroll vs allocation', 'Trailing twelve months', U.lineChart({
      months: t12, height: 230, onClickMonth: function (x) { root.App.setMonth(x); },
      series: [
        { label: 'Total employee cost', color: 'var(--s1)', area: true, values: t12.map(function (x) { return C.rollup(x).company.employeeCost; }) },
        { label: 'Charged to projects', color: 'var(--s3)', values: t12.map(function (x) { return C.rollup(x).company.projectEmpCost; }) }
      ]
    })));
    g.appendChild(U.panel('Unallocated cost by month', 'Bench cost — the money with nowhere to go', U.columnChart({
      months: t12, values: t12.map(function (x) { return C.rollup(x).company.unallocatedEmpCost; }),
      label: 'Unallocated', height: 230, colorFor: function (v, i) {
        var e = C.rollup(t12[i]).company.employeeCost;
        return v / e > 0.08 ? 'var(--s2)' : 'var(--s1)';
      },
      onClickMonth: function (x) { root.App.setMonth(x); }
    })));
    f.appendChild(g);

    var r = C.rollup(m);
    var byDept = {};
    Object.keys(r.byEmployee).forEach(function (id) {
      var e = r.byEmployee[id];
      if (!byDept[e.dept]) byDept[e.dept] = { dept: e.dept, n: 0, cost: 0, tools: 0, project: 0, internal: 0, unalloc: 0 };
      var d = byDept[e.dept];
      d.n++; d.cost += e.monthlyCost; d.tools += e.toolCost || 0; d.project += e.projectCost; d.internal += e.internal; d.unalloc += e.unallocated;
    });
    var drows = Object.keys(byDept).map(function (k) { return byDept[k]; });
    var dt = U.table([
      { key: 'dept', label: 'Department', cell: function (d) { return '<strong>' + esc(d.dept) + '</strong>'; } },
      { key: 'n', label: 'People', num: true, cell: function (d) { return d.n; } },
      { key: 'cost', label: 'Payroll', num: true, cell: function (d) { return money(d.cost); } },
      { key: 'tools', label: 'Software', num: true, cell: function (d) { return d.tools > 0.005 ? money(d.tools) : '<span class="muted">—</span>'; } },
      { key: 'loaded', label: 'Loaded cost', num: true, sortVal: function (d) { return d.cost + d.tools; }, cell: function (d) { return '<strong>' + money(d.cost + d.tools) + '</strong>'; } },
      { key: 'project', label: 'To projects', num: true, cell: function (d) { return money(d.project); } },
      { key: 'internal', label: 'Internal', num: true, cell: function (d) { return money(d.internal); } },
      { key: 'unalloc', label: 'Unallocated', num: true, cell: function (d) { return money(d.unalloc); } },
      {
        key: 'util', label: 'Utilisation', num: true, sortVal: function (d) { return d.project / d.cost; },
        cell: function (d) {
          var u = d.project / d.cost;
          return '<div class="meter" style="justify-content:flex-end"><span class="bar" style="width:70px"><span style="width:' + (u * 100).toFixed(0) + '%;background:' + (u > 0.9 ? 'var(--s3)' : u > 0.8 ? 'var(--s1)' : 'var(--s2)') + '"></span></span><span class="mono">' + pct(u, 0) + '</span></div>';
        }
      }
    ], drows, { sortKey: 'cost' });
    var pn = U.panel('Cost and utilisation by department', C.mlabel(m), dt, true); pn.style.marginTop = '16px';
    f.appendChild(pn);
    return f;
  };

  /* ================= MONTH COMPARISON ===================================== */
  V.compare = function (s) {
    var f = frag();
    var a = s.compareA || C.maddMonths(s.month, -1), b = s.compareB || s.month;
    if (C.MONTHS.indexOf(a) === -1) a = C.MONTHS[0];
    f.appendChild(head('Month comparison', 'Any two months on record, side by side.'));
    var bar = el('<div class="filters"></div>');
    function picker(label, val, set) {
      var w = el('<label class="field"><span>' + label + '</span><select></select></label>');
      var sl = w.querySelector('select');
      C.MONTHS.forEach(function (m) {
        var o = el('<option value="' + m + '">' + C.mlabel(m) + '</option>');
        if (m === val) o.selected = true;
        sl.appendChild(o);
      });
      sl.addEventListener('change', function () { set(sl.value); root.App.render(); });
      bar.appendChild(w);
    }
    picker('Baseline month', a, function (v) { s.compareA = v; });
    picker('Comparison month', b, function (v) { s.compareB = v; });
    var yoy = btn('Same month last year', 'btn-sm', function () {
      var prev = C.maddMonths(s.month, -12);
      s.compareA = C.MONTHS.indexOf(prev) !== -1 ? prev : C.MONTHS[0];
      s.compareB = s.month; root.App.render();
    });
    yoy.style.marginBottom = '1px';
    bar.appendChild(yoy);
    f.appendChild(bar);

    var ca = C.rollup(a).company, cb = C.rollup(b).company;
    var rows = [
      ['Revenue', ca.revenue, cb.revenue, false],
      ['Employee cost (payroll)', ca.employeeCost, cb.employeeCost, true],
      ['Software licences', ca.licenceCost || 0, cb.licenceCost || 0, true],
      ['Loaded employee cost', ca.employeeCost + (ca.licenceCost || 0), cb.employeeCost + (cb.licenceCost || 0), true],
      ['Other cost (incl. licences)', ca.otherCost, cb.otherCost, true],
      ['Total cost', ca.totalCost, cb.totalCost, true],
      ['Gross profit', ca.profit, cb.profit, false],
      ['Unallocated employee cost', ca.unallocatedEmpCost, cb.unallocatedEmpCost, true]
    ];
    var h = '<div class="table-wrap"><table class="grid"><thead><tr><th>Metric</th><th class="n">' + C.mshort(a) + '</th><th class="n">' + C.mshort(b) + '</th><th class="n">Change</th><th class="n">%</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var d = r[2] - r[1], p = r[1] ? d / Math.abs(r[1]) * 100 : 0;
      h += '<tr><td><strong>' + r[0] + '</strong></td><td class="n">' + money(r[1]) + '</td><td class="n">' + money(r[2]) + '</td>' +
        '<td class="n">' + (d >= 0 ? '+' : '−') + money(Math.abs(d)).replace('$', '$') + '</td>' +
        '<td class="n">' + U.deltaChip(r[2], r[1], { inverse: r[3] }) + '</td></tr>';
    });
    var dm = (cb.margin - ca.margin) * 100;
    h += '<tr><td><strong>Gross margin</strong></td><td class="n">' + pct(ca.margin) + '</td><td class="n">' + pct(cb.margin) + '</td>' +
      '<td class="n">' + (dm >= 0 ? '+' : '−') + Math.abs(dm).toFixed(1) + ' pts</td><td class="n">' + U.deltaChip(cb.margin, ca.margin, { points: true }) + '</td></tr>';
    h += '</tbody></table></div>';
    f.appendChild(U.panel(C.mlabel(a) + ' vs ' + C.mlabel(b), 'Margin change is shown in percentage points, not percent', el(h), true));

    var pa = C.aggregateBy([a], 'client'), pb = C.aggregateBy([b], 'client');
    var byId = {};
    pa.forEach(function (r) { byId[r.id] = { id: r.id, name: r.name, a: r.revenue, b: 0, pa: r.profit, pb: 0 }; });
    pb.forEach(function (r) { if (!byId[r.id]) byId[r.id] = { id: r.id, name: r.name, a: 0, b: 0, pa: 0, pb: 0 }; byId[r.id].b = r.revenue; byId[r.id].pb = r.profit; });
    var crows = Object.keys(byId).map(function (k) { var x = byId[k]; x.diff = x.b - x.a; return x; });
    var ct = U.table([
      { key: 'name', label: 'Client', cell: function (r) { return '<strong class="link">' + esc(r.name) + '</strong>'; } },
      { key: 'a', label: C.mshort(a) + ' revenue', num: true, cell: function (r) { return money(r.a); } },
      { key: 'b', label: C.mshort(b) + ' revenue', num: true, cell: function (r) { return money(r.b); } },
      { key: 'diff', label: 'Change', num: true, cell: function (r) { return (r.diff >= 0 ? '+' : '−') + money(Math.abs(r.diff)).replace('$', '$'); } },
      { key: 'pdiff', label: 'Profit change', num: true, sortVal: function (r) { return r.pb - r.pa; }, cell: function (r) { var d = r.pb - r.pa; return (d >= 0 ? '+' : '−') + money(Math.abs(d)).replace('$', '$'); } }
    ], crows, { sortKey: 'diff', onRow: function (r) { root.App.go('client', { id: r.id }); } });
    var pn = U.panel('What moved, by client', 'Biggest swings first', ct, true); pn.style.marginTop = '16px';
    f.appendChild(pn);
    return f;
  };

  root.VIEWS2READY = true;
})(typeof window !== 'undefined' ? window : globalThis);
