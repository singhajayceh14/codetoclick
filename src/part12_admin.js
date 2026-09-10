/* ============================================================================
   Administration.

   The register of record: create, amend, archive and delete clients, projects,
   people and software licences, plus a full backup you can take away and
   restore. The licence pane itself is built in part13, next to the engine
   that spreads a licence over its period — this screen only hosts it.

   Two rules the screen keeps visible, because they are the whole point of a
   monthly ledger:
     · an amendment applies from the reporting month forward — closed months
       keep the numbers they closed with;
     · deletion is the exception. It strips the record from every month, so it
       is confirmed separately from archiving, which preserves history.
   ========================================================================== */
(function (root) {
  'use strict';
  var C = root.CTC, U = root.UI, V = root.VIEWS, H = root.VIEWHELP;
  var money = U.money, pct = U.pct, esc = U.esc, el = U.el;

  var TABS = [
    { v: 'clients', l: 'Clients', i: 'clients', n: function () { return C.CLIENTS.length; } },
    { v: 'projects', l: 'Projects', i: 'projects', n: function () { return C.PROJECTS.length; } },
    { v: 'employees', l: 'People', i: 'employees', n: function () { return C.EMPLOYEES.length; } },
    { v: 'licences', l: 'Licences', i: 'licence', n: function () { return C.LICENCES.length; } },
    { v: 'backup', l: 'Backup & restore', i: 'archive', n: null },
    /* Owner only. The server enforces this too - hiding a tab is not a
       permission, and api/mutate.js assumes it is called directly. */
    { v: 'accounts', l: 'Accounts', i: 'employees', n: null,
      when: function () { return root.AUTH && root.AUTH.role() === 'owner'; } }
  ];
  function visibleTabs() {
    return TABS.filter(function (t) { return !t.when || t.when(); });
  }
  var TYPES = ['Fixed project', 'Retainer', 'Time & materials', 'Milestone'];
  var DISC = [
    { v: 'eng', l: 'Build / configuration' }, { v: 'data', l: 'Data 360' },
    { v: 'devops', l: 'Platform' }, { v: 'support', l: 'AMS' }
  ];

  function st(s) { if (!s.admin) s.admin = { tab: 'clients' }; if (s.params && s.params.tab) { s.admin.tab = s.params.tab; delete s.params.tab; } return s.admin; }
  function refresh() { var y = window.scrollY; root.App.render(); window.scrollTo(0, y); }

  /* ---------- form plumbing ------------------------------------------------ */
  var field = U.field, grid = U.formGrid, section = U.formSection;
  function form(rows) {
    var box = el('<div style="display:flex;flex-direction:column;gap:18px"></div>');
    rows.forEach(function (r) { if (r) box.appendChild(r); });
    return box;
  }
  function monthOpts() { return C.MONTHS.map(function (m) { return { v: m, l: C.mlabel(m) }; }); }
  function curSymbol() {
    var S = root.SET ? root.SET.get() : null;
    var c = S && root.SET.currencies.filter(function (x) { return x.v === S.currency; })[0];
    return c ? c.sym.trim() : '$';
  }
  function saved(what, name, detail) {
    U.toast(what + ' ' + name, { kind: 'success', detail: detail });
  }

  /* ---------- client ------------------------------------------------------- */
  function clientDialog(id) {
    var c = id ? C.byId(C.CLIENTS, id) : null;
    var name = field({ label: 'Client name', required: true, value: c ? c.name : '', placeholder: 'e.g. Ashfield University' });
    var ind = field({
      label: 'Sector', type: 'select', value: c ? c.industry : 'Higher education',
      options: ['Higher education', 'Nonprofit', 'Professional services', 'Retail'].map(function (x) { return { v: x, l: x }; }),
      hint: 'Code to Click reports by sector.'
    });
    var since = field({ label: 'Client since', type: 'select', value: c ? c.since : root.App.state.month, options: monthOpts(), hint: 'Reporting only — it creates no revenue.' });
    var body = form([grid([name, ind]), since]);
    var go = el('<button class="btn btn-primary" type="button">' + (c ? 'Save changes' : 'Create client') + '</button>');
    go.addEventListener('click', function () {
      var n = name.value().trim();
      if (!n) return name.fail('Give the client a name.');
      var clash = C.CLIENTS.filter(function (x) { return x.name.toLowerCase() === n.toLowerCase() && x.id !== id; })[0];
      if (clash) return name.fail('There is already a client called ' + clash.name + '.');
      if (c) C.updateClient(id, { name: n, industry: ind.value(), since: since.value() });
      else C.addClient({ name: n, industry: ind.value(), since: since.value() });
      document.getElementById('dlg').close();
      saved(c ? 'Updated' : 'Added', n, c ? null : 'Add a project to start booking revenue against it.');
      refresh();
    });
    root.App.openDialog(c ? 'Edit client' : 'New client', body, [go],
      c ? 'Changes apply everywhere immediately. Records already booked are untouched.' : 'A client is a reporting grouping; revenue is booked to its projects.');
  }

  /* ---------- project ------------------------------------------------------ */
  function projectDialog(id) {
    var p = id ? C.byId(C.PROJECTS, id) : null;
    var m = root.App.state.month;
    var name = field({ label: 'Project name', required: true, value: p ? p.name : '', placeholder: 'e.g. Agentforce Service Rollout' });
    var client = field({
      label: 'Client', required: true, type: 'select', value: p ? p.clientId : (C.CLIENTS[0] || {}).id,
      options: C.CLIENTS.slice().sort(function (a2, b2) { return a2.name.localeCompare(b2.name); })
        .map(function (c) { return { v: c.id, l: c.name }; })
    });
    var type = field({ label: 'Engagement type', type: 'select', value: p ? p.type : 'Fixed project', options: TYPES.map(function (t) { return { v: t, l: t }; }) });
    var disc = field({ label: 'Delivery discipline', type: 'select', value: p ? p.disc : 'eng', options: DISC, hint: 'Used when suggesting who to staff it with.' });
    var start = field({ label: 'Starts', type: 'select', value: p ? p.start : m, options: monthOpts(), hint: 'The first month it can carry revenue or people.' });
    var rev = field({
      label: 'Revenue for ' + C.mlabel(m), type: 'number', step: 100, min: 0, prefix: curSymbol(),
      value: p ? (C.snapshot(m).revenue[p.id] || 0) : '', placeholder: '0',
      hint: p ? 'Changes <strong>' + esc(C.mlabel(m)) + '</strong> only — other months keep their own figure.'
        : 'Booked into every month from the start month onwards. Any single month can be changed later.'
    });
    var bill = el('<label class="chk"><input type="checkbox"' + (!p || p.billable !== false ? ' checked' : '') + '><span><strong>Billable project</strong>' +
      '<small>Earns revenue and has a margin. Untick for internal tooling, R&amp;D, pre-sales or a free pilot: its cost is tracked in full but counted as internal time and overhead, and it never appears in margin rankings.</small></span></label>');
    var billIn = bill.querySelector('input');
    function syncBill() { rev.hidden = !billIn.checked; }
    billIn.addEventListener('change', syncBill); syncBill();
    var body = form([
      grid([name, client]), grid([type, disc]), bill, section('Money'), grid([start, rev])
    ]);
    var go = el('<button class="btn btn-primary" type="button">' + (p ? 'Save changes' : 'Create project') + '</button>');
    go.addEventListener('click', function () {
      var n = name.value().trim();
      if (!n) return name.fail('Give the project a name.');
      if (!client.value()) return client.fail('Create a client first — the list is empty.');
      var billable = billIn.checked;
      var amount = !billable || rev.value() === '' ? null : Math.max(0, +rev.value() || 0);
      if (p) {
        C.updateProject(id, { name: n, clientId: client.value(), type: type.value(), disc: disc.value(), start: start.value(), billable: billable });
        if (amount != null && C.isActiveProj(C.byId(C.PROJECTS, id), m)) C.setRevenue(m, id, amount);
        saved('Updated', n, amount != null ? C.mlabel(m) + ' revenue set to ' + money(amount) : null);
      } else {
        C.addProject({ clientId: client.value(), name: n, type: type.value(), disc: disc.value(), start: start.value(), billable: billable, revenue: amount || 0 });
        saved('Added', n, amount ? money(amount) + ' a month from ' + C.mlabel(start.value()) + '. Staff it from the Allocation screen.'
          : 'Staff it from the Allocation screen to start putting cost against it.');
      }
      document.getElementById('dlg').close();
      refresh();
    });
    root.App.openDialog(p ? 'Edit project' : 'New project', body, [go],
      p ? 'Edits apply from ' + C.mlabel(m) + '. Closed months keep the figures they closed with.' : null);
  }

  function archiveDialog(id) {
    var p = C.byId(C.PROJECTS, id);
    var when = field({ label: 'Runs until the end of', type: 'select', value: p.end || root.App.state.month, options: monthOpts() });
    var body = form([
      el('<div class="callout">Archiving closes <strong>' + esc(p.name) + '</strong> after the month you choose. ' +
        'Every month up to and including it keeps its revenue, cost and allocation exactly as recorded — nothing is erased.</div>'),
      when
    ]);
    var go = el('<button class="btn btn-primary" type="button">Archive project</button>');
    go.addEventListener('click', function () {
      C.archiveProject(id, when.value());
      document.getElementById('dlg').close();
      U.toast(p.name + ' archived', { kind: 'success', detail: 'Runs to the end of ' + C.mlabel(when.value()) + '. History is intact.' });
      refresh();
    });
    root.App.openDialog('Archive project', body, [go], 'The safe way to stop a project — history stays exactly as reported.');
  }

  /* ---------- employee ----------------------------------------------------- */
  function employeeDialog(id) {
    var e0 = id ? C.byId(C.EMPLOYEES, id) : null;
    var m = root.App.state.month;
    var cur = id && C.rollup(m).byEmployee[id];
    var name = field({ label: 'Name', required: true, value: e0 ? e0.name : '', placeholder: 'Full name' });
    var title = field({ label: 'Role', value: e0 ? e0.title : '', placeholder: 'e.g. Salesforce Developer' });
    var dept = field({
      label: 'Department', type: 'select', value: e0 ? e0.dept : 'Development',
      options: H.dedupe(C.EMPLOYEES.map(function (x) { return x.dept; })).sort().map(function (d) { return { v: d, l: d }; })
    });
    var disc = field({ label: 'Delivery discipline', type: 'select', value: e0 ? e0.disc : 'eng', options: DISC });
    var join = field({ label: 'Joining month', type: 'select', value: e0 ? e0.join : m, options: monthOpts(), hint: 'No cost is carried before this month.' });
    var ctc = field({
      label: 'Annual CTC', required: true, type: 'number', step: 600, min: 0, prefix: curSymbol(),
      value: cur ? cur.ctc : (e0 ? e0.baseCtc : 48000),
      hint: e0 ? 'Applies from <strong>' + esc(C.mlabel(m)) + '</strong> forward. Earlier months keep the cost they closed with.'
        : 'Divided by twelve to give the monthly cost.'
    });
    var out = U.readout('<b>' + money(0) + '</b> monthly cost');
    function calc() { out.innerHTML = '<b>' + money((+ctc.value() || 0) / 12) + '</b> monthly cost, charged from ' + esc(C.mlabel(join.value())); }
    ctc.input.addEventListener('input', calc);
    join.input.addEventListener('change', calc);
    calc();
    var body = form([
      grid([name, title]), grid([dept, disc]),
      section('Cost'), grid([join, ctc]), out
    ]);
    var go = el('<button class="btn btn-primary" type="button">' + (e0 ? 'Save changes' : 'Add person') + '</button>');
    go.addEventListener('click', function () {
      var n = name.value().trim(), v = +ctc.value() || 0;
      if (!n) return name.fail('Give this person a name.');
      if (v <= 0) return ctc.fail('Enter an annual CTC above zero.');
      if (e0) {
        C.updateEmployee(id, { name: n, title: title.value().trim() || 'Consultant', dept: dept.value(), disc: disc.value(), join: join.value() });
        var changed = v !== (cur ? cur.ctc : e0.baseCtc);
        if (changed) C.setEmployeeCtc(id, v, m);
        saved('Updated', n, changed ? 'CTC ' + money(v) + ' from ' + C.mlabel(m) + ' — earlier months unchanged.' : null);
      } else {
        C.addEmployee({ name: n, title: title.value().trim() || 'Consultant', dept: dept.value(), disc: disc.value(), ctc: v, join: join.value() });
        saved('Added', n, money(v / 12) + ' a month. Allocate them to start charging projects.');
      }
      document.getElementById('dlg').close();
      refresh();
    });
    root.App.openDialog(e0 ? 'Edit person' : 'Add a person', body, [go],
      e0 ? 'Pay changes apply from ' + C.mlabel(m) + ' forward.' : null);
  }

  /* ---------- delete, with the consequence spelled out --------------------- */
  function deleteDialog(kind, id) {
    var item = kind === 'client' ? C.byId(C.CLIENTS, id)
      : kind === 'project' ? C.byId(C.PROJECTS, id) : C.byId(C.EMPLOYEES, id);
    if (!item) return;
    var impact = [];
    if (kind === 'client') {
      var ps = C.clientProjects(id);
      impact.push(ps.length + ' project' + (ps.length === 1 ? '' : 's') + ' and every revenue, cost and allocation record attached to them');
      if (ps.length) impact.push('projects removed: ' + ps.map(function (p) { return p.name; }).join(', '));
    } else if (kind === 'project') {
      var months = C.MONTHS.filter(function (m) { return C.rollup(m).byProject[id]; });
      impact.push('revenue and cost in ' + months.length + ' month' + (months.length === 1 ? '' : 's'));
      impact.push('every allocation line pointing at it');
    } else {
      var ms = C.MONTHS.filter(function (m) { return C.rollup(m).byEmployee[id]; });
      impact.push('payroll cost in ' + ms.length + ' month' + (ms.length === 1 ? '' : 's'));
      impact.push('every allocation this person carries');
    }
    var confirm = field({ label: 'Type the name to confirm', required: true, placeholder: item.name,
      hint: 'Exactly: <strong>' + esc(item.name) + '</strong>' });
    var body = form([
      el('<div class="callout" style="border-left-color:var(--err)"><strong>This rewrites closed months.</strong> ' +
        'Deleting removes the record from the whole ledger, so months already reported will change. ' +
        (kind === 'project' ? 'To stop a project without touching history, archive it instead. ' : '') +
        'Take a backup first if you may need it back.</div>'),
      el('<div><div class="eyebrow" style="margin-bottom:6px">What goes</div><ul class="ol">' +
        impact.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>'),
      confirm
    ]);
    var go = el('<button class="btn" type="button" style="background:var(--err);border-color:var(--err);color:#fff;font-weight:600">Delete permanently</button>');
    go.addEventListener('click', function () {
      if (confirm.value().trim() !== item.name) { confirm.fail('That is not the exact name, so nothing was deleted.'); return; }
      if (kind === 'client') C.deleteClient(id);
      else if (kind === 'project') C.deleteProject(id);
      else C.deleteEmployee(id);
      document.getElementById('dlg').close();
      U.toast('Deleted ' + item.name, { kind: 'error', detail: 'Removed from every month. Restore a backup if this was a mistake.' });
      refresh();
    });
    root.App.openDialog('Delete ' + kind, body, [go], 'This one cannot be undone from inside the product.');
  }

  /* ---------- row actions --------------------------------------------------- */
  /* Icon buttons rather than words: three text buttons cost ~180px of every
     row, three icons cost ~96px, and that width goes back to the columns that
     carry the numbers. The label survives as the accessible name, the hover
     tooltip, and the data-act the table's onAction reads back.               */
  var ACTS = {
    Edit: { icon: 'edit', tip: 'Edit details' },
    Delete: { icon: 'trash', tip: 'Delete from every month', danger: true },
    Archive: { icon: 'archive', tip: 'Close the project, keep its history' },
    Allocate: { icon: 'sliders', tip: 'Open the allocation workbench' }
  };
  function actionCell(list) {
    return '<div class="row-acts">' + list.map(function (label) {
      var a = ACTS[label] || { icon: 'edit', tip: label };
      return '<button type="button" class="row-act' + (a.danger ? ' danger' : '') +
        '" data-act="' + esc(label) + '" aria-label="' + esc(a.tip) + '" data-tip="' + esc(a.tip) + '">' +
        U.icon(a.icon) + '</button>';
    }).join('') + '</div>';
  }

  /* ---------- tab bar -------------------------------------------------------
     Carbon line tabs: icon, label, and a live count of what is on each
     register, so the section header doubles as a summary.                    */
  function tabBar(a) {
    var bar = el('<div class="tabbar" role="tablist" aria-label="Administration sections"></div>');
    var btns = visibleTabs().map(function (t) {
      var on = a.tab === t.v;
      var b = el('<button type="button" role="tab" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '">' +
        U.icon(t.i) + '<span>' + esc(t.l) + '</span>' +
        (t.n ? '<em class="cnt">' + t.n() + '</em>' : '') + '</button>');
      b.addEventListener('click', function () { if (a.tab !== t.v) { a.tab = t.v; refresh(); } });
      bar.appendChild(b);
      return b;
    });
    bar.addEventListener('keydown', function (e) {
      var i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      var to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1
        : e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : -1;
      if (to < 0 && to !== 0) return;
      e.preventDefault();
      btns[(to + btns.length) % btns.length].focus();
    });
    return bar;
  }

  /* ---------- the screen ---------------------------------------------------- */
  V.admin = function (s) {
    var a = st(s), m = s.month, f = document.createDocumentFragment();
    f.appendChild(H.head('Administration',
      'The register of record for clients, projects, people and software licences. Amendments apply from <strong>' +
      esc(C.mlabel(m)) + '</strong> forward; closed months keep what they closed with.'));

    f.appendChild(tabBar(a));

    if (a.tab === 'clients') f.appendChild(clientsPane(m));
    else if (a.tab === 'projects') f.appendChild(projectsPane(m));
    else if (a.tab === 'employees') f.appendChild(peoplePane(m));
    else if (a.tab === 'licences') f.appendChild(root.App.licencePane ? root.App.licencePane(m) : el('<div class="empty">Licences are unavailable.</div>'));
    else if (a.tab === 'accounts') f.appendChild(accountsPane());
    else f.appendChild(backupPane());
    return f;
  };

  function clientsPane(m) {
    var wrap = el('<div></div>');
    var r = C.rollup(m);
    var rows = C.CLIENTS.map(function (c) {
      var live = r.byClient[c.id];
      return {
        id: c.id, name: c.name, industry: c.industry, since: c.since,
        projects: C.clientProjects(c.id).length,
        revenue: live ? live.revenue : 0, margin: live ? live.margin : null
      };
    });
    var t = U.table([
      { key: 'name', label: 'Client', cell: function (x) { return '<strong>' + esc(x.name) + '</strong>'; } },
      { key: 'industry', label: 'Sector', cell: function (x) { return '<span class="tag">' + esc(x.industry) + '</span>'; } },
      { key: 'since', label: 'Since', cell: function (x) { return C.mshort(x.since); }, sortVal: function (x) { return C.mindex(x.since); } },
      { key: 'projects', label: 'Projects', num: true, cell: function (x) { return x.projects; } },
      { key: 'revenue', label: 'Revenue ' + C.mshort(m), num: true, cell: function (x) { return x.revenue ? money(x.revenue) : '<span class="muted">—</span>'; } },
      { key: 'margin', label: 'Margin', num: true, cell: function (x) { return x.margin == null ? '<span class="muted">—</span>' : U.marginPill(x.margin); } },
      {
        key: 'act', label: '', sortable: false, num: true, hideable: false, noExport: true,
        cell: function () { return actionCell(['Edit', 'Delete']); }
      }
    ], rows, {
      title: 'Client register', subtitle: 'Code to Click · ' + C.mlabel(m), exportName: 'Client register',
      sortKey: 'name', sortDir: 1, id: 'admin-clients',
      onAction: function (x, label) {
        if (label === 'Edit') clientDialog(x.id); else deleteDialog('client', x.id);
      }
    });
    var add = H.btn('New client', 'btn-primary', function () { clientDialog(null); }, 'plus');
    wrap.appendChild(U.panel('Clients', C.CLIENTS.length + ' on the register', t, true, add));
    return wrap;
  }

  function projectsPane(m) {
    var wrap = el('<div></div>');
    var r = C.rollup(m);
    var rows = C.PROJECTS.map(function (p) {
      var live = r.byProject[p.id];
      var cl = C.byId(C.CLIENTS, p.clientId);
      return {
        id: p.id, name: p.name, client: cl ? cl.name : '—', type: p.type,
        start: p.start, end: p.end,
        status: p.end && C.mindex(p.end) < C.mindex(m) ? 'Archived' : (C.isActiveProj(p, m) ? 'Running' : 'Not started'),
        revenue: live ? live.revenue : 0, margin: live ? live.margin : null
      };
    });
    var t = U.table([
      { key: 'name', label: 'Project', cell: function (x) { return '<strong>' + esc(x.name) + '</strong>'; } },
      { key: 'client', label: 'Client', cell: function (x) { return esc(x.client); } },
      { key: 'type', label: 'Type', cell: function (x) { return '<span class="tag">' + esc(x.type) + '</span>'; } },
      {
        key: 'status', label: 'Status', cell: function (x) {
          var cls = x.status === 'Running' ? 'good' : x.status === 'Archived' ? 'neutral' : 'watch';
          return '<span class="pill ' + cls + '">' + x.status + '</span>';
        }
      },
      { key: 'window', label: 'Runs', sortable: false, cell: function (x) { return C.mshort(x.start) + ' → ' + (x.end ? C.mshort(x.end) : 'open'); } },
      { key: 'revenue', label: 'Revenue ' + C.mshort(m), num: true, cell: function (x) { return x.revenue ? money(x.revenue) : '<span class="muted">—</span>'; } },
      { key: 'margin', label: 'Margin', num: true, cell: function (x) { return x.margin == null ? '<span class="muted">—</span>' : U.marginPill(x.margin); } },
      {
        key: 'act', label: '', sortable: false, num: true, hideable: false, noExport: true,
        cell: function () { return actionCell(['Edit', 'Archive', 'Delete']); }
      }
    ], rows, {
      title: 'Project register', subtitle: 'Code to Click · ' + C.mlabel(m), exportName: 'Project register',
      sortKey: 'name', sortDir: 1, id: 'admin-projects',
      onAction: function (x, label) {
        if (label === 'Edit') projectDialog(x.id);
        else if (label === 'Archive') archiveDialog(x.id);
        else deleteDialog('project', x.id);
      }
    });
    var add = H.btn('New project', 'btn-primary', function () { projectDialog(null); }, 'plus');
    wrap.appendChild(U.panel('Projects', C.PROJECTS.length + ' on the register · ' + rows.filter(function (x) { return x.status === 'Running'; }).length + ' running in ' + C.mlabel(m), t, true, add));
    return wrap;
  }

  function peoplePane(m) {
    var wrap = el('<div></div>');
    var r = C.rollup(m);
    var rows = C.EMPLOYEES.map(function (e) {
      var live = r.byEmployee[e.id];
      return {
        id: e.id, name: e.name, title: e.title, dept: e.dept, join: e.join,
        ctc: live ? live.ctc : 0, monthly: live ? live.monthlyCost : 0,
        alloc: live ? live.allocatedPct : null
      };
    });
    var t = U.table([
      { key: 'name', label: 'Name', cell: function (x) { return '<strong>' + esc(x.name) + '</strong><div class="muted" style="font-size:12px">' + esc(x.title) + '</div>'; } },
      { key: 'dept', label: 'Department', cell: function (x) { return '<span class="tag">' + esc(x.dept) + '</span>'; } },
      { key: 'join', label: 'Joined', cell: function (x) { return C.mshort(x.join); }, sortVal: function (x) { return C.mindex(x.join); } },
      { key: 'ctc', label: 'Annual CTC', num: true, cell: function (x) { return x.ctc ? money(x.ctc) : '<span class="muted">—</span>'; } },
      { key: 'monthly', label: 'Monthly cost', num: true, cell: function (x) { return x.monthly ? money(x.monthly) : '<span class="muted">—</span>'; } },
      {
        key: 'alloc', label: 'Allocated', num: true, cell: function (x) {
          if (x.alloc == null) return '<span class="muted">not yet joined</span>';
          var cls = x.alloc === 100 ? 'good' : x.alloc > 100 ? 'crit' : 'watch';
          return '<span class="pill ' + cls + '">' + x.alloc + '%</span>';
        }
      },
      {
        key: 'act', label: '', sortable: false, num: true, hideable: false, noExport: true,
        cell: function () { return actionCell(['Edit', 'Allocate', 'Delete']); }
      }
    ], rows, {
      title: 'People register', subtitle: 'Code to Click · ' + C.mlabel(m), exportName: 'People register',
      sortKey: 'name', sortDir: 1, id: 'admin-people',
      onAction: function (x, label) {
        if (label === 'Edit') employeeDialog(x.id);
        else if (label === 'Allocate') root.App.openAllocation(x.id);
        else deleteDialog('employee', x.id);
      }
    });
    var add = H.btn('Add person', 'btn-primary', function () { employeeDialog(null); }, 'plus');
    wrap.appendChild(U.panel('People', C.EMPLOYEES.length + ' on the register', t, true, add));
    return wrap;
  }

  /* ---------- backup and restore -------------------------------------------- */
  function backupPane() {
    var wrap = el('<div class="stack"></div>');

    var take = el('<div class="set-list"></div>');
    var dlBtn = H.btn('Download backup (.json)', 'btn-primary', function () {
      var state = C.exportState();
      var stamp = new Date().toISOString().slice(0, 10);
      root.EXP.saveFile('codetoclick-backup-' + stamp + '.json', JSON.stringify(state, null, 1));
    }, 'download');
    take.appendChild(rowOf('Full backup', 'Every client, project and person, plus the complete monthly ledger — revenue, costs and allocation for all ' +
      C.MONTHS.length + ' months. One JSON file that restores the product exactly as it stands.', dlBtn));

    var csvBtn = H.btn('Registers as CSV', '', function () {
      root.EXP.exportCSV({
        name: 'Client register', title: 'Client register', subtitle: 'Code to Click',
        cols: [{ label: 'Client' }, { label: 'Sector' }, { label: 'Since' }, { label: 'Projects', num: true }],
        rows: C.CLIENTS.map(function (c) { return [c.name, c.industry, C.mlabel(c.since), String(C.clientProjects(c.id).length)]; })
      });
    }, 'download');
    take.appendChild(rowOf('Registers as spreadsheets', 'Each register also exports from its own tab — the Export button above every table offers Excel, PDF and clipboard.', csvBtn));
    wrap.appendChild(U.panel('Take a backup', 'Keep one before any deletion', take, true));

    var put = el('<div style="display:flex;flex-direction:column;gap:14px"></div>');
    put.appendChild(el('<div class="callout" style="border-left-color:var(--warn-line)"><strong>Restoring replaces everything.</strong> ' +
      'Every client, project, person and month in this session is overwritten by the file. Take a backup first if the current state matters.</div>'));
    var file = el('<input type="file" accept="application/json,.json">');
    var status = el('<div class="err" style="min-height:18px"></div>');
    var pending = null;
    var restore = H.btn('Restore from this file', '', function () {
      if (!pending) { status.className = 'err'; status.textContent = 'Choose a backup file first.'; return; }
      var res = C.importState(pending);
      if (!res.ok) { status.className = 'err'; status.textContent = res.error; return; }
      status.className = 'ok';
      status.textContent = 'Restored ' + res.clients + ' clients, ' + res.projects + ' projects, ' +
        res.employees + ' people and ' + res.months + ' months.';
      U.toast('Backup restored', { kind: 'success', detail: status.textContent });
      pending = null;
      refresh();
    }, 'upload');
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try { pending = JSON.parse(rd.result); status.className = 'ok'; status.textContent = 'Read ' + f.name + ' — press Restore to apply it.'; }
        catch (err) { pending = null; status.className = 'err'; status.textContent = 'That file is not valid JSON.'; }
      };
      rd.readAsText(f);
    });
    var fileWrap = el('<div class="fld"><span class="fl-label">Backup file</span></div>');
    fileWrap.appendChild(file);
    fileWrap.appendChild(el('<div class="fl-hint">A .json file taken from this screen.</div>'));
    put.appendChild(fileWrap);
    put.appendChild(restore);
    put.appendChild(status);
    wrap.appendChild(U.panel('Restore', null, put));

    /* ---- your data or the demo ------------------------------------------- */
    var own = C.dataMode() === 'own';
    var data = el('<div class="set-list"></div>');
    var saved = C.persistedAt();
    data.appendChild(rowOf('What this browser holds',
      (own ? '<span class="pill good">Your data</span> Only records you created. ' : '<span class="pill neutral">Demo data</span> The generated sample company. ') +
      'Every change is saved in this browser automatically' + (saved ? ' — last saved ' + esc(new Date(saved).toLocaleString()) : '') +
      '. Use a backup file to move it to another computer.',
      el('<div class="set-preview"><span><b>' + C.CLIENTS.length + '</b>clients</span><span><b>' + C.PROJECTS.length + '</b>projects</span>' +
        '<span><b>' + C.EMPLOYEES.length + '</b>people</span><span><b>' + C.LICENCES.length + '</b>licences</span></div>')));

    var clearBtn = H.btn('Clear all data', 'btn-danger', function () { clearDialog(); }, 'trash');
    data.appendChild(rowOf('Start with an empty company', 'Removes every client, project, person, licence and every month of revenue, cost and allocation, so you can enter your own records and check every calculation from zero. Take a backup first if you want the demo back later.', clearBtn));

    var demoBtn = H.btn('Restore demo data', '', function () {
      root.App.openDialog('Restore the demo company?',
        el('<div class="callout" style="border-left-color:var(--warn-line)">This replaces everything in this browser with the generated sample company. Records you created are lost unless you have a backup.</div>'),
        [H.btn('Restore demo', 'btn-primary', function () {
          C.restoreDemo(); document.getElementById('dlg').close();
          U.toast('Demo data restored', { kind: 'success', detail: C.CLIENTS.length + ' clients, ' + C.PROJECTS.length + ' projects, ' + C.EMPLOYEES.length + ' people across ' + C.MONTHS.length + ' months.' });
          root.App.go('dashboard');
        })], 'No undo — only a backup file brings your records back.');
    });
    data.appendChild(rowOf('Back to the sample company', own ? 'Puts the generated demo back so you can compare against the reference figures (September 2026: revenue $285,400, cost $187,200, margin 34.4%).' : 'Rebuilds the sample company from scratch, discarding every edit made here.', demoBtn));
    wrap.appendChild(U.panel('Your data', 'No undo on either of these', data, true));
    return wrap;
  }

  function clearDialog() {
    var body = el('<div class="stack" style="gap:14px"></div>');
    body.appendChild(el('<div class="callout" style="border-left-color:var(--err-line)"><strong>This empties the whole product.</strong> ' +
      C.CLIENTS.length + ' clients, ' + C.PROJECTS.length + ' projects, ' + C.EMPLOYEES.length + ' people, ' + C.LICENCES.length + ' licences and all ' + C.MONTHS.length + ' months of records are removed. There is no undo.</div>'));
    var typed = U.field({ label: 'Type CLEAR to confirm', type: 'text', placeholder: 'CLEAR' });
    body.appendChild(typed);
    var go = H.btn('Clear everything', 'btn-danger', function () {
      if (typed.value().trim().toUpperCase() !== 'CLEAR') return typed.fail('Type CLEAR in capitals to confirm.');
      C.clearAll();
      document.getElementById('dlg').close();
      U.toast('All data cleared', { kind: 'warn', detail: 'You are starting from an empty company. Add a client first, then a project, then people.' });
      root.App.go('admin', { tab: 'backup' });
    }, 'trash');
    root.App.openDialog('Clear all data', body, [go], 'Start from an empty company');
  }
  /* ---------- accounts ------------------------------------------------------ */
  function accountsPane() {
    var wrap = el('<div class="stack"></div>');
    var me = root.AUTH && root.AUTH.user ? root.AUTH.user() : null;
    var others = C.USERS.filter(function (u) { return !me || u.email !== me.email; });

    var list = el('<div class="set-list"></div>');
    C.USERS.forEach(function (u) {
      var mine = me && u.email === me.email;
      list.appendChild(rowOf(u.name || u.email,
        esc(u.email) + ' &middot; ' + esc(u.role) + (mine ? ' &middot; this is you' : '') +
        (u.active === false ? ' &middot; <span class="tag">inactive</span>' : ''),
        el('<span class="tag">' + esc(u.role) + '</span>')));
    });
    wrap.appendChild(U.panel('Accounts', C.USERS.length + ' sign-in' + (C.USERS.length === 1 ? '' : 's') +
      ' in this organization', list, true));

    var put = el('<div style="display:flex;flex-direction:column;gap:12px"></div>');
    put.appendChild(el('<div class="callout" style="border-left-color:var(--warn-line)">' +
      '<strong>A reset signs that person out everywhere.</strong> Every session they have open ends ' +
      'immediately, which is the point if the password leaked. They will need the new password to get ' +
      'back in, so tell them what it is.</div>'));

    if (!others.length) {
      put.appendChild(el('<div class="empty">There is no other account in this organization to reset.</div>'));
      wrap.appendChild(U.panel('Reset a password', null, put, true));
      return wrap;
    }

    var pick = U.field({ label: 'Account', type: 'select', required: true,
      options: others.map(function (u) {
        return { v: u.email, l: (u.name || u.email) + ' - ' + u.email + ' (' + u.role + ')' };
      }) });
    var pair = U.passwordPair('New password for this account');
    var msg  = el('<div style="min-height:17px;font-size:12px"></div>');
    var go   = H.btn('Reset this password', 'btn-primary', function () {
      msg.textContent = ''; msg.className = '';
      if (!pair.validate()) return;
      go.disabled = true;
      C.adminSetPassword(pick.value(), pair.value()).then(function (out) {
        go.disabled = false;
        if (out && out.ok) {
          pair.clear();
          msg.className = 'ok';
          msg.textContent = 'Password reset for ' + pick.value() + '. Their sessions have ended.';
          U.toast('Password reset', { kind: 'success', detail: pick.value() + ' must sign in again.' });
        } else {
          msg.className = 'err';
          msg.textContent = (out && out.data && out.data.message) || 'That change could not be saved.';
        }
      });
    });
    put.appendChild(U.formGrid([pick].concat(pair.fields)));
    put.appendChild(msg);
    var bar = el('<div></div>'); bar.appendChild(go); put.appendChild(bar);
    put.appendChild(el('<div class="fl-hint">To change your own password, use Settings - it keeps you ' +
      'signed in and asks for your current one.</div>'));
    wrap.appendChild(U.panel('Reset a password', 'Owner only', put, true));
    return wrap;
  }

  function rowOf(label, hint, control) {
    var r = el('<div class="set-row"><div class="set-lab"><strong>' + esc(label) + '</strong><span>' + hint + '</span></div></div>');
    r.appendChild(control);
    return r;
  }
})(typeof window !== 'undefined' ? window : globalThis);
