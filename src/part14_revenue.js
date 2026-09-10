/* ============================================================================
   Revenue — one sheet for reading and writing.

   Projects down the side, months across the top, every cell editable in
   place. The grid is the record: what you see is what the month snapshots
   hold, plus any edits you have typed but not yet saved. Edits are kept in
   `pending` (month|project -> amount) so they survive filtering, searching
   and moving the reporting month; nothing touches a snapshot until Save.
   Only changed cells are written, one setRevenue per cell, so a month you
   did not touch is never restated.
   ========================================================================== */
(function (root) {
  'use strict';
  var C = root.CTC, U = root.UI, V = root.VIEWS, H = root.VIEWHELP;
  var money = U.money, moneyK = U.moneyK, esc = U.esc, el = U.el, icon = U.icon;
  var head = H.head, btn = H.btn, frag = H.frag, clientOf = H.clientOf;

  var pending = {};          // 'month|projectId' -> rounded amount, until saved or discarded
  var shut = {};             // clientId -> true when that client's rows are folded away
  var q = '';                // search text, kept while the grid redraws

  function key(m, pid) { return m + '|' + pid; }
  function num(v) { v = String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''); return v === '' ? NaN : +v; }
  function booked(m, pid) { return C.snapshot(m).revenue[pid] || 0; }
  function shown(m, pid) { var k = key(m, pid); return k in pending ? pending[k] : booked(m, pid); }
  function pendingMonths() { var o = {}; Object.keys(pending).forEach(function (k) { o[k.split('|')[0]] = 1; }); return Object.keys(o); }

  /* Which months run across the top: the reporting period when it spans more
     than one month, otherwise the six months up to the selected month. */
  function columns(s) {
    var p = H.periodBlock(s);
    if (p.months.length > 1) return { months: p.months, note: p.label };
    var out = [];
    for (var k = 5; k >= 0; k--) { var m = C.maddMonths(s.month, -k); if (C.MONTHS.indexOf(m) !== -1) out.push(m); }
    return { months: out, note: out.length + ' months to ' + C.mlabel(s.month) };
  }

  function visibleProjects(s, months) {
    var ql = q.trim().toLowerCase();
    return C.PROJECTS.filter(function (p) {
      if (p.billable === false) return false;            // cost centres never bill
      var cl = C.byId(C.CLIENTS, p.clientId) || {};
      if (s.filters.client && p.clientId !== s.filters.client) return false;
      if (s.filters.type && p.type !== s.filters.type) return false;
      if (ql && (p.name + ' ' + (cl.name || '') + ' ' + p.type).toLowerCase().indexOf(ql) === -1) return false;
      return months.some(function (m) { return C.isActiveProj(p, m); });
    }).sort(function (a, b) {
      var ca = (C.byId(C.CLIENTS, a.clientId) || {}).name || '', cb = (C.byId(C.CLIENTS, b.clientId) || {}).name || '';
      return ca.localeCompare(cb) || a.name.localeCompare(b.name);
    });
  }

  function spark(vals) { return U.sparkline(vals, 'var(--m-revenue)', 72, 22); }
  function chg(cur, prev) {
    if (!prev) return '<span class="muted">—</span>';
    var d = (cur - prev) / prev * 100;
    return '<span class="' + (d > 0.05 ? 'ok' : d < -0.05 ? 'bad' : 'muted') + '">' + (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d).toFixed(1) + '%</span>';
  }

  V.revenue = function (s) {
    var f = frag(), m0 = s.month, cols = columns(s), months = cols.months;
    var r0 = C.rollup(m0), prevM = C.maddMonths(m0, -1), rPrev = C.MONTHS.indexOf(prevM) !== -1 ? C.rollup(prevM) : null;

    /* ---- head + KPIs (booked figures) --------------------------------------- */
    var exp = root.EXP ? root.EXP.menu(function () { return spec(); }, 'Export') : null;
    if (exp) exp.classList.add('rg-export');
    f.appendChild(head('Revenue', 'Projects down, months across — type straight into the sheet. Showing ' + esc(cols.note) + '.',
      [exp, btn('Month sheet', 'btn-ghost', function () { root.App.dialogs.revenueSheet(m0); }, 'report'),
       btn('Add revenue', 'btn-primary', function () { root.App.dialogs.revenue({ month: m0 }); }, 'plus')].filter(Boolean)));

    var billing = Object.keys(r0.byProject).filter(function (k) { return r0.byProject[k].revenue > 0; }).length;
    var byClient = Object.keys(r0.byClient).map(function (k) { return r0.byClient[k]; }).sort(function (a, b) { return b.revenue - a.revenue; });
    var top = byClient[0];
    var colTotal = months.reduce(function (t, m) { return t + C.rollup(m).company.revenue; }, 0);
    var kp = '<div class="kpis">';
    kp += U.kpi('Revenue · ' + esc(C.mshort(m0)), money(r0.company.revenue), U.deltaChip(r0.company.revenue, rPrev ? rPrev.company.revenue : null) + ' <span>vs ' + esc(rPrev ? C.mshort(prevM) : '—') + '</span>', true);
    kp += U.kpi(months.length + ' months shown', money(colTotal), '<span>' + money(colTotal / months.length) + ' a month on average</span>');
    kp += U.kpi('Projects billing', String(billing), '<span>of ' + Object.keys(r0.byProject).length + ' active in ' + esc(C.mshort(m0)) + '</span>');
    kp += U.kpi('Largest client', top ? esc(top.name) : '—', top ? '<span>' + U.pct(top.revenue / (r0.company.revenue || 1)) + ' of ' + esc(C.mshort(m0)) + ' · ' + money(top.revenue) + '</span>' : '');
    kp += '</div>';
    f.appendChild(el(kp));

    /* ---- filters: client, type, search, fold ------------------------------- */
    var bar = H.filterBar(s, ['client', 'type'], function () { root.App.render(); });
    var search = el('<label class="search rg-search"><span class="ic">' + icon('search') + '</span><input type="search" placeholder="Find a project or client" aria-label="Find a project or client"></label>');
    var si = search.querySelector('input'); si.value = q;
    si.addEventListener('input', function () { q = si.value; drawGrid(); });
    bar.insertBefore(search, bar.firstChild);
    var fold = btn('Fold clients', 'btn-sm', function () {
      var allShut = C.CLIENTS.every(function (c) { return shut[c.id]; });
      C.CLIENTS.forEach(function (c) { shut[c.id] = !allShut; });
      drawGrid();
    });
    bar.appendChild(fold);
    f.appendChild(bar);

    /* ---- the sheet --------------------------------------------------------- */
    var panel = U.panel('Revenue sheet', cols.note + ' · click a month to make it the reporting month · unsaved cells are highlighted', null, true);
    var host = panel.querySelector('.panel-body');
    var saveBar = el('<div class="rg-save" hidden><span class="rg-save-txt"></span><span class="rg-save-acts"></span></div>');
    var discard = btn('Discard', 'btn-ghost btn-sm', function () { pending = {}; root.App.render(); U.toast('Changes discarded', { detail: 'The sheet is back to what is booked.' }); });
    var save = btn('Save changes', 'btn-primary btn-sm', function () {
      var keys = Object.keys(pending), ms = pendingMonths();
      keys.forEach(function (k) { var kv = k.split('|'); C.setRevenue(kv[0], kv[1], pending[k]); });
      pending = {};
      U.toast('Revenue saved', { kind: 'success', detail: keys.length + ' cell' + (keys.length === 1 ? '' : 's') + ' written across ' + ms.length + ' month' + (ms.length === 1 ? '' : 's') + '. Every other month is untouched.' });
      root.App.render();
    });
    saveBar.querySelector('.rg-save-acts').appendChild(discard);
    saveBar.querySelector('.rg-save-acts').appendChild(save);
    f.appendChild(panel);
    f.appendChild(saveBar);

    var wrap, rows = [], inputs = {};       // inputs[pid][m] -> input element

    function spec() {
      var cs = [{ label: 'Client' }, { label: 'Project' }, { label: 'Type' }].concat(months.map(function (m) { return { label: C.mshort(m), num: true }; }), [{ label: 'Total', num: true }]);
      var rs = rows.map(function (p) {
        var vals = months.map(function (m) { return C.isActiveProj(p, m) ? shown(m, p.id) : ''; });
        var t = vals.reduce(function (a, v) { return a + (v || 0); }, 0);
        return [(C.byId(C.CLIENTS, p.clientId) || {}).name || '', p.name, p.type].concat(vals.map(function (v) { return v === '' ? '' : money(v); }), [money(t)]);
      });
      return { name: 'Revenue sheet ' + cols.note, title: 'Revenue sheet', subtitle: 'Code to Click · ' + cols.note, cols: cs, rows: rs };
    }

    function drawGrid() {
      rows = visibleProjects(s, months); inputs = {};
      host.innerHTML = '';
      if (!rows.length) {
        host.appendChild(U.emptyState('No projects match', 'Clear the filters or search for something else.', '', 'search'));
        updateSaveBar(); return;
      }
      var h = '<div class="rg-wrap"><table class="rg"><thead><tr><th class="rg-side">Client / project</th>';
      months.forEach(function (m) {
        h += '<th class="rg-m' + (m === m0 ? ' cur' : '') + '" data-m="' + m + '" title="Make ' + esc(C.mlabel(m)) + ' the reporting month"><span>' + esc(C.mabbr(m)) + '</span><small>' + m.slice(2, 4) + '</small></th>';
      });
      h += '<th class="rg-tot">Total</th><th class="rg-trend">Trend</th></tr></thead><tbody>';
      var lastClient = null;
      rows.forEach(function (p) {
        if (p.clientId !== lastClient) {
          lastClient = p.clientId;
          var cl = C.byId(C.CLIENTS, p.clientId) || {}, n = rows.filter(function (x) { return x.clientId === p.clientId; }).length;
          h += '<tr class="rg-client' + (shut[p.clientId] ? ' shut' : '') + '" data-c="' + p.clientId + '"><th class="rg-side"><button type="button" class="rg-tog" aria-label="Fold or unfold ' + esc(cl.name || '') + '">' + icon('chevron') + '</button>' +
            '<span class="rg-cname">' + esc(cl.name || '') + '</span><span class="rg-n">' + n + ' project' + (n === 1 ? '' : 's') + '</span></th>';
          months.forEach(function (m) { h += '<td class="rg-sub' + (m === m0 ? ' cur' : '') + '" data-m="' + m + '"></td>'; });
          h += '<td class="rg-tot rg-sub"></td><td class="rg-trend"></td></tr>';
        }
        h += '<tr class="rg-proj" data-p="' + p.id + '" data-c="' + p.clientId + '"' + (shut[p.clientId] ? ' hidden' : '') + '><th class="rg-side"><a class="rg-name" href="#" data-go="' + p.id + '">' + esc(p.name) + '</a><span class="rg-type">' + esc(p.type) + '</span></th>';
        months.forEach(function (m) {
          if (!C.isActiveProj(p, m)) { h += '<td class="rg-cell off' + (m === m0 ? ' cur' : '') + '"><span title="Not running in ' + esc(C.mshort(m)) + '">·</span></td>'; return; }
          var v = shown(m, p.id), dirty = key(m, p.id) in pending;
          h += '<td class="rg-cell' + (m === m0 ? ' cur' : '') + '"><input class="rg-in' + (dirty ? ' dirty' : '') + '" type="text" inputmode="decimal" data-m="' + m + '" data-p="' + p.id + '" value="' + v.toLocaleString() + '" aria-label="' + esc(p.name + ' ' + C.mlabel(m)) + '"></td>';
        });
        h += '<td class="rg-tot"></td><td class="rg-trend"></td></tr>';
      });
      h += '</tbody><tfoot><tr class="rg-total"><th class="rg-side">Total · ' + rows.length + ' project' + (rows.length === 1 ? '' : 's') + '</th>';
      months.forEach(function (m) { h += '<td class="rg-ft' + (m === m0 ? ' cur' : '') + '" data-m="' + m + '"></td>'; });
      h += '<td class="rg-tot"></td><td class="rg-trend"></td></tr><tr class="rg-mom"><th class="rg-side">Month on month</th>';
      months.forEach(function (m) { h += '<td class="rg-fm' + (m === m0 ? ' cur' : '') + '" data-m="' + m + '"></td>'; });
      h += '<td></td><td></td></tr></tfoot></table></div>';
      host.innerHTML = h;
      wrap = host.querySelector('.rg-wrap');

      wrap.querySelectorAll('.rg-in').forEach(function (inp) {
        var pid = inp.getAttribute('data-p'), m = inp.getAttribute('data-m');
        (inputs[pid] = inputs[pid] || {})[m] = inp;
        inp.addEventListener('focus', function () { var v = num(inp.value); inp.value = isNaN(v) ? '' : String(v); inp.select(); inp.closest('tr').classList.add('on'); });
        inp.addEventListener('blur', function () { var v = num(inp.value); if (!isNaN(v)) inp.value = Math.round(v).toLocaleString(); inp.closest('tr').classList.remove('on'); });
        inp.addEventListener('input', function () { mark(inp); recalc(); });
        inp.addEventListener('keydown', function (e) { nav(e, inp); });
        inp.addEventListener('paste', function (e) { paste(e, inp); });
      });
      wrap.querySelectorAll('th.rg-m').forEach(function (th) { th.addEventListener('click', function () { root.App.setMonth(th.getAttribute('data-m')); }); });
      wrap.querySelectorAll('.rg-tog').forEach(function (b) {
        b.addEventListener('click', function () {
          var tr = b.closest('tr'), cid = tr.getAttribute('data-c');
          shut[cid] = !shut[cid]; tr.classList.toggle('shut', !!shut[cid]);
          wrap.querySelectorAll('tr.rg-proj[data-c="' + cid + '"]').forEach(function (x) { x.hidden = !!shut[cid]; });
        });
      });
      wrap.querySelectorAll('a.rg-name').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); root.App.go('project', { id: a.getAttribute('data-go') }); }); });
      recalc();
    }

    function mark(inp) {
      var pid = inp.getAttribute('data-p'), m = inp.getAttribute('data-m'), v = num(inp.value), k = key(m, pid);
      var bad = isNaN(v) || v < 0;
      inp.classList.toggle('bad', bad);
      if (bad) return;
      if (Math.round(v) !== booked(m, pid)) pending[k] = Math.round(v); else delete pending[k];
      inp.classList.toggle('dirty', k in pending);
    }

    function cellValue(pid, m) {
      var inp = inputs[pid] && inputs[pid][m];
      if (!inp) return 0;
      var v = num(inp.value); return isNaN(v) || v < 0 ? 0 : v;
    }

    function recalc() {
      var monthTot = {}, clientTot = {};
      months.forEach(function (m) { monthTot[m] = 0; });
      rows.forEach(function (p) {
        var vals = months.map(function (m) { return cellValue(p.id, m); });
        var t = vals.reduce(function (a, b) { return a + b; }, 0);
        var tr = wrap.querySelector('tr.rg-proj[data-p="' + p.id + '"]');
        tr.querySelector('.rg-tot').textContent = money(t);
        tr.querySelector('.rg-trend').innerHTML = spark(vals);
        clientTot[p.clientId] = clientTot[p.clientId] || {};
        months.forEach(function (m, i) { monthTot[m] += vals[i]; clientTot[p.clientId][m] = (clientTot[p.clientId][m] || 0) + vals[i]; });
      });
      wrap.querySelectorAll('tr.rg-client').forEach(function (tr) {
        var cid = tr.getAttribute('data-c'), ct = clientTot[cid] || {}, vals = months.map(function (m) { return ct[m] || 0; });
        tr.querySelectorAll('td.rg-sub[data-m]').forEach(function (td) { var v = ct[td.getAttribute('data-m')] || 0; td.textContent = v ? money(v) : '—'; });
        tr.querySelector('.rg-tot').textContent = money(vals.reduce(function (a, b) { return a + b; }, 0));
        tr.querySelector('.rg-trend').innerHTML = spark(vals);
      });
      var grand = 0;
      months.forEach(function (m, i) {
        grand += monthTot[m];
        wrap.querySelector('td.rg-ft[data-m="' + m + '"]').textContent = money(monthTot[m]);
        var prev = i ? monthTot[months[i - 1]] : (C.MONTHS.indexOf(C.maddMonths(m, -1)) !== -1 ? C.rollup(C.maddMonths(m, -1)).company.revenue : 0);
        wrap.querySelector('td.rg-fm[data-m="' + m + '"]').innerHTML = chg(monthTot[m], prev);
      });
      var ft = wrap.querySelector('tr.rg-total');
      ft.querySelector('.rg-tot').textContent = money(grand);
      ft.querySelector('.rg-trend').innerHTML = spark(months.map(function (m) { return monthTot[m]; }));
      updateSaveBar();
    }

    function updateSaveBar() {
      var n = Object.keys(pending).length, ms = pendingMonths();
      saveBar.hidden = !n;
      if (n) saveBar.querySelector('.rg-save-txt').innerHTML = '<strong>' + n + ' unsaved cell' + (n === 1 ? '' : 's') + '</strong> in ' +
        ms.map(function (m) { return C.mshort(m); }).join(', ') + ' · nothing is booked until you save';
    }

    function nav(e, inp) {
      var pid = inp.getAttribute('data-p'), m = inp.getAttribute('data-m');
      var order = rows.filter(function (p) { return !shut[p.clientId]; }).map(function (p) { return p.id; });
      var ri = order.indexOf(pid), ci = months.indexOf(m), target = null;
      function at(r, c) { var id = order[r], mm = months[c]; return id && mm && inputs[id] && inputs[id][mm]; }
      if (e.key === 'Enter' || e.key === 'ArrowDown') { for (var r = ri + 1; r < order.length && !target; r++) target = at(r, ci); }
      else if (e.key === 'ArrowUp') { for (var r2 = ri - 1; r2 >= 0 && !target; r2--) target = at(r2, ci); }
      else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length) { for (var c = ci + 1; c < months.length && !target; c++) target = at(ri, c); }
      else if (e.key === 'ArrowLeft' && inp.selectionStart === 0) { for (var c2 = ci - 1; c2 >= 0 && !target; c2--) target = at(ri, c2); }
      else if (e.key === 'Escape') { inp.value = String(shown(m, pid)); mark(inp); recalc(); inp.blur(); return; }
      if (target) { e.preventDefault(); e.stopPropagation(); target.focus(); }
    }

    /* A block copied from a spreadsheet lands with its top-left on this cell:
       rows go down, tab-separated columns go across. Cells a project is not
       running in are skipped, not filled. */
    function paste(e, inp) {
      var txt = (e.clipboardData || window.clipboardData).getData('text') || '';
      var lines = txt.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; });
      if (lines.length < 2 && lines[0] && lines[0].indexOf('\t') === -1) return;
      e.preventDefault();
      var order = rows.filter(function (p) { return !shut[p.clientId]; }).map(function (p) { return p.id; });
      var ri = order.indexOf(inp.getAttribute('data-p')), ci = months.indexOf(inp.getAttribute('data-m')), n = 0;
      lines.forEach(function (line, dr) {
        line.split('\t').forEach(function (cell, dc) {
          var id = order[ri + dr], mm = months[ci + dc], t = id && mm && inputs[id] && inputs[id][mm];
          var v = num(cell); if (!t || isNaN(v)) return;
          t.value = Math.round(v).toLocaleString(); mark(t); n++;
        });
      });
      recalc();
      U.toast('Pasted ' + n + ' value' + (n === 1 ? '' : 's'), { detail: 'Check the highlighted cells, then save.' });
    }

    drawGrid();

    /* ---- who the money comes from, across the shown months ------------------ */
    var perClient = {};
    months.forEach(function (m) {
      var r = C.rollup(m);
      Object.keys(r.byClient).forEach(function (k) { perClient[k] = perClient[k] || { name: r.byClient[k].name, total: 0, vals: {} }; perClient[k].total += r.byClient[k].revenue; perClient[k].vals[m] = r.byClient[k].revenue; });
    });
    var ranked = Object.keys(perClient).map(function (k) { return perClient[k]; }).sort(function (a, b) { return b.total - a.total; });
    var topN = ranked.slice(0, 5), rest = ranked.slice(5);
    var palette = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--text-3)'];
    var series = topN.map(function (c, i) { return { label: c.name, color: palette[i], values: months.map(function (m) { return c.vals[m] || 0; }) }; });
    if (rest.length) series.push({ label: rest.length + ' other client' + (rest.length === 1 ? '' : 's'), color: palette[5], values: months.map(function (m) { return rest.reduce(function (t, c) { return t + (c.vals[m] || 0); }, 0); }) });
    var chart = U.stackedColumnChart({ months: months, series: series, height: 220, totalLabel: 'Revenue', onClickMonth: function (m) { root.App.setMonth(m); } });
    var cp = U.panel('Revenue by client', cols.note + ' · booked figures, largest clients first', chart);
    cp.appendChild(el('<div class="pv-legend" style="padding-top:0">' + series.map(function (sr) { return '<span><i style="background:' + sr.color + '"></i>' + esc(sr.label) + '</span>'; }).join('') + '</div>'));
    cp.style.marginTop = '16px';
    f.appendChild(cp);
    return f;
  };
})(typeof window !== 'undefined' ? window : globalThis);
