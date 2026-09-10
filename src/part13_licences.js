/* ============================================================================
   Software and licences.

   A licence is bought once and paid for over a period; the product spreads the
   price evenly across the months of that period and charges each month's
   share to the people who use it. Project-specific licences are project cost,
   split across that project's team for the month. Company-wide licences are
   overhead, split across everyone on payroll. Each person's share sits beside
   their payroll as "software cost", so their loaded cost is visible.

   The charge is derived from the register every time a month is computed; it
   is never typed into a month, so a licence edited today re-states the months
   it covers. That is the honest behaviour for a contract: the price and the
   period are facts about the purchase, not about the month.
   ========================================================================== */
(function (root) {
  'use strict';
  var C = root.CTC, U = root.UI, V = root.VIEWS, H = root.VIEWHELP;
  var money = U.money, moneyK = U.moneyK, pct = U.pct, esc = U.esc, el = U.el, icon = U.icon;
  var field = U.field, grid = U.formGrid, section = U.formSection;

  function monthOpts() { return C.MONTHS.map(function (m) { return { v: m, l: C.mlabel(m) }; }); }
  function monthly(l) { return l.price / l.months; }
  function periodLabel(l) { return C.mshort(l.start) + ' → ' + C.mshort(C.licenceEnd(l)); }
  function statusOf(l, month) {
    if (C.licenceActive(l, month)) return { cls: 'good', label: 'Active' };
    if (C.mindex(month) < C.mindex(l.start)) return { cls: 'watch', label: 'Starts ' + C.mshort(l.start) };
    return { cls: 'neutral', label: 'Ended ' + C.mshort(C.licenceEnd(l)) };
  }
  function refresh() { var y = window.scrollY; root.App.render(); window.scrollTo(0, y); }

  /* ---------- add / edit dialog --------------------------------------------- */
  root.App.dialogs.licence = function (id) { licenceDialog(id || null); };
  function licenceDialog(id) {
    var l = id ? C.byId(C.LICENCES, id) : null;
    var s = root.App.state;
    var name = field({ label: 'Licence', required: true, value: l ? l.name : '', placeholder: 'e.g. Salesforce Developer Pro Sandbox' });
    var vendor = field({ label: 'Vendor', value: l ? l.vendor : '', placeholder: 'e.g. Salesforce' });
    var price = field({ label: 'Total price', type: 'number', min: 0, step: 100, prefix: (root.SET && root.SET.get().currency === 'INR') ? '₹' : '$', value: l ? l.price : 0, required: true });
    var start = field({ label: 'Licence starts', type: 'select', value: l ? l.start : s.month, options: monthOpts() });
    var months = field({ label: 'Period (months)', type: 'number', min: 1, max: 60, step: 1, value: l ? l.months : 12, required: true, hint: 'The price is spread evenly over these months.' });
    var note = field({ label: 'Note', value: l ? l.note : '', placeholder: 'Optional' });
    var out = U.readout('');

    function sync() {
      var pr = +price.value() || 0, n = Math.max(1, +months.value() || 1);
      var per = pr / n, st = start.value(), end = C.maddMonths(st, n - 1);
      var carriers = C.rollup(s.month).company.headcount;
      var inMonth = C.mindex(s.month) >= C.mindex(st) && C.mindex(s.month) <= C.mindex(end);
      out.set('<strong>' + money(per) + ' a month</strong> from ' + esc(C.mshort(st)) + ' to ' + esc(C.mshort(end)) +
        (inMonth ? ' · in ' + esc(C.mshort(s.month)) + (carriers ? ' that is <strong>' + money(per / carriers) + '</strong> each across ' + carriers + ' people, reaching projects through their allocation' : ', but nobody is on payroll yet') : ' · not in ' + esc(C.mshort(s.month))));
    }
    [price, start, months].forEach(function (f) { f.input.addEventListener('input', sync); f.input.addEventListener('change', sync); });
    sync();

    var body = el('<div style="display:flex;flex-direction:column;gap:18px"></div>');
    [section('Licence'), grid([name, vendor]), section('Money and period'), grid([price, months]), start, note, out].forEach(function (n) { body.appendChild(n); });

    var go = el('<button class="btn btn-primary" type="button">' + (l ? 'Save changes' : 'Add licence') + '</button>');
    go.addEventListener('click', function () {
      var n = name.value().trim();
      if (!n) return name.fail('Give the licence a name.');
      if (!(+price.value() > 0)) return price.fail('Enter the total price paid.');
      if (!(+months.value() >= 1)) return months.fail('At least one month.');
      var rec = { name: n, vendor: vendor.value().trim(), price: +price.value(), start: start.value(), months: +months.value(), note: note.value().trim() };
      if (l) C.updateLicence(l.id, rec); else C.addLicence(rec);
      document.getElementById('dlg').close();
      U.toast((l ? 'Updated ' : 'Added ') + n, { kind: 'success', detail: money(rec.price / rec.months) + ' a month, ' + C.mshort(rec.start) + ' → ' + C.mshort(C.maddMonths(rec.start, rec.months - 1)) + ', shared by everyone on payroll and charged to projects by allocation.' });
      refresh();
    });
    root.App.openDialog(l ? 'Edit licence' : 'Add a software licence', body, [go],
      'The price is spread evenly across the period, shared by everyone on payroll, and reaches projects through allocation.');
  }

  root.App.dialogs.licenceDelete = function (id) { deleteDialog(id); };
  function deleteDialog(id) {
    var l = C.byId(C.LICENCES, id); if (!l) return;
    var body = el('<div class="callout" style="border-left-color:var(--err)">Removing <strong>' + esc(l.name) + '</strong> takes ' + money(monthly(l)) +
      ' a month out of every month from ' + esc(C.mshort(l.start)) + ' to ' + esc(C.mshort(C.licenceEnd(l))) + '. Restore a backup to bring it back.</div>');
    var go = el('<button class="btn btn-danger" type="button">Remove licence</button>');
    go.addEventListener('click', function () {
      C.deleteLicence(id); document.getElementById('dlg').close();
      U.toast('Removed ' + l.name, { kind: 'error', detail: 'Its monthly charge is gone from every month it covered.' });
      refresh();
    });
    root.App.openDialog('Remove licence', body, [go], 'This cannot be undone from inside the product.');
  }

  /* ---------- the register, hosted by Manage data --------------------------
     Creating, amending and removing a licence is administration, so the
     register with its row actions lives on the Manage data screen; the
     Software and licences screen keeps the analysis and reads the same rows. */
  function registerRows(m) {
    var c = C.rollup(m).company;
    return C.LICENCES.map(function (l) {
      var line = c.licences.filter(function (x) { return x.id === l.id; })[0];
      return { id: l.id, name: l.name, vendor: l.vendor, price: l.price, months: l.months, note: l.note,
        toProjects: line ? line.charge - line.company : 0, toCompany: line ? line.company : 0,
        start: l.start, end: C.licenceEnd(l), monthly: monthly(l), charge: line ? line.charge : 0,
        carriers: line ? line.carriers : 0, share: line ? line.share : 0, st: statusOf(l, m) };
    });
  }
  function registerCols(withActions) {
    var cols = [
      { key: 'name', label: 'Licence', cell: function (x) { return '<strong>' + esc(x.name) + '</strong>' + (x.vendor ? '<div class="muted" style="font-size:12px">' + esc(x.vendor) + '</div>' : ''); } },
      { key: 'start', label: 'Period', cell: function (x) { return C.mshort(x.start) + ' → ' + C.mshort(x.end) + '<div class="muted" style="font-size:12px">' + x.months + ' months</div>'; }, sortVal: function (x) { return C.mindex(x.start); } },
      { key: 'price', label: 'Total price', num: true, cell: function (x) { return money(x.price); } },
      { key: 'monthly', label: 'Per month', num: true, cell: function (x) { return money(x.monthly); } },
      { key: 'carriers', label: 'Shared by', num: true, cell: function (x) { return x.charge ? x.carriers + ' people<div class="muted" style="font-size:12px">' + money(x.share) + ' each</div>' : '<span class="muted">—</span>'; }, sortVal: function (x) { return x.carriers; } },
      { key: 'toProjects', label: 'To projects', num: true, cell: function (x) { return x.charge ? money(x.toProjects) + '<div class="muted" style="font-size:12px">' + money(x.toCompany) + ' overhead</div>' : '<span class="muted">—</span>'; } },
      { key: 'st', label: 'Status', cell: function (x) { return '<span class="pill ' + x.st.cls + '">' + esc(x.st.label) + '</span>'; }, sortVal: function (x) { return x.st.label; } }
    ];
    if (withActions) cols.push({ key: 'act', label: '', sortable: false, num: true, hideable: false, noExport: true,
      cell: function () { return '<div class="row-acts"><button type="button" class="row-act" data-act="Edit" aria-label="Edit" data-tip="Edit licence">' + icon('edit') + '</button>' +
        '<button type="button" class="row-act danger" data-act="Delete" aria-label="Remove" data-tip="Remove licence">' + icon('trash') + '</button></div>'; } });
    return cols;
  }
  function registerTable(m, withActions) {
    var rows = registerRows(m);
    return U.table(registerCols(withActions), rows, {
      title: 'Software licences', subtitle: 'Code to Click · ' + C.mlabel(m), exportName: 'Licence register', id: withActions ? 'lic-admin' : 'licences',
      sortKey: 'monthly', sortDir: -1,
      empty: withActions ? 'No licences yet — add the first one above.' : 'No licences yet. Add them in Manage data → Licences.',
      onAction: withActions ? function (x, act) { if (act === 'Edit') licenceDialog(x.id); else deleteDialog(x.id); } : null,
      foot: { name: rows.length + ' licences', monthly: money(rows.reduce(function (a, x) { return a + x.monthly; }, 0)), price: money(rows.reduce(function (a, x) { return a + x.price; }, 0)) }
    });
  }

  /* Manage data hosts this pane under its own tab. */
  root.App.licencePane = function (m) {
    var f = document.createDocumentFragment(), c = C.rollup(m).company;
    f.appendChild(el('<div class="callout" style="margin-bottom:16px">A licence is a purchase: a price and a period. Its monthly charge is <strong>price ÷ months</strong>, ' +
      'shared equally by everyone on payroll, and each person’s share follows their allocation onto the projects they work on. ' +
      'Editing a licence restates every month it covers — the period is a fact about the purchase, not about the month.</div>'));
    var t = registerTable(m, true);
    var add = H.btn('Add licence', 'btn-primary', function () { licenceDialog(null); }, 'plus');
    var pn = U.panel('Licence register', C.LICENCES.length + ' on the register · ' + money(c.licenceCost) + ' charged in ' + C.mlabel(m), t, true, add);
    f.appendChild(pn);
    return f;
  };

  /* ---------- the screen ---------------------------------------------------- */
  V.licences = function (s) {
    var f = document.createDocumentFragment(), m = s.month, r = C.rollup(m), c = r.company;
    var t12 = H.trailing12(m);
    f.appendChild(H.head('Software and licences',
      'Every licence is spread evenly across its period and shared equally by everyone on payroll. ' +
      'Each person’s share follows their allocation: time on a project puts that part on the project’s other cost; internal time and bench go to company overhead.',
      [H.btn('Manage licences', 'btn-primary', function () { root.App.go('admin', { tab: 'licences' }); }, 'sliders')]));

    /* --- summary ---------------------------------------------------------- */
    var active = C.licencesFor(m);
    var lab = t12.map(function (x) { return C.mshort(x); });
    var series = t12.map(function (x) { return C.rollup(x).company.licenceCost; });
    var tiles = el('<div class="tiles"></div>');
    tiles.appendChild(U.tile({ kind: 'other', label: 'Licence cost this month', value: moneyK(c.licenceCost), foot: '<span>' + active.length + ' active of ' + C.LICENCES.length + '</span>',
      spark: U.sparkline(series, 'var(--m-other)', 300, 44, { labels: lab, name: 'Licences' }), accent: true, tip: 'Exact: ' + money(c.licenceCost) }));
    tiles.appendChild(U.tile({ kind: 'revenue', label: 'On projects', value: moneyK(c.licenceProjectCost), foot: '<span>' + pct(c.licenceCost ? c.licenceProjectCost / c.licenceCost : 0, 0) + ' of licence cost</span>', tip: 'The part of everyone’s software share that followed their allocation onto billable projects.' }));
    tiles.appendChild(U.tile({ kind: 'people', label: 'Overhead', value: moneyK(c.licenceCompanyCost), foot: '<span>internal time, non-billable and bench</span>', tip: 'The part of software shares carried by people who were not on a billable project.' }));
    tiles.appendChild(U.tile({ kind: 'cost', label: 'Per employee', value: money(c.headcount ? c.licenceCost / c.headcount : 0), foot: '<span>average software share</span>', tip: 'Licence cost ÷ headcount.' }));
    tiles.appendChild(U.tile({ kind: 'profit', label: 'Share of other cost', value: pct(c.otherCost ? c.licenceCost / c.otherCost : 0), foot: '<span>of ' + money(c.otherCost) + '</span>', tip: 'Licences as a share of all other cost this month.' }));
    tiles.appendChild(U.tile({ kind: 'margin', label: 'Annualised', value: moneyK(C.LICENCES.reduce(function (t, l) { return t + monthly(l) * 12; }, 0)), foot: '<span>if every licence ran all year</span>', tip: 'Sum of monthly charges × 12 across the whole register.' }));
    f.appendChild(tiles);

    /* --- register (read only; edits live in Manage data) --------------------- */
    f.appendChild(H.section('Licence register', C.LICENCES.length + ' on the register'));
    f.appendChild(U.panel('Register', 'Charges are recomputed for every month a licence covers · add, edit and remove them in Manage data → Licences',
      registerTable(m, false), true, H.btn('Manage', 'btn-sm', function () { root.App.go('admin', { tab: 'licences' }); }, 'sliders')));

    /* --- who carries it, and the year ------------------------------------- */
    var g = el('<div class="grid-2" style="margin-top:16px"></div>');
    var people = Object.keys(r.byEmployee).map(function (id) { return r.byEmployee[id]; })
      .filter(function (e) { return e.toolCost > 0.005; }).sort(function (a, b) { return b.toolCost - a.toolCost; });
    var pt = U.table([
      { key: 'name', label: 'Person', cell: function (e) { return '<strong>' + esc(e.name) + '</strong><div class="muted" style="font-size:12px">' + esc(e.dept) + '</div>'; } },
      { key: 'n', label: 'Licences', num: true, sortVal: function (e) { return e.tools.length; }, cell: function (e) { return e.tools.length; } },
      { key: 'toolCost', label: 'Software', num: true, cell: function (e) { return money(e.toolCost) + '<div class="muted" style="font-size:12px">' + money(U.toolOnProjects(e)) + ' on projects</div>'; } },
      { key: 'monthlyCost', label: 'Payroll', num: true, cell: function (e) { return money(e.monthlyCost); } },
      { key: 'loadedCost', label: 'Loaded cost', num: true, cell: function (e) { return '<strong>' + money(e.loadedCost) + '</strong>'; } }
    ], people, { title: 'Software cost by person', subtitle: C.mlabel(m), exportName: 'Software by person', id: 'lic-people', sortKey: 'toolCost', sortDir: -1, pageSize: 10,
      onRow: function (e) { root.App.go('employee', { id: e.id }); }, empty: 'No licence is charged to anyone in ' + C.mlabel(m) + '.' });
    g.appendChild(U.panel('Who carries it', C.mlabel(m) + ' · each person’s share of every licence they use', pt, true));
    g.appendChild(U.panel('Licence cost by month', 'Trailing twelve months', U.columnChart({
      months: t12, values: series, label: 'Licence cost', height: 236,
      colorFor: function () { return 'var(--m-other)'; }, opacityFor: function (v, i) { return t12[i] === m ? 1 : .45; },
      onClickMonth: function (x) { root.App.setMonth(x); }
    })));
    f.appendChild(g);
    return f;
  };
})(typeof window !== 'undefined' ? window : globalThis);
