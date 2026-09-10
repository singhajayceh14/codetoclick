/* ============================================================================
   Reporting centre, management report, settings.
   ========================================================================== */
(function (root) {
  'use strict';
  var C = root.CTC, U = root.UI, V = root.VIEWS, H = root.VIEWHELP;
  var money = U.money, moneyK = U.moneyK, pct = U.pct, esc = U.esc, el = U.el;
  var frag = H.frag, head = H.head, btn = H.btn;

  var REPORTS = [
    { id: 'company', name: 'Company monthly report', desc: 'Revenue, employee cost, other cost, total cost, profit and margin for the period.' },
    { id: 'client', name: 'Client monthly report', desc: 'One row per client: revenue, cost, profit, margin.' },
    { id: 'project', name: 'Project monthly report', desc: 'One row per project with the client, both cost legs and the margin band.' },
    { id: 'employee', name: 'Employee monthly cost report', desc: 'CTC, monthly cost, allocated and unallocated cost, projects worked.' },
    { id: 'allocation', name: 'Allocation report', desc: 'Every employee-to-project allocation line and the cost it carries.' },
    { id: 'revenue', name: 'Revenue report', desc: 'Month, client, project and revenue for every revenue record.' },
    { id: 'cost', name: 'Cost report', desc: 'Month, client, project, category and amount for every non-payroll cost.' }
  ];

  V.reports = function (s) {
    var f = frag(), p = H.periodBlock(s);
    f.appendChild(head('Report centre', 'Every report is bound to the period selected above — currently <strong>' + esc(p.label) + '</strong>.'));
    var g = el('<div class="grid-3"></div>');
    var mgmt = el('<div><p style="margin:0 0 12px;font-size:12.8px;color:var(--text-2)">A written month-end summary for the owner: performance, movement, top clients, margin outliers and where payroll went.</p></div>');
    mgmt.appendChild(btn('Open management report', 'btn-primary', function () { root.App.go('report-management'); }));
    g.appendChild(U.panel('Monthly management report', C.mlabel(s.month), mgmt));
    REPORTS.forEach(function (r) {
      var body = el('<div><p style="margin:0 0 12px;font-size:12.8px;color:var(--text-2)">' + esc(r.desc) + '</p></div>');
      body.appendChild(btn('Run report', '', function () { root.App.go('report', { id: r.id }); }));
      g.appendChild(U.panel(r.name, null, body));
    });
    f.appendChild(g);
    return f;
  };

  V.report = function (s) {
    var f = frag(), p = H.periodBlock(s), id = s.params.id;
    var def = REPORTS.filter(function (r) { return r.id === id; })[0] || REPORTS[0];
    var data = buildReport(id, p);

    // the report builder emits display strings; recover a number for sorting so
    // money and percentage columns order correctly rather than alphabetically
    function numOf(v) {
      var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '').replace(/^$/, 'x'));
      return isNaN(n) ? null : (String(v).indexOf('−') === 0 || String(v).indexOf('-') === 0 ? -n : n);
    }
    var cols = data.cols.map(function (label, i) {
      return {
        key: 'c' + i, label: label, num: !!data.num[i],
        sortVal: function (row) { return data.num[i] ? (numOf(row[i]) || 0) : String(row[i]); },
        cell: function (row) { return data.num[i] ? '<span class="mono">' + esc(row[i]) + '</span>' : esc(row[i]); }
      };
    });
    var foot = null;
    if (data.foot) {
      foot = {};
      data.foot.forEach(function (v, i) { foot['c' + i] = esc(v); });
    }

    f.appendChild(head(def.name, esc(def.desc) + '<br>Period: <strong>' + esc(p.label) + '</strong>',
      [btn('← Report centre', '', function () { root.App.go('reports'); })]));
    var shell = el('<section class="panel"></section>');
    shell.appendChild(U.table(cols, data.rows, {
      foot: foot, id: 'report-' + id, pageSize: 25, empty: 'No records in this period.',
      title: def.name, subtitle: 'Code to Click · ' + p.label, exportName: def.name + ' ' + p.label
    }));
    f.appendChild(shell);
    return f;
  };

  function buildReport(id, p) {
    var cols, num, rows = [], foot = null;
    if (id === 'company') {
      cols = ['Month', 'Revenue', 'Employee cost', 'Contribution after people', 'People margin', 'Other cost', 'Profit', 'Margin'];
      num = [0, 1, 1, 1, 1, 1, 1, 1];
      var pmf = function (rv, ec) { return rv ? pct((rv - ec) / rv) : '—'; };
      p.months.forEach(function (m) {
        var c = C.rollup(m).company;
        rows.push([C.mlabel(m), money(c.revenue), money(c.employeeCost), money(c.revenue - c.employeeCost), pmf(c.revenue, c.employeeCost), money(c.otherCost), money(c.profit), pct(c.margin)]);
      });
      foot = ['Total', money(p.agg.revenue), money(p.agg.employeeCost), money(p.agg.revenue - p.agg.employeeCost), pmf(p.agg.revenue, p.agg.employeeCost), money(p.agg.otherCost), money(p.agg.profit), pct(p.agg.margin)];
    } else if (id === 'client') {
      cols = ['Client', 'Revenue', 'Employee cost', 'Contribution after people', 'People margin', 'Other cost', 'Profit', 'Margin'];
      num = [0, 1, 1, 1, 1, 1, 1, 1];
      var cs = C.aggregateBy(p.months, 'client').sort(function (a, b) { return b.revenue - a.revenue; }), te = 0, to = 0, tr = 0;
      cs.forEach(function (r) {
        te += r.empCost; to += r.otherCost; tr += r.revenue;
        rows.push([r.name, money(r.revenue), money(r.empCost), money(r.revenue - r.empCost), r.revenue ? pct((r.revenue - r.empCost) / r.revenue) : '—', money(r.otherCost), money(r.profit), pct(r.margin)]);
      });
      foot = ['All clients', money(tr), money(te), money(tr - te), tr ? pct((tr - te) / tr) : '—', money(to), money(tr - te - to), tr ? pct((tr - te - to) / tr) : '—'];
    } else if (id === 'project') {
      cols = ['Project', 'Client', 'Revenue', 'Employee cost', 'Contribution after people', 'People margin', 'Other cost', 'Profit', 'Margin', 'Band'];
      num = [0, 0, 1, 1, 1, 1, 1, 1, 1, 0];
      C.aggregateBy(p.months, 'project').sort(function (a, b) { return b.revenue - a.revenue; }).forEach(function (r) {
        var bill = r.billable !== false;
        rows.push([r.name, (H.clientOf(r.id) || {}).name || '', bill ? money(r.revenue) : '—', money(r.empCost),
          bill ? money(r.revenue - r.empCost) : '—', bill && r.revenue ? pct((r.revenue - r.empCost) / r.revenue) : '—', money(r.otherCost),
          bill ? money(r.profit) : '—', bill ? pct(r.margin) : '—', bill ? U.band(r.margin).label : 'Non-billable']);
      });
    } else if (id === 'employee') {
      cols = ['Employee', 'Department', 'Annual CTC', 'Payroll', 'Software', 'Loaded cost', 'Allocated cost', 'Unallocated cost', 'Projects'];
      num = [0, 0, 1, 1, 1, 1, 1, 1, 1];
      var acc = {};
      p.months.forEach(function (m) {
        var r = C.rollup(m);
        Object.keys(r.byEmployee).forEach(function (eid) {
          var e = r.byEmployee[eid];
          if (!acc[eid]) acc[eid] = { name: e.name, dept: e.dept, ctc: e.ctc, cost: 0, tools: 0, alloc: 0, un: 0, projects: {} };
          acc[eid].ctc = e.ctc; acc[eid].cost += e.monthlyCost; acc[eid].tools += e.toolCost || 0; acc[eid].alloc += e.allocated; acc[eid].un += e.unallocated;
          e.lines.forEach(function (l) { if (l.projectId) acc[eid].projects[l.projectId] = 1; });
        });
      });
      Object.keys(acc).forEach(function (k) {
        var a = acc[k];
        rows.push([a.name, a.dept, money(a.ctc), money(a.cost), money(a.tools), money(a.cost + a.tools), money(a.alloc), money(a.un), String(Object.keys(a.projects).length)]);
      });
      rows.sort(function (a, b) { return a[0].localeCompare(b[0]); });
      foot = ['Total', '', '', money(p.agg.employeeCost), money(p.agg.licenceCost || 0), money(p.agg.employeeCost + (p.agg.licenceCost || 0)), money(p.agg.employeeCost - p.agg.unallocatedEmpCost), money(p.agg.unallocatedEmpCost), ''];
    } else if (id === 'allocation') {
      cols = ['Month', 'Employee', 'Project', 'Allocation %', 'Allocated cost'];
      num = [0, 0, 0, 1, 1];
      p.months.forEach(function (m) {
        var r = C.rollup(m);
        Object.keys(r.byEmployee).forEach(function (eid) {
          var e = r.byEmployee[eid];
          e.lines.forEach(function (l) {
            rows.push([C.mlabel(m), e.name, l.projectId ? H.projName(l.projectId) : 'Internal', l.pct + '%', money(l.amount)]);
          });
        });
      });
    } else if (id === 'revenue') {
      cols = ['Month', 'Client', 'Project', 'Revenue type', 'Revenue'];
      num = [0, 0, 0, 0, 1];
      p.months.forEach(function (m) {
        var r = C.rollup(m);
        Object.keys(r.byProject).forEach(function (pid) {
          var pr = r.byProject[pid];
          if (!pr.revenue) return;
          rows.push([C.mlabel(m), (H.clientOf(pid) || {}).name || '', pr.name, pr.type, money(pr.revenue)]);
        });
      });
      foot = ['Total', '', '', '', money(p.agg.revenue)];
    } else {
      cols = ['Month', 'Client', 'Project', 'Category', 'Source', 'Cost'];
      num = [0, 0, 0, 0, 0, 1];
      p.months.forEach(function (m) {
        var r = C.rollup(m), agg = {};
        C.costLines(m).forEach(function (o) {
          var k = (o.projectId || '~') + '|' + o.category + '|' + (o.source === 'licence' ? o.name : 'Booked');
          agg[k] = (agg[k] || 0) + o.amount;
        });
        Object.keys(agg).forEach(function (k) {
          var parts = k.split('|'), pid = parts[0] === '~' ? null : parts[0];
          rows.push([C.mlabel(m), pid ? (H.clientOf(pid) || {}).name || '' : 'Company-level',
            pid ? r.byProject[pid].name : 'Not project-specific', parts[1], parts[2], money(agg[k])]);
        });
      });
      foot = ['Total', '', '', '', '', money(p.agg.otherCost)];
    }
    return { cols: cols, num: num, rows: rows, foot: foot };
  }

  /* ================= MANAGEMENT REPORT ====================================
     A board pack, not a scrolling document: the headline strip answers the
     five questions in one row, the middle band puts the P&L, the money
     flow and the year trend side by side, and the bottom band ranks what
     management has to act on. Every figure is computed from the month's
     own records; nothing here is typed in.                                 */
  function share(part, whole) { return whole ? part / whole : 0; }
  function chg(cur, prev) { return prev ? (cur - prev) / Math.abs(prev) : null; }
  function signedPct(x, dp) { return x == null ? '—' : (x >= 0 ? '+' : '−') + (Math.abs(x) * 100).toFixed(dp == null ? 1 : dp) + '%'; }
  function pts(x) { return x == null ? '—' : (x >= 0 ? '+' : '−') + (Math.abs(x) * 100).toFixed(1) + ' pts'; }
  function tone(x, inverse) { if (x == null || Math.abs(x) < 0.0005) return 'flat'; return (inverse ? x < 0 : x > 0) ? 'up' : 'down'; }
  function card(title, note, bodyNode, cls) {
    var c = el('<section class="rp-card' + (cls ? ' ' + cls : '') + '"><header class="rp-head"><h3>' + esc(title) + '</h3>' +
      (note ? '<span class="rp-note">' + note + '</span>' : '') + '</header><div class="rp-body"></div></section>');
    c.querySelector('.rp-body').appendChild(bodyNode);
    return c;
  }

  V['report-management'] = function (s) {
    var f = frag(), m = s.month, r = C.rollup(m), c = r.company;
    var prevM = C.maddMonths(m, -1), hasPrev = C.MONTHS.indexOf(prevM) !== -1;
    var pc = hasPrev ? C.rollup(prevM).company : null;
    var yoyM = C.maddMonths(m, -12), hasYoY = C.MONTHS.indexOf(yoyM) !== -1;
    var yc = hasYoY ? C.rollup(yoyM).company : null;
    var band = U.band(c.margin);
    var clients = C.aggregateBy([m], 'client').sort(function (a, b) { return b.revenue - a.revenue; });
    var projs = C.aggregateBy([m], 'project').filter(function (x) { return x.billable; });
    var weak = projs.filter(function (x) { return x.margin < U.BANDS.watch; }).sort(function (a, b) { return a.margin - b.margin; });
    var best = projs.slice().sort(function (a, b) { return b.margin - a.margin; }).slice(0, 5);
    var top3 = clients.slice(0, 3).reduce(function (t, x) { return t + x.revenue; }, 0);
    var util = share(c.projectEmpCost, c.employeeCost);
    var bench = share(c.unallocatedEmpCost, c.employeeCost);
    var t12 = H.trailing12(m);

    /* --- page head -------------------------------------------------------- */
    f.appendChild(head('Management report',
      '<strong>' + esc(C.mlabel(m)) + '</strong> &middot; Code to Click &middot; prepared from this month’s records only' +
      (hasPrev ? ' &middot; compared with ' + esc(C.mlabel(prevM)) : ''),
      [btn('Export PDF', 'btn-primary', function () { managementPDF(s, m); }, 'download'),
       btn('Report centre', '', function () { root.App.go('reports'); })],
      '<div class="ph-stamp ' + (band.key === 'healthy' ? '' : band.key === 'watch' ? 'watch' : 'closed') + '"><span class="dotlive"></span>' +
        'Company margin ' + esc(band.label.toLowerCase()) + ' &middot; ' + pct(c.margin) + '</div>'));

    var doc = el('<div class="rp"></div>');

    /* --- 1. headline strip ------------------------------------------------- */
    function cell(label, value, mom, yoy, opts) {
      opts = opts || {};
      var momTxt = opts.points ? pts(mom) : signedPct(mom), yoyTxt = opts.points ? pts(yoy) : signedPct(yoy);
      return '<div class="rp-kpi"><span class="k-l">' + esc(label) + '</span>' +
        '<span class="k-v num">' + value + '</span>' +
        '<span class="k-d"><span class="delta ' + tone(mom, opts.inverse) + '">' + momTxt + '</span><span class="k-vs">vs ' + esc(C.mshort(prevM)) + '</span></span>' +
        (yc ? '<span class="k-d"><span class="delta ' + tone(yoy, opts.inverse) + '">' + yoyTxt + '</span><span class="k-vs">vs ' + esc(C.mshort(yoyM)) + '</span></span>' : '') +
        '</div>';
    }
    doc.appendChild(el('<div class="rp-strip">' +
      cell('Revenue', moneyK(c.revenue), chg(c.revenue, pc && pc.revenue), chg(c.revenue, yc && yc.revenue)) +
      cell('Total cost', moneyK(c.totalCost), chg(c.totalCost, pc && pc.totalCost), chg(c.totalCost, yc && yc.totalCost), { inverse: true }) +
      cell('Gross profit', moneyK(c.profit), chg(c.profit, pc && pc.profit), chg(c.profit, yc && yc.profit)) +
      cell('Gross margin', pct(c.margin), pc ? c.margin - pc.margin : null, yc ? c.margin - yc.margin : null, { points: true }) +
      cell('Utilisation', pct(util, 0), pc ? util - share(pc.projectEmpCost, pc.employeeCost) : null, yc ? util - share(yc.projectEmpCost, yc.employeeCost) : null, { points: true }) +
      cell('Bench', pct(bench), pc ? bench - share(pc.unallocatedEmpCost, pc.employeeCost) : null, yc ? bench - share(yc.unallocatedEmpCost, yc.employeeCost) : null, { points: true, inverse: true }) +
      '</div>'));

    /* --- 2. executive summary -------------------------------------------- */
    if (pc) {
      var rv = chg(c.revenue, pc.revenue), cv = chg(c.totalCost, pc.totalCost), pv = chg(c.profit, pc.profit);
      doc.appendChild(el('<p class="rp-summary"><strong>' + esc(C.mlabel(m)) + ' closed at ' + money(c.profit) + ' gross profit on ' + money(c.revenue) + ' of revenue.</strong> ' +
        'Revenue ' + (rv >= 0 ? 'rose' : 'fell') + ' ' + (Math.abs(rv) * 100).toFixed(1) + '% against ' + esc(C.mlabel(prevM)) +
        ' while total cost ' + (cv >= 0 ? 'rose' : 'fell') + ' ' + (Math.abs(cv) * 100).toFixed(1) + '%, so profit ' +
        (pv >= 0 ? 'improved' : 'declined') + ' ' + (Math.abs(pv) * 100).toFixed(1) + '% and the margin moved ' +
        ((c.margin - pc.margin) >= 0 ? 'up' : 'down') + ' ' + (Math.abs(c.margin - pc.margin) * 100).toFixed(1) + ' points to ' + pct(c.margin) + '. ' +
        (yc ? 'Year on year, revenue is ' + signedPct(chg(c.revenue, yc.revenue)) + ' at a ' + pts(c.margin - yc.margin) + ' margin. ' : '') +
        pct(util, 0) + ' of payroll reached a client project; ' + money(c.unallocatedEmpCost) + ' (' + pct(bench) + ') sat on the bench' +
        (weak.length ? ', and ' + weak.length + ' project' + (weak.length > 1 ? 's' : '') + ' finished below the ' + pct(U.BANDS.watch, 0) + ' margin threshold.' : '.') +
        '</p>'));
    }

    /* --- 3. middle band: P&L | money flow | trend ------------------------- */
    var band2 = el('<div class="rp-grid rp-3"></div>');

    /* P&L with prior month and variance */
    var pl = [
      ['Revenue', c.revenue, pc && pc.revenue, 'head'],
      ['People on projects', -c.projectEmpCost, pc && -pc.projectEmpCost],
      ['Other project cost', -(c.otherCost - c.companyOtherCost), pc && -(pc.otherCost - pc.companyOtherCost)],
      ['Contribution', c.projectContribution, pc && pc.projectContribution, 'total'],
      ['Internal time', -c.internalEmpCost, pc && -pc.internalEmpCost],
      ['Bench', -c.unallocatedEmpCost, pc && -pc.unallocatedEmpCost],
      ['Overhead', -c.companyOtherCost, pc && -pc.companyOtherCost],
      ['Gross profit', c.profit, pc && pc.profit, 'total'],
      ['Margin', c.margin, pc && pc.margin, 'pct']
    ];
    var plh = '<table class="grid mini pl"><thead><tr><th></th><th class="n">' + esc(C.mshort(m)) + '</th>' +
      (pc ? '<th class="n">' + esc(C.mshort(prevM)) + '</th><th class="n">Change</th>' : '') + '</tr></thead><tbody>';
    pl.forEach(function (row) {
      var kind = row[3] || '', cur = row[1], prev = row[2];
      var isPct = kind === 'pct';
      var fmt = function (v) { return isPct ? pct(v) : (v < 0 ? '−' + money(-v) : money(v)); };
      var d = isPct ? (prev != null ? cur - prev : null) : chg(cur, prev);
      var better = kind === 'total' || kind === 'head' || isPct ? d : (d == null ? null : -d);
      plh += '<tr class="' + kind + '"><td>' + esc(row[0]) + '</td><td class="n">' + fmt(cur) + '</td>' +
        (pc ? '<td class="n muted">' + (prev == null ? '—' : fmt(prev)) + '</td><td class="n"><span class="delta ' + tone(better) + '">' +
          (isPct ? pts(d) : signedPct(d)) + '</span></td>' : '') + '</tr>';
    });
    band2.appendChild(card('Profit and loss', 'booked figures, nothing apportioned', el(plh + '</tbody></table>'), 'span-pl'));

    /* money flow: two compact composition bars */
    var flow = el('<div class="rp-flow"></div>');
    flow.appendChild(el('<div class="rp-sub">Where payroll went &middot; ' + money(c.employeeCost) + '</div>'));
    flow.appendChild(U.segbar([
      { label: 'Client projects', value: c.projectEmpCost, color: 'var(--m-revenue)' },
      { label: 'Internal work', value: c.internalEmpCost, color: 'var(--m-people)' },
      { label: 'Bench', value: c.unallocatedEmpCost, color: 'var(--m-cost)' }
    ], c.employeeCost, { aria: 'Payroll split' }));
    flow.appendChild(el('<div class="rp-sub" style="margin-top:16px">Cost composition &middot; ' + money(c.totalCost) + '</div>'));
    var catCols = ['var(--s1)', 'var(--s3)', 'var(--s2)', 'var(--s4)', 'var(--s5)', 'var(--m-other)'];
    flow.appendChild(U.segbar([{ label: 'Employee cost', value: c.employeeCost, color: 'var(--text-3)' }].concat(
      C.COST_GROUPS.map(function (cat, i) { return { label: cat, value: c.otherByCategory[cat] || 0, color: catCols[i % catCols.length] }; })
    ), c.totalCost, { aria: 'Cost composition' }));
    band2.appendChild(card('Where the money went', null, flow));

    /* year trend */
    var series = function (k) { return t12.map(function (x) { return C.rollup(x).company[k]; }); };
    var trend = el('<div class="rp-trend"></div>');
    trend.appendChild(U.lineChart({
      months: t12, height: 236, zeroBase: true,
      series: [
        { label: 'Revenue', color: 'var(--m-revenue)', area: true, values: series('revenue') },
        { label: 'Total cost', color: 'var(--m-cost)', values: series('totalCost') },
        { label: 'Gross profit', color: 'var(--m-profit)', values: series('profit') }
      ], aria: 'Twelve-month trend of revenue, cost and profit'
    }));
    var marg = t12.map(function (x) { return C.rollup(x).company.margin; });
    var lo = Math.min.apply(null, marg), hi = Math.max.apply(null, marg);
    trend.appendChild(el('<div class="rp-trend-foot"><span>Margin over the year</span>' +
      '<span class="num">' + pct(lo) + ' – ' + pct(hi) + '</span>' +
      '<span class="rp-mini">' + U.sparkline(marg, 'var(--m-margin)', 200, 28, { labels: t12.map(function (x) { return C.mshort(x); }), name: 'Margin', fmt: 'pct' }) + '</span></div>'));
    band2.appendChild(card('Twelve-month trend', 'to ' + esc(C.mshort(m)), trend));
    doc.appendChild(band2);

    /* --- 4. bottom band: clients | best | watch list ---------------------- */
    var band3 = el('<div class="rp-grid rp-3 even"></div>');

    var ct = '<table class="grid mini rank"><thead><tr><th>Client</th><th class="n">Revenue</th><th class="n">Share</th><th class="n">Margin</th></tr></thead><tbody>';
    clients.slice(0, 6).forEach(function (x, i) {
      ct += '<tr><td><span class="rk">' + (i + 1) + '</span>' + esc(x.name) + '</td><td class="n">' + money(x.revenue) + '</td>' +
        '<td class="n"><span class="sharebar" style="--w:' + (share(x.revenue, c.revenue) * 100).toFixed(1) + '%"></span>' + pct(share(x.revenue, c.revenue), 0) + '</td>' +
        '<td class="n">' + U.marginPill(x.margin) + '</td></tr>';
    });
    band3.appendChild(card('Top clients', 'top three are ' + pct(share(top3, c.revenue), 0) + ' of revenue' +
      (share(top3, c.revenue) > 0.6 ? ' <span class="pill watch">concentration</span>' : ''), el(ct + '</tbody></table>')));

    var bt = '<table class="grid mini rank"><thead><tr><th>Project</th><th class="n">Revenue</th><th class="n">Margin</th></tr></thead><tbody>';
    best.forEach(function (x, i) {
      bt += '<tr><td><span class="rk">' + (i + 1) + '</span>' + esc(x.name) + '<small>' + esc((H.clientOf(x.id) || {}).name || '') + '</small></td>' +
        '<td class="n">' + money(x.revenue) + '</td><td class="n">' + U.marginPill(x.margin) + '</td></tr>';
    });
    band3.appendChild(card('Highest-margin projects', best.length + ' of ' + projs.length + ' active', el(bt + '</tbody></table>')));

    var wt;
    if (!weak.length) wt = el(U.emptyState('Every project cleared the threshold', 'No active project finished below ' + pct(U.BANDS.watch, 0) + ' margin this month.', '', 'trend'));
    else {
      var wh = '<table class="grid mini rank"><thead><tr><th>Project</th><th class="n">Revenue</th><th class="n">Cost</th><th class="n">Margin</th></tr></thead><tbody>';
      weak.forEach(function (x) {
        wh += '<tr><td>' + esc(x.name) + '<small>' + esc((H.clientOf(x.id) || {}).name || '') + '</small></td>' +
          '<td class="n">' + money(x.revenue) + '</td><td class="n">' + money(x.totalCost) + '</td><td class="n">' + U.marginPill(x.margin) + '</td></tr>';
      });
      wt = el(wh + '</tbody></table>');
    }
    band3.appendChild(card('Watch list', weak.length ? weak.length + ' below ' + pct(U.BANDS.watch, 0) + ' &middot; ' +
      money(weak.reduce(function (t, x) { return t + x.revenue; }, 0)) + ' of revenue' : 'nothing to flag', wt, weak.length ? 'rp-warn' : ''));
    doc.appendChild(band3);

    /* --- 5. notes: compact insight cards ---------------------------------- */
    var notes = el('<div class="insights-row rp-notes"></div>');
    H.insights(s, H.periodBlock({ period: 'month', month: m, custom: null })).slice(0, 6).forEach(function (i) {
      var kind = i.tone === 'pos' ? 'good' : i.tone === 'neg' ? 'crit' : i.tone === 'warnc' ? 'warn' : '';
      notes.appendChild(el(U.insightCard('<strong>' + esc(i.text) + '</strong>' + (i.why ? '<br>' + esc(i.why) : ''), kind,
        kind === 'good' ? 'trend' : kind === 'crit' || kind === 'warn' ? 'info' : 'spark')));
    });
    doc.appendChild(card('Notes for management', 'generated from the month’s records', notes, 'rp-flat'));

    f.appendChild(doc);
    return f;
  };

  /* ---------- the management report as a typeset PDF ----------------------- */
  function managementPDF(s, m) {
    var r = C.rollup(m), c = r.company;
    var prevM = C.maddMonths(m, -1), pc = C.MONTHS.indexOf(prevM) !== -1 ? C.rollup(prevM).company : null;
    var clients = C.aggregateBy([m], 'client').sort(function (a, b) { return b.revenue - a.revenue; });
    var projs = C.aggregateBy([m], 'project').filter(function (x) { return x.billable; });
    var strong = projs.slice().sort(function (a, b) { return b.margin - a.margin; }).slice(0, 5);
    var weak = projs.filter(function (x) { return x.margin < U.BANDS.watch; }).sort(function (a, b) { return a.margin - b.margin; });

    var narrative = pc
      ? 'Revenue ' + (c.revenue >= pc.revenue ? 'rose' : 'fell') + ' ' + Math.abs((c.revenue - pc.revenue) / pc.revenue * 100).toFixed(1) +
      '% against ' + C.mlabel(prevM) + ', while total cost ' + (c.totalCost >= pc.totalCost ? 'rose' : 'fell') + ' ' +
      Math.abs((c.totalCost - pc.totalCost) / pc.totalCost * 100).toFixed(1) + '%. Gross profit ' +
      (c.profit >= pc.profit ? 'improved' : 'declined') + ' ' + Math.abs((c.profit - pc.profit) / Math.abs(pc.profit) * 100).toFixed(1) +
      '% and the margin moved ' + ((c.margin - pc.margin) >= 0 ? 'up' : 'down') + ' ' +
      Math.abs((c.margin - pc.margin) * 100).toFixed(1) + ' percentage points to ' + pct(c.margin) + '.'
      : 'First month on record.';

    root.EXP.exportDocument({
      name: 'Management report ' + C.mlabel(m),
      title: C.mlabel(m) + ' management report',
      subtitle: 'Code to Click · prepared from ' + C.mlabel(m) + ' records only. Every figure is a booked monthly amount; nothing is apportioned.',
      kpis: [
        { label: 'Revenue', value: moneyK(c.revenue) },
        { label: 'Total cost', value: moneyK(c.totalCost) },
        { label: 'Gross profit', value: moneyK(c.profit) },
        { label: 'Gross margin', value: pct(c.margin) }
      ],
      sections: [
        { heading: 'Company performance', text: narrative },
        {
          heading: 'Clients this month',
          cols: [{ label: 'Client' }, { label: 'Revenue', num: 1 }, { label: 'Cost', num: 1 }, { label: 'Profit', num: 1 }, { label: 'Margin', num: 1 }],
          rows: clients.map(function (x) { return [x.name, money(x.revenue), money(x.totalCost), money(x.profit), pct(x.margin)]; }),
          foot: ['All clients', money(c.revenue), money(c.projectEmpCost + c.otherCost - c.companyOtherCost), money(c.projectContribution), pct(c.projectContribution / c.revenue)]
        },
        {
          heading: 'Strongest projects by margin',
          cols: [{ label: 'Project' }, { label: 'Client' }, { label: 'Revenue', num: 1 }, { label: 'Profit', num: 1 }, { label: 'Margin', num: 1 }],
          rows: strong.map(function (x) { return [x.name, (H.clientOf(x.id) || {}).name || '', money(x.revenue), money(x.profit), pct(x.margin)]; })
        },
        {
          heading: 'Projects below the ' + pct(U.BANDS.watch, 0) + ' threshold',
          text: weak.length ? null : 'None — every active project cleared the threshold this month.',
          cols: weak.length ? [{ label: 'Project' }, { label: 'Client' }, { label: 'Revenue', num: 1 }, { label: 'Total cost', num: 1 }, { label: 'Margin', num: 1 }] : null,
          rows: weak.map(function (x) { return [x.name, (H.clientOf(x.id) || {}).name || '', money(x.revenue), money(x.totalCost), pct(x.margin)]; })
        },
        {
          heading: 'From project contribution to company profit',
          cols: [{ label: 'Step' }, { label: 'Amount', num: 1 }],
          rows: [
            ['Project revenue', money(c.revenue)],
            ['Employee cost charged to projects', '\u2212' + money(c.projectEmpCost)],
            ['Other cost charged to projects', '\u2212' + money(c.otherCost - c.companyOtherCost)],
            ['Project contribution', money(c.projectContribution)],
            ['Internal / non-billable time', '\u2212' + money(c.internalEmpCost)],
            ['Unallocated employee cost (bench)', '\u2212' + money(c.unallocatedEmpCost)],
            ['Company-level other cost', '\u2212' + money(c.companyOtherCost)]
          ],
          foot: ['Company gross profit', money(c.profit)]
        },
        {
          heading: 'Where payroll went',
          cols: [{ label: 'Destination' }, { label: 'Amount', num: 1 }, { label: 'Share of payroll', num: 1 }],
          rows: [
            ['Client projects', money(c.projectEmpCost), pct(c.projectEmpCost / c.employeeCost)],
            ['Internal work', money(c.internalEmpCost), pct(c.internalEmpCost / c.employeeCost)],
            ['Bench (unallocated)', money(c.unallocatedEmpCost), pct(c.unallocatedEmpCost / c.employeeCost)]
          ],
          foot: ['Total payroll', money(c.employeeCost), '100.0%']
        },
        {
          heading: 'Other cost by category',
          cols: [{ label: 'Category' }, { label: 'Amount', num: 1 }, { label: 'Share of other cost', num: 1 }],
          rows: C.COST_GROUPS.map(function (cat) { return [cat, money(c.otherByCategory[cat] || 0), pct(c.otherCost ? (c.otherByCategory[cat] || 0) / c.otherCost : 0)]; }),
          foot: ['Total other cost', money(c.otherCost), '100.0%']
        },
        {
          heading: 'Software licences in ' + C.mlabel(m),
          cols: [{ label: 'Licence' }, { label: 'Per month', num: 1 }, { label: 'Shared by', num: 1 }, { label: 'Each', num: 1 }, { label: 'To projects', num: 1 }, { label: 'Overhead', num: 1 }],
          rows: (c.licences || []).map(function (l) { return [l.name, money(l.charge), String(l.carriers), money(l.share), money(l.charge - l.company), money(l.company)]; }),
          foot: ['Total licence cost', money(c.licenceCost || 0), '', '', money(c.licenceProjectCost || 0), money(c.licenceCompanyCost || 0)]
        }
      ]
    });
  }

})(typeof window !== 'undefined' ? window : globalThis);
