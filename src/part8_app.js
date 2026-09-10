/* ============================================================================
   Shell: navigation, the global month control, period presets, data entry.
   ========================================================================== */
(function (root) {
  'use strict';
  var C = root.CTC, U = root.UI, V = root.VIEWS, H = root.VIEWHELP;
  var el = U.el, esc = U.esc, money = U.money;

  var NAV = [
    {
      group: 'Overview', items: [
        ['dashboard', 'Dashboard', 'i-dashboard'], ['report-management', 'Management report', 'i-report']
      ]
    },
    {
      group: 'Financials', items: [
        ['revenue', 'Revenue', 'i-revenue'], ['costs', 'Costs', 'i-cost'], ['licences', 'Software & licences', 'i-licence'],
        ['empcost', 'Employee cost', 'i-payroll'], ['allocations', 'Allocations', 'i-alloc']
      ]
    },
    {
      group: 'Business', items: [
        ['clients', 'Clients', 'i-clients'], ['projects', 'Projects', 'i-projects'], ['employees', 'Employees', 'i-employees']
      ]
    },
    {
      group: 'Analytics', items: [
        ['profitability', 'Profitability', 'i-company'], ['emp-analytics', 'Employee analytics', 'i-empanalytics'],
        ['compare', 'Month comparison', 'i-compare']
      ]
    },
    { group: 'Reports', items: [['reports', 'Report centre', 'i-reports']] },
    { group: 'Administration', items: [['admin', 'Manage data', 'i-admin']] },
    { group: 'System', items: [['settings', 'Settings', 'i-settings']] }
  ];
  var WIDE = { allocations: 1 };
  var TITLES = {};
  NAV.forEach(function (g) { g.items.forEach(function (i) { TITLES[i[0]] = i[1]; }); });
  TITLES['profit-company'] = TITLES['profit-client'] = TITLES['profit-project'] = 'Profitability';
  TITLES.admin = 'Manage data'; TITLES.client = 'Client'; TITLES.project = 'Project'; TITLES.employee = 'Employee'; TITLES.report = 'Report';

  var PERIODS = [
    ['month', 'This month'], ['prev', 'Last month'], ['quarter', 'Quarter'],
    ['ytd', 'YTD'], ['year', 'Full year'], ['trailing12', 'Last 12M'], ['custom', 'Custom']
  ];
  // Screens whose records only make sense one month at a time.
  var MONTH_ONLY = { admin: 1, licences: 1, empcost: 1, allocations: 1, employees: 1, employee: 1, client: 1, project: 1, compare: 1, 'report-management': 1, settings: 1, 'emp-analytics': 1 };

  var App = {
    openDialog: function (title, body, actions, subtitle, opts) { openDialog(title, body, actions, subtitle, opts); },
    state: {
      route: 'dashboard', params: {}, month: C.CURRENT_MONTH, period: 'month',
      custom: [C.maddMonths(C.CURRENT_MONTH, -2), C.CURRENT_MONTH], filters: {}, matrixMode: false,
      matrixSort: 'revenue', compareA: null, compareB: null
    },
    go: function (route, params) {
      this.state.route = route; this.state.params = params || {};
      if (route !== 'projects' && route !== 'revenue' && route !== 'costs' && route !== 'employees') this.state.filters = {};
      this.render(); window.scrollTo({ top: 0 });
    },
    setMonth: function (m) { this.state.month = m; this.render(); },
    setPeriod: function (p) { this.state.period = p; this.render(); },
    dialogs: {}
  };
  root.App = App;

  /* ---------- nav ----------------------------------------------------------
     Two behaviours share one button. On a wide screen the rail is permanent
     and the button collapses it to icons; below 1000px there is no room for a
     permanent rail, so the same button slides it in over the page as a drawer
     with a scrim. The stored "icons only" preference is ignored while compact,
     because a drawer that shows only icons helps nobody.                     */
  var COMPACT = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(max-width:1060px)') : { matches: false, addEventListener: function () {} };
  function compact() { return COMPACT.matches; }
  function setDrawer(open) {
    var shell = document.querySelector('.app'), scrim = document.getElementById('scrim');
    shell.classList.toggle('nav-open', !!open);
    if (scrim) scrim.hidden = !open;
    var tog = document.getElementById('nav-toggle');
    if (tog) tog.setAttribute('aria-expanded', String(!!open));
    document.body.style.overflow = open ? 'hidden' : '';
  }
  function closeDrawer() { if (compact()) setDrawer(false); }

  function navPrefs() {
    var S = root.SET ? root.SET.get() : null;
    return {
      shut: S ? !!S.navCollapsed : false,
      groups: (S && S.navGroups) || {}
    };
  }
  function renderNav() {
    var nav = document.getElementById('nav');
    var pref = navPrefs();
    nav.innerHTML = '';
    var shell = document.querySelector('.app');
    shell.classList.toggle('nav-shut', pref.shut && !compact());
    var tog = document.getElementById('nav-toggle');
    if (tog) tog.setAttribute('aria-expanded', String(compact() ? shell.classList.contains('nav-open') : !pref.shut));

    NAV.forEach(function (g) {
      var closed = !pref.shut && pref.groups[g.group] === 0;
      var grp = el('<div class="nav-group' + (closed ? ' shut' : '') + '"></div>');
      if (g.group) {
        var hd = el('<button class="nav-head" type="button" aria-expanded="' + !closed + '">' +
          '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-chevron"></use></svg>' +
          '<span class="lbl">' + esc(g.group) + '</span></button>');
        hd.addEventListener('click', function () {
          if (!root.SET) return;
          var gs = Object.assign({}, root.SET.get().navGroups || {});
          gs[g.group] = closed ? 1 : 0;
          root.SET.set('navGroups', gs);
          renderNav();
        });
        grp.appendChild(hd);
      }
      g.items.forEach(function (it) {
        var active = App.state.route === it[0] ||
          (it[0] === 'clients' && App.state.route === 'client') ||
          (it[0] === 'projects' && App.state.route === 'project') ||
          (it[0] === 'employees' && App.state.route === 'employee') ||
          (it[0] === 'reports' && App.state.route === 'report');
        var b = el('<button class="nav-item"' + (active ? ' aria-current="page"' : '') + ' title="' + esc(it[1]) + '">' +
          '<svg class="ico nav-ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + it[2] + '"></use></svg>' +
          '<span class="lbl">' + esc(it[1]) + '</span></button>');
        b.addEventListener('click', function () { closeDrawer(); App.go(it[0]); });
        grp.appendChild(b);
      });
      nav.appendChild(grp);
    });
  }
  App.renderNav = renderNav;

  /* ---------- topbar ------------------------------------------------------- */
  function renderTopbar() {
    var s = App.state;
    document.getElementById('m-label').querySelector('.ctl-text').innerHTML =
      '<span class="m-long">' + esc(C.mlabel(s.month)) + '</span>' +
      '<span class="m-short">' + esc(C.mshort(s.month)) + '</span>';
    var cmp = document.getElementById('compare-text');
    if (cmp) cmp.textContent = 'vs ' + C.mshort(C.maddMonths(s.month, -1));
    var i = C.MONTHS.indexOf(s.month);
    document.getElementById('m-prev').disabled = i <= 0;
    document.getElementById('m-next').disabled = i >= C.MONTHS.length - 1;

    var box = document.getElementById('periods');
    box.innerHTML = '';
    var monthOnly = !!MONTH_ONLY[s.route];

    /* These screens are a single month by definition, so the period buttons
       could only ever be shown greyed out. A control that can never be used is
       noise: hide the bar and let the month in the header speak for itself. */
    var bar = document.querySelector('.periodbar');
    if (bar) bar.hidden = monthOnly;

    if (!monthOnly) PERIODS.forEach(function (p) {
      var b = el('<button aria-pressed="' + (s.period === p[0]) + '">' + esc(p[1]) + '</button>');
      b.addEventListener('click', function () {
        if (p[0] === 'custom') { App.dialogs.custom(); return; }
        if (p[0] === 'prev') { var pm = C.maddMonths(s.month, -1); if (C.MONTHS.indexOf(pm) !== -1) { s.month = pm; s.period = 'month'; App.render(); } return; }
        s.period = p[0]; App.render();
      });
      box.appendChild(b);
    });

    var cr = document.getElementById('crumbs');
    cr.innerHTML = '';
    function crumb(label, fn, here) {
      if (here) { cr.appendChild(el('<span class="here">' + esc(label) + '</span>')); return; }
      var b = el('<button>' + esc(label) + '</button>');
      if (fn) b.addEventListener('click', fn); else b.disabled = true;
      cr.appendChild(b);
      cr.appendChild(el('<span class="sep">/</span>'));
    }
    if (s.route === 'client') {
      crumb('Clients', function () { App.go('clients'); });
      var cl = C.CLIENTS.filter(function (x) { return x.id === s.params.id; })[0];
      crumb(cl ? cl.name : 'Client', null, true);
    } else if (s.route === 'project') {
      crumb('Clients', function () { App.go('clients'); });
      var pr = C.PROJECTS.filter(function (x) { return x.id === s.params.id; })[0];
      if (pr) {
        var pc = C.CLIENTS.filter(function (x) { return x.id === pr.clientId; })[0];
        crumb(pc.name, function () { App.go('client', { id: pc.id }); });
      }
      crumb(pr ? pr.name : 'Project', null, true);
    } else if (s.route === 'employee') {
      crumb('Employees', function () { App.go('employees'); });
      var e = C.EMPLOYEES.filter(function (x) { return x.id === s.params.id; })[0];
      crumb(e ? e.name : 'Employee', null, true);
    } else if (s.route === 'report') {
      crumb('Report centre', function () { App.go('reports'); });
      crumb(TITLES.report, null, true);
    } else {
      crumb(TITLES[s.route] || 'Dashboard', null, true);
    }

    var stamp = document.getElementById('stamp');
    if (stamp) stamp.innerHTML = '';
    root.App.periodClosed = C.mindex(s.month) < C.mindex(C.CURRENT_MONTH);
    var rc = document.getElementById('rail-count');
    if (rc) rc.textContent = C.MONTHS.length + ' months';
  }

  App.render = function () {
    renderNav(); renderTopbar();
    var s = App.state;
    if (MONTH_ONLY[s.route] && s.period !== 'month') s.period = 'month';
    var view = document.getElementById('view');
    /* the allocation workbench is a tool, not a document: let it use the screen */
    view.className = 'content' + (WIDE[s.route] ? ' wide' : '');
    view.innerHTML = '';
    var fn = V[s.route] || V.dashboard;
    try {
      view.appendChild(fn(s));
    } catch (err) {
      view.appendChild(el('<div class="empty">Something went wrong rendering this screen: ' + esc(err.message) + '</div>'));
      if (root.console) console.error(err);
    }
  };

  /* ---------- dialogs ------------------------------------------------------ */
  var dlg = document.getElementById('dlg');
  function openDialog(title, bodyNode, actions, subtitle, opts) {
    dlg.classList.toggle('wide', !!(opts && opts.wide));
    document.getElementById('dlg-title').textContent = title;
    var sub = document.getElementById('dlg-sub');
    sub.textContent = subtitle || '';
    sub.hidden = !subtitle;
    var body = document.getElementById('dlg-body'); body.innerHTML = ''; body.appendChild(bodyNode);
    var acts = document.getElementById('dlg-actions'); acts.innerHTML = '';
    var cancel = el('<button class="btn" type="submit" value="cancel">Cancel</button>');
    acts.appendChild(cancel);
    (actions || []).forEach(function (a) { acts.appendChild(a); });
    document.getElementById('dlg-msg').textContent = '';
    document.getElementById('dlg-msg').className = 'muted';
    dlg.showModal();
    // land on the first control, and let Enter commit the primary action
    var first = body.querySelector('input:not([type=file]), select, textarea');
    if (first) setTimeout(function () { first.focus(); if (first.select) first.select(); }, 20);
    var primary = acts.querySelector('.btn-primary');
    body.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && primary && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); primary.click(); }
    });
  }
  var field = U.field, grid = U.formGrid, section = U.formSection;
  function monthOpts() { return C.MONTHS.map(function (m) { return { v: m, l: C.mlabel(m) }; }); }
  function curSym() {
    var S = root.SET ? root.SET.get() : null;
    var c = S && root.SET.currencies.filter(function (x) { return x.v === S.currency; })[0];
    return c ? c.sym.trim() : '$';
  }
  function stack(rows) {
    var box = el('<div style="display:flex;flex-direction:column;gap:18px"></div>');
    rows.forEach(function (r) { if (r) box.appendChild(r); });
    return box;
  }

  /* pre: {month, clientId, projectId} — open the dialog already pointed at
     whatever the user was looking at (a project page, a client page, a month). */
  App.dialogs.revenue = function (pre) {
    var s = App.state; pre = pre || {};
    if (pre.projectId && !pre.clientId) { var pp = C.byId(C.PROJECTS, pre.projectId); if (pp) pre.clientId = pp.clientId; }
    var month = field({ label: 'Month', type: 'select', value: pre.month || s.month, options: monthOpts(), hint: 'Revenue is always booked <strong>to a month</strong>.' });
    var client = field({
      label: 'Client', type: 'select', value: pre.clientId || (C.CLIENTS[0] && C.CLIENTS[0].id),
      options: C.CLIENTS.map(function (c) { return { v: c.id, l: c.name }; })
    });
    var project = field({ label: 'Project', type: 'select', options: [] });
    var amount = field({ label: 'Revenue for this month', type: 'number', step: 100, min: 0, prefix: curSym() });
    function fillProjects() {
      var m = month.value(), sel = project.input;
      sel.innerHTML = '';
      var live = C.PROJECTS.filter(function (p) { return p.clientId === client.value() && p.billable !== false && C.isActiveProj(p, m); });
      live.forEach(function (p) { sel.appendChild(el('<option value="' + p.id + '">' + esc(p.name) + '</option>')); });
      if (!live.length) sel.appendChild(el('<option value="">No project running that month</option>'));
      if (pre.projectId && live.some(function (p) { return p.id === pre.projectId; })) sel.value = pre.projectId;
      showCurrent();
    }
    function showCurrent() {
      var m = month.value(), pid = project.value();
      if (!pid) { amount.input.value = ''; amount.setHint('Pick a client with a project running in that month.'); return; }
      var cur = C.snapshot(m).revenue[pid] || 0;
      amount.input.value = cur;
      amount.setHint('Currently booked for <strong>' + esc(C.mlabel(m)) + '</strong>: ' + money(cur) +
        '. Saving replaces that month and leaves every other month untouched.');
    }
    client.input.addEventListener('change', fillProjects);
    month.input.addEventListener('change', fillProjects);
    project.input.addEventListener('change', showCurrent);
    fillProjects();
    var save = el('<button class="btn btn-primary" type="button">Save revenue</button>');
    save.addEventListener('click', function () {
      var m = month.value(), pid = project.value(), v = +amount.value();
      if (!pid) return project.fail('Pick a project that was running in that month.');
      if (isNaN(v) || v < 0) return amount.fail('Enter an amount of zero or more.');
      C.setRevenue(m, pid, v);
      dlg.close();
      U.toast('Revenue saved', { kind: 'success', detail: money(v) + ' booked to ' + H.projName(pid) + ' for ' + C.mlabel(m) + '.' });
      App.render();
    });
    var sheet = el('<button class="btn btn-ghost" type="button">Whole month instead…</button>');
    sheet.addEventListener('click', function () { dlg.close(); App.dialogs.revenueSheet(month.value()); });
    openDialog('Add revenue', stack([month, grid([client, project]), amount]), [sheet, save],
      'Every revenue record belongs to one month.');
  };

  /* Month revenue sheet: every project running in the month on one grid.
     Type straight into the cells, paste a column from a spreadsheet, or copy
     last month, then save once. Only cells that changed are written. */
  App.dialogs.revenueSheet = function (m0) {
    var cur = m0 || App.state.month;
    var month = field({ label: 'Month', type: 'select', value: cur, options: monthOpts() });
    var body = el('<div class="sheet-wrap"></div>');
    var rows = [], inputs = [];
    function prevOf(m) { return C.mindex(m) > 0 ? C.maddMonths(m, -1) : null; }
    function num(v) { v = String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''); return v === '' ? NaN : +v; }
    function draw() {
      var m = month.value(), pm = prevOf(m), snap = C.snapshot(m), prev = pm ? C.snapshot(pm).revenue : {};
      rows = C.PROJECTS.filter(function (p) { return p.billable !== false && C.isActiveProj(p, m); }).map(function (p) {
        var cl = C.byId(C.CLIENTS, p.clientId) || {};
        return { p: p, client: cl.name || '', was: snap.revenue[p.id] || 0, last: prev[p.id] || 0 };
      }).sort(function (a, b) { return a.client.localeCompare(b.client) || a.p.name.localeCompare(b.p.name); });
      var h = '<table class="sheet"><thead><tr><th>Project</th><th class="n">' + (pm ? esc(C.mshort(pm)) : 'Previous') + '</th>' +
        '<th class="n">' + esc(C.mshort(m)) + '</th><th class="n">Change</th></tr></thead><tbody>';
      rows.forEach(function (r, i) {
        h += '<tr><td><strong>' + esc(r.p.name) + '</strong><div class="muted" style="font-size:11px">' + esc(r.client) + ' · ' + esc(r.p.type) + '</div></td>' +
          '<td class="n muted">' + (r.last ? money(r.last) : '—') + '</td>' +
          '<td class="n"><input class="sh-in" type="text" inputmode="decimal" data-i="' + i + '" value="' + r.was.toLocaleString() + '" aria-label="' + esc(r.p.name) + ' revenue"></td>' +
          '<td class="n sh-chg" data-i="' + i + '"></td></tr>';
      });
      h += '</tbody><tfoot><tr><th id="sh-count"></th><th class="n" id="sh-last"></th><th class="n" id="sh-total"></th><th class="n" id="sh-delta"></th></tr></tfoot></table>';
      body.innerHTML = h;
      inputs = Array.prototype.slice.call(body.querySelectorAll('.sh-in'));
      inputs.forEach(function (inp) {
        inp.addEventListener('input', recalc);
        inp.addEventListener('focus', function () { inp.value = String(num(inp.value) || (inp.value === '' ? '' : 0)).replace('NaN', ''); inp.select(); });
        inp.addEventListener('blur', function () { var v = num(inp.value); if (!isNaN(v)) inp.value = Math.round(v).toLocaleString(); });
        inp.addEventListener('keydown', function (e) {
          var i = +inp.getAttribute('data-i');
          if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (inputs[i + 1]) inputs[i + 1].focus(); }
          if (e.key === 'ArrowUp') { e.preventDefault(); if (inputs[i - 1]) inputs[i - 1].focus(); }
        });
        inp.addEventListener('paste', function (e) {
          var txt = (e.clipboardData || window.clipboardData).getData('text') || '';
          var lines = txt.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
          if (lines.length < 2) return;                       /* a single value pastes normally */
          e.preventDefault();
          var i = +inp.getAttribute('data-i');
          lines.forEach(function (l, k) { var v = num(l.split('\t').pop()); if (inputs[i + k] && !isNaN(v)) inputs[i + k].value = v; });
          recalc();
          U.toast('Pasted ' + Math.min(lines.length, inputs.length - i) + ' values', { detail: 'Filled down from ' + rows[i].p.name + '. Nothing is saved until you click Save.' });
        });
      });
      recalc();
    }
    function recalc() {
      var tot = 0, last = 0, changed = 0;
      rows.forEach(function (r, i) {
        var v = num(inputs[i].value), cell = body.querySelector('.sh-chg[data-i="' + i + '"]');
        var bad = isNaN(v) || v < 0; inputs[i].classList.toggle('bad', bad);
        if (bad) { cell.innerHTML = '<span class="bad">?</span>'; return; }
        tot += v; last += r.last;
        var dirty = Math.round(v) !== r.was; if (dirty) changed++;
        inputs[i].classList.toggle('dirty', dirty);
        var d = v - r.last;
        cell.innerHTML = r.last ? '<span class="' + (d > 0 ? 'ok' : d < 0 ? 'bad' : 'muted') + '">' + (d === 0 ? '—' : (d > 0 ? '+' : '−') + money(Math.abs(d))) + '</span>' : '<span class="muted">new</span>';
      });
      body.querySelector('#sh-count').textContent = rows.length + ' projects · ' + changed + ' changed';
      body.querySelector('#sh-last').textContent = money(last);
      body.querySelector('#sh-total').textContent = money(tot);
      var dd = tot - last;
      body.querySelector('#sh-delta').innerHTML = '<span class="' + (dd > 0 ? 'ok' : dd < 0 ? 'bad' : 'muted') + '">' + (dd === 0 ? '—' : (dd > 0 ? '+' : '−') + money(Math.abs(dd))) + '</span>';
      save.disabled = !changed;
      save.textContent = changed ? 'Save ' + changed + ' change' + (changed === 1 ? '' : 's') : 'Nothing to save';
    }
    var copy = el('<button class="btn btn-ghost btn-sm" type="button">Copy last month into empty cells</button>');
    copy.addEventListener('click', function () {
      var n = 0; rows.forEach(function (r, i) { if (!num(inputs[i].value) && r.last) { inputs[i].value = r.last; n++; } });
      recalc(); U.toast(n ? 'Filled ' + n + ' empty cell' + (n === 1 ? '' : 's') : 'No empty cells to fill', { detail: n ? 'Review the figures, then save.' : '' });
    });
    var tools = el('<div class="sheet-tools"></div>');
    tools.appendChild(el('<div class="muted" style="font-size:12.5px">Type into a cell, press <kbd>Enter</kbd> for the next row, or paste a column straight from a spreadsheet.</div>'));
    tools.appendChild(copy);
    var save = el('<button class="btn btn-primary" type="button">Save</button>');
    save.addEventListener('click', function () {
      var m = month.value(), n = 0, tot = 0;
      rows.forEach(function (r, i) { var v = num(inputs[i].value); if (isNaN(v) || v < 0) return; tot += v; if (Math.round(v) !== r.was) { C.setRevenue(m, r.p.id, v); n++; } });
      dlg.close();
      U.toast('Revenue saved for ' + C.mlabel(m), { kind: 'success', detail: n + ' project' + (n === 1 ? '' : 's') + ' updated · month total ' + money(tot) + '.' });
      if (App.state.month !== m) App.setMonth(m); else App.render();
    });
    month.input.addEventListener('change', draw);
    draw();
    openDialog('Month revenue sheet', stack([month, tools, body]), [save],
      'Every project running in the month, on one sheet. Only changed cells are written.', { wide: true });
  };

  App.dialogs.cost = function (pre) {
    var s = App.state; pre = pre || {};
    var month = field({ label: 'Month', type: 'select', value: pre.month || s.month, options: monthOpts() });
    var project = field({ label: 'Project', type: 'select', options: [], hint: 'A cost with no project stays above the project line and only hits company profit.' });
    var cat = field({ label: 'Category', type: 'select', options: C.COST_CATEGORIES.map(function (c) { return { v: c, l: c }; }) });
    var amount = field({ label: 'Amount', type: 'number', step: 50, min: 0, prefix: curSym(), value: 0 });
    function fill() {
      var m = month.value(), sel = project.input;
      sel.innerHTML = '<option value="">Company-level (no project)</option>';
      C.PROJECTS.filter(function (p) { return C.isActiveProj(p, m); }).forEach(function (p) {
        var cl = C.CLIENTS.filter(function (c) { return c.id === p.clientId; })[0];
        sel.appendChild(el('<option value="' + p.id + '">' + esc(cl.name + ' · ' + p.name) + '</option>'));
      });
    }
    month.input.addEventListener('change', fill); fill();
    if (pre.projectId) project.input.value = pre.projectId;
    var save = el('<button class="btn btn-primary" type="button">Book cost</button>');
    save.addEventListener('click', function () {
      var m = month.value(), v = +amount.value();
      if (isNaN(v) || v <= 0) return amount.fail('Enter an amount above zero.');
      C.addCost(m, project.value() || null, cat.value(), v);
      dlg.close();
      U.toast('Cost booked', {
        kind: 'success',
        detail: money(v) + ' of ' + cat.value().toLowerCase() + ' to ' +
          (project.value() ? H.projName(project.value()) : 'company overhead') + ' for ' + C.mlabel(m) + '.'
      });
      App.render();
    });
    openDialog('Book a cost', stack([month, project, grid([cat, amount])]), [save],
      'Costs are booked to a month, and optionally to a project.');
  };

  App.dialogs.employee = function () {
    var name = field({ label: 'Name', required: true, placeholder: 'Full name' });
    var title = field({ label: 'Role', placeholder: 'e.g. Salesforce Developer' });
    var dept = field({
      label: 'Department', type: 'select',
      options: H.dedupe(C.EMPLOYEES.map(function (e) { return e.dept; })).sort().map(function (d) { return { v: d, l: d }; })
    });
    var ctc = field({ label: 'Annual CTC', required: true, type: 'number', step: 600, min: 0, prefix: curSym(), value: 48000 });
    var join = field({ label: 'Joining month', type: 'select', value: App.state.month, options: monthOpts() });
    var out = U.readout('');
    function calc() { out.innerHTML = '<b>' + money((+ctc.value() || 0) / 12) + '</b> monthly cost, charged from ' + esc(C.mlabel(join.value())); }
    ctc.input.addEventListener('input', calc);
    join.input.addEventListener('change', calc);
    calc();
    var save = el('<button class="btn btn-primary" type="button">Add person</button>');
    save.addEventListener('click', function () {
      var n = name.value().trim(), v = +ctc.value();
      if (!n) return name.fail('Give this person a name.');
      if (!v || v <= 0) return ctc.fail('Enter an annual CTC above zero.');
      var id = C.addEmployee({ name: n, title: title.value().trim() || 'Consultant', dept: dept.value(), ctc: v, join: join.value() });
      dlg.close();
      U.toast('Added ' + n, { kind: 'success', detail: money(v / 12) + ' a month from ' + C.mlabel(join.value()) + '.', action: { label: 'Allocate now', fn: function () { App.openAllocation(id); } } });
      App.go('employee', { id: id });
    });
    openDialog('Add a person', stack([grid([name, title]), grid([dept, join]), section('Cost'), ctc, out]), [save],
      'Monthly cost is annual CTC ÷ 12.');
  };

  /* ---------- passwords ------------------------------------------------------
     Both live here with the other dialogs rather than inside the screens that
     open them, so Settings and Administration open exactly the same thing. The
     minimum length comes from U.PASSWORD_MIN, which mirrors the database's
     assert_password_ok(). */
  function pwMsg(cls, text) {
    var m = document.getElementById('dlg-msg');
    m.className = cls; m.textContent = text;
  }

  App.dialogs.password = function () {
    var cur = field({ label: 'Current password', type: 'password', required: true });
    var a = field({ label: 'New password', type: 'password', required: true,
                    hint: 'At least ' + U.PASSWORD_MIN + ' characters.' });
    var b = field({ label: 'Repeat new password', type: 'password', required: true });

    var save = el('<button class="btn btn-primary" type="button">Change password</button>');
    save.addEventListener('click', function () {
      pwMsg('muted', '');
      [cur, a, b].forEach(function (f) { f.clear(); });
      if (!cur.value()) { cur.fail('Enter your current password.'); return; }
      if (a.value().length < U.PASSWORD_MIN) { a.fail('At least ' + U.PASSWORD_MIN + ' characters.'); return; }
      if (a.value() !== b.value()) { b.fail('The two passwords do not match.'); return; }
      if (a.value() === cur.value()) { a.fail('That is already your password.'); return; }

      save.disabled = true;
      pwMsg('muted', 'Saving…');
      C.setOwnPassword(cur.value(), a.value()).then(function (out) {
        save.disabled = false;
        if (out && out.ok) {
          dlg.close();
          U.toast('Password changed', { kind: 'success',
            detail: 'Every other sign-in for your account has ended.' });
        } else {
          pwMsg('err', (out && out.data && out.data.message) || 'That change could not be saved.');
        }
      });
    });

    App.openDialog('Change your password', stack([cur, grid([a, b])]), [save],
      'You stay signed in here. Every other sign-in for your account ends.');
  };

  /* Owner only, and the server checks that too - this dialog opening is not
     the permission. */
  App.dialogs.resetPassword = function (email) {
    var a = field({ label: 'New password', type: 'password', required: true,
                    hint: 'At least ' + U.PASSWORD_MIN + ' characters.' });
    var b = field({ label: 'Repeat new password', type: 'password', required: true });
    var warn = el('<div class="callout" style="border-left-color:var(--warn-line)">' +
      '<strong>This signs them out everywhere.</strong> Every session they have open ends now, ' +
      'which is the point if the password leaked. They cannot get back in until you tell them ' +
      'the new one.</div>');

    var save = el('<button class="btn btn-primary" type="button">Reset password</button>');
    save.addEventListener('click', function () {
      pwMsg('muted', '');
      [a, b].forEach(function (f) { f.clear(); });
      if (a.value().length < U.PASSWORD_MIN) { a.fail('At least ' + U.PASSWORD_MIN + ' characters.'); return; }
      if (a.value() !== b.value()) { b.fail('The two passwords do not match.'); return; }

      save.disabled = true;
      pwMsg('muted', 'Saving…');
      C.adminSetPassword(email, a.value()).then(function (out) {
        save.disabled = false;
        if (out && out.ok) {
          dlg.close();
          U.toast('Password reset', { kind: 'success', detail: email + ' must sign in again.' });
        } else {
          pwMsg('err', (out && out.data && out.data.message) || 'That change could not be saved.');
        }
      });
    });

    App.openDialog('Reset password', stack([warn, grid([a, b])]), [save], email);
  };

  App.dialogs.custom = function () {
    var s = App.state;
    var from = field({ label: 'From', type: 'select', value: s.custom[0], options: monthOpts() });
    var to = field({ label: 'To', type: 'select', value: s.custom[1], options: monthOpts() });
    var save = el('<button class="btn btn-primary" type="button">Apply range</button>');
    save.addEventListener('click', function () {
      s.custom = [from.value(), to.value()];
      s.period = 'custom'; dlg.close(); App.render();
    });
    openDialog('Custom range', stack([grid([from, to])]), [save],
      'A custom range is still a sum of whole months.');
  };

  App.dialogs.month = function () {
    var body = el('<div style="display:flex;flex-direction:column;gap:10px"></div>');
    var years = H.dedupe(C.MONTHS.map(function (m) { return C.mparse(m).y; }));
    years.forEach(function (y) {
      var row = el('<div><div class="eyebrow" style="margin-bottom:6px">' + y + '</div><div class="chips"></div></div>');
      var chips = row.querySelector('.chips');
      C.MONTHS.filter(function (m) { return C.mparse(m).y === y; }).forEach(function (m) {
        var b = el('<button class="chip" aria-pressed="' + (m === App.state.month) + '">' + C.mabbr(m) + '</button>');
        b.addEventListener('click', function () { dlg.close(); App.setMonth(m); });
        chips.appendChild(b);
      });
      body.appendChild(row);
    });
    openDialog('Jump to month', body, [], 'The reporting month drives every screen.');
  };

  /* ---------- boot --------------------------------------------------------- */
  document.getElementById('m-prev').addEventListener('click', function () {
    var i = C.MONTHS.indexOf(App.state.month); if (i > 0) App.setMonth(C.MONTHS[i - 1]);
  });
  document.getElementById('m-next').addEventListener('click', function () {
    var i = C.MONTHS.indexOf(App.state.month); if (i < C.MONTHS.length - 1) App.setMonth(C.MONTHS[i + 1]);
  });
  document.getElementById('m-label').addEventListener('click', function (e) { e.preventDefault(); App.dialogs.month(); });
  document.getElementById('nav-toggle').addEventListener('click', function () {
    if (compact()) { setDrawer(!document.querySelector('.app').classList.contains('nav-open')); return; }
    if (!root.SET) return;
    root.SET.set('navCollapsed', !root.SET.get().navCollapsed);
    renderNav();
  });
  var scrimEl = document.getElementById('scrim');
  if (scrimEl) scrimEl.addEventListener('click', closeDrawer);
  COMPACT.addEventListener('change', function () { setDrawer(false); renderNav(); });
  /* --- topbar affordances -------------------------------------------------- */
  var brandHome = document.getElementById('brand-home');
  if (brandHome) brandHome.addEventListener('click', function (e) { e.preventDefault(); closeDrawer(); App.go('dashboard'); });
  var cmpBtn = document.getElementById('compare-btn');
  if (cmpBtn) cmpBtn.addEventListener('click', function () { App.dialogs.month(); });
  var insightBtn = document.getElementById('insight-btn');
  if (insightBtn) insightBtn.addEventListener('click', function () {
    var box = document.getElementById('insight-panel');
    if (box) { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    App.go('report-management');
  });
  var helpBtn = document.getElementById('help-btn');
  if (helpBtn) helpBtn.addEventListener('click', function () {
    var body = U.el('<div class="stack" style="gap:14px"></div>');
    body.appendChild(U.el('<div class="callout">Every figure on every screen is computed from the monthly ledger. ' +
      'Changing a month never touches another month.</div>'));
    body.appendChild(U.el('<div class="keys">' +
      [['N', 'open the New menu'], ['R', 'add revenue'], ['S', 'month revenue sheet'], ['C', 'book a cost'], ['L', 'add a software licence'], ['E', 'add an employee'], ['A', 'allocations'],
       ['[', 'previous month'], [']', 'next month'], ['Esc', 'close a dialog or the navigation drawer'],
       ['Tab', 'move through controls'], ['Enter', 'confirm the primary action in a dialog']]
        .map(function (k) { return '<div class="keyrow"><kbd>' + k[0] + '</kbd><span>' + k[1] + '</span></div>'; }).join('') +
      '</div>'));
    App.openDialog('Shortcuts and how this works', body, [], 'Code to Click Profitability Intelligence');
  });
  /* ---- quick add: one "+ New" that works from every screen -------------- */
  var QA = [
    ['revenue', 'Revenue', 'i-revenue', 'R', 'A project’s revenue for a month'],
    ['sheet', 'Month revenue sheet', 'i-report', 'S', 'Every project for a month, in bulk'],
    ['cost', 'Cost', 'i-cost', 'C', 'Cloud, contractors, travel…'],
    ['licence', 'Software licence', 'i-licence', 'L', 'Shared by everyone, charged by allocation'],
    ['employee', 'Employee', 'i-employees', 'E', 'CTC and joining month'],
    ['allocation', 'Allocation', 'i-alloc', 'A', 'Who works on what, by month']
  ];
  function quickAdd(kind) {
    closeQuick();
    var s = App.state, ctx = {};
    if (s.route === 'project') ctx.projectId = s.params.id;
    if (s.route === 'client') ctx.clientId = s.params.id;
    switch (kind) {
      case 'revenue': return App.dialogs.revenue(ctx);
      case 'sheet': return App.dialogs.revenueSheet(s.month);
      case 'cost': return App.dialogs.cost(ctx);
      case 'licence': return App.dialogs.licence ? App.dialogs.licence() : App.go('licences');
      case 'employee': return App.dialogs.employee();
      case 'allocation': return s.route === 'employee' ? App.openAllocation(s.params.id) : App.go('allocations');
    }
  }
  var qaBtn = document.getElementById('new-btn'), qaPop = document.getElementById('new-pop');
  function closeQuick() { if (qaPop) { qaPop.hidden = true; qaBtn.setAttribute('aria-expanded', 'false'); } }
  if (qaBtn && qaPop) {
    qaPop.innerHTML = QA.map(function (q) {
      return '<button type="button" class="qa-item" data-kind="' + q[0] + '"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + q[2] + '"></use></svg>' +
        '<span class="qa-txt"><span class="qa-lab">' + q[1] + '</span><span class="qa-sub">' + q[4] + '</span></span><kbd>' + q[3] + '</kbd></button>';
    }).join('');
    qaPop.querySelectorAll('.qa-item').forEach(function (b) { b.addEventListener('click', function () { quickAdd(b.getAttribute('data-kind')); }); });
    qaBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = qaPop.hidden; qaPop.hidden = !open; qaBtn.setAttribute('aria-expanded', String(open));
      if (open) { var first = qaPop.querySelector('.qa-item'); if (first) first.focus(); }
    });
    qaPop.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', closeQuick);
  }
  App.quickAdd = quickAdd;

  var profileBtn = document.getElementById('profile-btn');
  if (profileBtn) profileBtn.addEventListener('click', function () { App.go('settings'); });

  document.getElementById('theme-toggle').addEventListener('click', function () {
    var order = ['system', 'light', 'dark'];
    var cur = root.SET ? root.SET.get().theme : 'system';
    var next = order[(order.indexOf(cur) + 1) % order.length];
    if (root.SET) { root.SET.set('theme', next); }
    var b = document.getElementById('theme-toggle');
    b.setAttribute('data-tip', 'Theme: ' + next.charAt(0).toUpperCase() + next.slice(1));
    b.setAttribute('aria-label', 'Colour theme: ' + next + '. Click to change.');
  });
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || dlg.open) return;
    if (e.key === 'Escape') { closeDrawer(); closeQuick(); }
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.isContentEditable || e.target.tagName === 'TEXTAREA') return;
    var k = e.key.toLowerCase();
    if (k === 'n' && qaBtn) { e.preventDefault(); qaBtn.click(); return; }
    var hit = QA.filter(function (q) { return q[3].toLowerCase() === k; })[0];
    if (hit) { e.preventDefault(); quickAdd(hit[0]); return; }
    if (e.key === '[') document.getElementById('m-prev').click();
    if (e.key === ']') document.getElementById('m-next').click();
  });

  App.render();
})(typeof window !== 'undefined' ? window : globalThis);
