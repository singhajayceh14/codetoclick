/* ============================================================================
   Settings.

   Everything on this screen is live: change a control and the whole product
   reformats, re-bands or re-calendars on the spot. Choices are kept in this
   browser so the next visit opens the way you left it.
   ========================================================================== */
(function (root) {
  'use strict';
  var C = root.CTC, U = root.UI, V = root.VIEWS, H = root.VIEWHELP;
  var money = U.money, moneyK = U.moneyK, pct = U.pct, esc = U.esc, el = U.el;

  var CURRENCIES = [
    { v: 'USD', l: 'US dollar (USD)', sym: '$', loc: 'en-US' },
    { v: 'EUR', l: 'Euro (EUR)', sym: '€', loc: 'de-DE' },
    { v: 'GBP', l: 'Pound sterling (GBP)', sym: '£', loc: 'en-GB' },
    { v: 'INR', l: 'Indian rupee (INR)', sym: '₹', loc: 'en-IN' },
    { v: 'AED', l: 'UAE dirham (AED)', sym: 'AED ', loc: 'en-AE' },
    { v: 'SGD', l: 'Singapore dollar (SGD)', sym: 'S$', loc: 'en-SG' },
    { v: 'AUD', l: 'Australian dollar (AUD)', sym: 'A$', loc: 'en-AU' },
    { v: 'CAD', l: 'Canadian dollar (CAD)', sym: 'C$', loc: 'en-CA' }
  ];
  var DEFAULTS = {
    theme: 'system', density: 'comfortable',
    currency: 'USD', scale: 'international', pctDp: 1,
    bandHealthy: 35, bandWatch: 20,
    allocStep: 5, fiscalStart: 1, navCollapsed: false, navGroups: {},
    defaultPeriod: 'month', landing: 'dashboard'
  };
  var state = null;

  function load() {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) { out[k] = DEFAULTS[k]; });
    try {
      var raw = localStorage.getItem('c2c-settings');
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(DEFAULTS).forEach(function (k) { if (saved[k] != null) out[k] = saved[k]; });
      }
    } catch (e) { }
    return out;
  }
  function save() { try { localStorage.setItem('c2c-settings', JSON.stringify(state)); } catch (e) { } }

  function apply() {
    var cur = CURRENCIES.filter(function (c) { return c.v === state.currency; })[0] || CURRENCIES[0];
    U.setFormat({ symbol: cur.sym, locale: cur.loc, scale: state.scale, pctDp: +state.pctDp });
    U.BANDS.healthy = state.bandHealthy / 100;
    U.BANDS.watch = state.bandWatch / 100;
    C.setFiscalStart(+state.fiscalStart);
    U.setDensity(state.density === 'compact');
    var r = document.documentElement;
    if (state.theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', state.theme);
    var foot = document.getElementById('rail-count');
    if (foot) foot.textContent = C.MONTHS.length + ' months';
    var cl = document.getElementById('rail-currency');
    if (cl) cl.textContent = state.currency + ' · monthly ledger';
  }
  function set(k, v) { state[k] = v; save(); if (k === 'density') U.setDensity(v === 'compact'); apply(); }

  root.SET = {
    get: function () { return state || (state = load()); },
    set: set, apply: apply, currencies: CURRENCIES, defaults: DEFAULTS,
    reset: function () { state = null; try { localStorage.removeItem('c2c-settings'); } catch (e) { } state = load(); apply(); }
  };
  state = load();

  /* ---------- controls ----------------------------------------------------- */
  function row(label, hint, control) {
    var r = el('<div class="set-row"><div class="set-lab"><strong>' + esc(label) + '</strong>' +
      (hint ? '<span>' + hint + '</span>' : '') + '</div></div>');
    r.appendChild(control);
    return r;
  }
  function seg(value, options, onPick) {
    var w = el('<div class="seg-toggle" role="group"></div>');
    options.forEach(function (o) {
      var b = el('<button type="button" aria-pressed="' + (String(o.v) === String(value)) + '">' + esc(o.l) + '</button>');
      b.addEventListener('click', function () { onPick(o.v); });
      w.appendChild(b);
    });
    return w;
  }
  function select(value, options, onPick) {
    var w = el('<select>' + options.map(function (o) {
      return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(value) ? ' selected' : '') + '>' + esc(o.l) + '</option>';
    }).join('') + '</select>');
    w.addEventListener('change', function () { onPick(w.value); });
    return w;
  }

  /* ---------- the screen --------------------------------------------------- */
  V.settings = function (s) {
    var f = document.createDocumentFragment();
    var S = root.SET.get();
    function change(k, v) { set(k, v); root.App.render(); }

    f.appendChild(H.head('Settings',
      'Every control here takes effect immediately across the product, and is remembered in this browser.',
      [H.btn('Restore defaults', '', function () { root.SET.reset(); root.App.render(); })]));

    /* --- appearance --- */
    f.appendChild(H.section('Appearance'));
    var app = el('<div class="set-list"></div>');
    app.appendChild(row('Theme', 'System follows your operating system setting.',
      seg(S.theme, [{ v: 'system', l: 'System' }, { v: 'light', l: 'Light' }, { v: 'dark', l: 'Dark' }],
        function (v) { change('theme', v); })));
    app.appendChild(row('Navigation', 'Collapse the side navigation to icons only. The header button toggles it too.',
      seg(S.navCollapsed ? 'icons' : 'full', [{ v: 'full', l: 'Labels' }, { v: 'icons', l: 'Icons only' }],
        function (v) { set('navCollapsed', v === 'icons'); root.App.renderNav(); root.App.render(); })));
    app.appendChild(row('Table density', 'Compact fits roughly a third more rows on screen.',
      seg(S.density, [{ v: 'comfortable', l: 'Comfortable' }, { v: 'compact', l: 'Compact' }],
        function (v) { change('density', v); })));
    f.appendChild(U.panel('Display', null, app, true));

    /* --- numbers --- */
    f.appendChild(H.section('Numbers and currency'));
    var num = el('<div class="set-list"></div>');
    num.appendChild(row('Currency', 'Changes the symbol and digit grouping. Figures are <strong>not</strong> converted — the ledger stays in its recorded amounts.',
      select(S.currency, root.SET.currencies.map(function (c) { return { v: c.v, l: c.l }; }), function (v) { change('currency', v); })));
    num.appendChild(row('Large numbers', 'How abbreviated figures are written on tiles and charts.',
      seg(S.scale, [{ v: 'international', l: 'K / M' }, { v: 'indian', l: 'Lakh / Crore' }, { v: 'full', l: 'Full digits' }],
        function (v) { change('scale', v); })));
    num.appendChild(row('Percentage precision', 'Decimal places on every margin and share.',
      seg(String(S.pctDp), [{ v: '0', l: '0' }, { v: '1', l: '1' }, { v: '2', l: '2' }],
        function (v) { change('pctDp', +v); })));
    var sample = C.rollup(s.month).company;
    num.appendChild(row('Preview', 'Live sample using this month’s figures.',
      el('<div class="set-preview"><span><b>' + money(sample.revenue) + '</b>full</span>' +
        '<span><b>' + moneyK(sample.revenue) + '</b>abbreviated</span>' +
        '<span><b>' + pct(sample.margin) + '</b>margin</span>' +
        '<span><b>' + moneyK(sample.employeeCost) + '</b>employee cost</span></div>')));
    f.appendChild(U.panel('Formatting', null, num, true));

    /* --- calendar --- */
    f.appendChild(H.section('Reporting calendar'));
    var cal = el('<div class="set-list"></div>');
    var months = C.MONTH_NAMES.map(function (n, i) { return { v: i + 1, l: n }; });
    cal.appendChild(row('Financial year starts in', 'Drives Quarter, Year to date and Full year everywhere. Monthly records are untouched.',
      select(S.fiscalStart, months, function (v) { change('fiscalStart', +v); })));
    var q = C.monthsFor('quarter', s.month), y = C.monthsFor('ytd', s.month), fy = C.monthsFor('year', s.month);
    cal.appendChild(row('Resolves to', 'For the reporting month ' + esc(C.mlabel(s.month)) + '.',
      el('<div class="set-preview"><span><b>' + esc(C.fiscalLabel(s.month)) + '</b>financial year</span>' +
        '<span><b>Q' + C.mquarter(s.month) + '</b>' + esc(C.mshort(q[0]) + ' – ' + C.mshort(q[q.length - 1])) + '</span>' +
        '<span><b>' + y.length + ' months</b>year to date</span>' +
        '<span><b>' + esc(C.mshort(fy[0]) + ' – ' + C.mshort(fy[fy.length - 1])) + '</b>full year</span></div>')));
    f.appendChild(U.panel('Financial year', null, cal, true));

    /* --- margin bands, with live counts --- */
    f.appendChild(H.section('Margin bands'));
    var bandBox = el('<div class="set-list"></div>');
    var counts = el('<div class="set-preview"></div>');
    function drawCounts() {
      var rows = C.aggregateBy([s.month], 'project');
      var b = { healthy: 0, watch: 0, critical: 0, loss: 0 };
      rows.forEach(function (r) { b[U.band(r.margin).key]++; });
      counts.innerHTML =
        '<span><b class="pill good">' + b.healthy + '</b>healthy</span>' +
        '<span><b class="pill watch">' + b.watch + '</b>watch</span>' +
        '<span><b class="pill crit">' + b.critical + '</b>critical</span>' +
        '<span><b class="pill loss">' + b.loss + '</b>loss making</span>';
    }
    function slider(key, label, hint, min, max) {
      var wrap = el('<div class="set-slider"><input type="range" min="' + min + '" max="' + max + '" step="1" value="' + S[key] + '">' +
        '<output>' + S[key] + '%</output></div>');
      var inp = wrap.querySelector('input'), out = wrap.querySelector('output');
      inp.addEventListener('input', function () {
        out.textContent = inp.value + '%';
        state[key] = +inp.value;
        U.BANDS.healthy = state.bandHealthy / 100; U.BANDS.watch = state.bandWatch / 100;
        drawCounts();
      });
      inp.addEventListener('change', function () { change(key, +inp.value); });
      return row(label, hint, wrap);
    }
    bandBox.appendChild(slider('bandHealthy', 'Healthy at or above', 'Anything between the two thresholds is Watch.', 5, 80));
    bandBox.appendChild(slider('bandWatch', 'Critical below', 'A negative margin is always Loss making.', 0, 60));
    bandBox.appendChild(row('Projects in each band', 'Recounts as you drag, for ' + esc(C.mlabel(s.month)) + '.', counts));
    drawCounts();
    if (S.bandWatch >= S.bandHealthy) {
      bandBox.appendChild(el('<div class="callout" style="border-left-color:var(--err)">The critical threshold sits at or above the healthy one, so nothing can land in Watch. Lower it to open the middle band.</div>'));
    }
    f.appendChild(U.panel('Thresholds', 'Used by the dashboard, project analytics and the management report', bandBox, true));

    /* --- allocation + defaults --- */
    f.appendChild(H.section('Allocation and defaults'));
    var g = el('<div class="grid-2"></div>');
    var al = el('<div class="set-list"></div>');
    al.appendChild(row('Percentage step', 'How much the − and + buttons move an allocation.',
      seg(String(S.allocStep), [{ v: '1', l: '1%' }, { v: '5', l: '5%' }, { v: '10', l: '10%' }],
        function (v) { change('allocStep', +v); })));
    g.appendChild(U.panel('Allocation', null, al, true));
    var df = el('<div class="set-list"></div>');
    df.appendChild(row('Opening screen', 'Where the product starts.',
      select(S.landing, [{ v: 'dashboard', l: 'Dashboard' }, { v: 'allocations', l: 'Allocation' },
      { v: 'projects', l: 'Projects' }, { v: 'report-management', l: 'Management report' }],
        function (v) { change('landing', v); })));
    df.appendChild(row('Default period', 'Applied on screens that accept a period.',
      select(S.defaultPeriod, [{ v: 'month', l: 'This month' }, { v: 'quarter', l: 'Quarter' },
      { v: 'ytd', l: 'Year to date' }, { v: 'trailing12', l: 'Last 12 months' }],
        function (v) { change('defaultPeriod', v); })));
    g.appendChild(U.panel('Defaults', null, df, true));
    f.appendChild(g);

    /* --- data --- */
    f.appendChild(H.section('Data'));
    var data = el('<div class="set-list"></div>');
    data.appendChild(row('Saved in this browser', 'Every change is saved automatically. To clear everything and enter your own records, or to bring the demo back, go to Administration → Backup & restore.', H.btn('Open administration', '', function () { root.App.go('admin', { tab: 'backup' }); })));
    data.appendChild(row('Scope', 'What this prototype holds.',
      el('<div class="set-preview"><span><b>' + C.MONTHS.length + '</b>months</span>' +
        '<span><b>' + C.CLIENTS.length + '</b>clients</span>' +
        '<span><b>' + C.PROJECTS.length + '</b>projects</span>' +
        '<span><b>' + C.EMPLOYEES.length + '</b>employees</span></div>')));
    f.appendChild(U.panel('Prototype data', null, data, true));

    var about = el('<div style="font-size:13px;color:var(--text-2);display:flex;flex-direction:column;gap:11px">' +
      '<p style="margin:0"><strong style="color:var(--text)">Month is the unit of record.</strong> Revenue, employee cost, allocation and other cost are stored per month. Quarters, year to date and full year are sums of those months — there is no separate annual store to drift out of line.</p>' +
      '<p style="margin:0"><strong style="color:var(--text)">History does not move.</strong> Editing an allocation writes to the selected month only. Change October and September keeps the numbers it closed with.</p>' +
      '<p style="margin:0"><strong style="color:var(--text)">Rollup chain.</strong> Annual CTC → monthly cost → monthly allocation → project employee cost → + other project cost → project total cost → project profit and margin → client → company.</p>' +
      '<p style="margin:0"><strong style="color:var(--text)">Project margin vs company margin.</strong> A project only carries the cost booked to it. Bench time, internal work and company-level cost sit above the project line, which is why the company margin is the lower of the two. The dashboard shows the bridge between them.</p>' +
      '<p style="margin:0">Built for <strong style="color:var(--text)">Code to Click</strong> — AI-first Salesforce consulting. Names and figures are generated sample data shaped around the firm’s real service lines and sectors.</p>' +
      '</div>');
    f.appendChild(U.panel('How the numbers work', 'Worth reading once', about));
    return f;
  };

  /* apply saved choices, then repaint with them in force */
  apply();
  if (root.App) {
    var st = root.App.state;
    if (st.route === 'dashboard' && state.landing !== 'dashboard') st.route = state.landing;
    if (state.defaultPeriod !== 'month') st.period = state.defaultPeriod;
    root.App.render();
  }
})(typeof window !== 'undefined' ? window : globalThis);
