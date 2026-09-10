/* ============================================================================
   Allocation workbench.

   The job this screen does: put every person's month on one page, make a
   change take one gesture, make an invalid allocation impossible to enter
   rather than merely rejected afterwards, and show the whole picture of the
   person or project being edited -- what they cost, where the cost lands,
   what it earns, and how that has moved over the year.

   Layout is master-detail. The list on the left is for finding and scanning;
   the panel on the right is the 360: identity, capacity, the editor, impact
   on each project, utilisation history. Every edit writes to the selected
   month only, and every edit is undoable.
   ========================================================================== */
(function (root) {
  'use strict';
  var C = root.CTC, U = root.UI, V = root.VIEWS, H = root.VIEWHELP;
  var money = U.money, moneyK = U.moneyK, pct = U.pct, esc = U.esc, el = U.el, icon = U.icon;

  function step() { return (root.SET && root.SET.get().allocStep) || 5; }
  var undoStack = [];      // [{month, alloc, label}]

  /* ---------- state ------------------------------------------------------- */
  function st(s) {
    if (!s.alloc) s.alloc = { view: 'employee', q: '', dept: '', status: '', project: '', sel: null, team: null };
    return s.alloc;
  }
  function refresh() {
    var y = window.scrollY;
    root.App.render();
    window.scrollTo(0, y);
  }
  function pushUndo(month, label) {
    undoStack.push({ month: month, alloc: C.getAllocations(month), label: label });
    if (undoStack.length > 40) undoStack.shift();
  }
  function undo() {
    var last = undoStack.pop();
    if (!last) return;
    C.setAllocations(last.month, last.alloc);
    U.toast('Reverted: ' + last.label, { kind: 'info' });
    refresh();
  }

  /* ---------- allocation maths -------------------------------------------- */
  function mapOf(month, empId) {
    var a = C.snapshot(month).alloc[empId] || {}, out = {};
    Object.keys(a).forEach(function (k) { out[k] = a[k]; });
    return out;
  }
  function totalOf(map) {
    return Object.keys(map).reduce(function (t, k) { return t + (map[k] || 0); }, 0);
  }
  function write(month, empId, map, label) {
    pushUndo(month, label);
    C.setAllocation(month, empId, map);
  }

  /* ---------- colour for a line ---------------------------------------------
     A stable hue per project so the same project reads the same colour in the
     capacity bar, the donut, the editor and the matrix. Internal is slate. */
  var HUES = ['var(--s1)', 'var(--s3)', 'var(--s4)', 'var(--s2)', 'var(--s5)'];
  function hueOf(key) {
    if (key === 'INTERNAL' || key == null) return 'var(--text-3)';
    var h = 0; String(key).split('').forEach(function (ch) { h = (h * 31 + ch.charCodeAt(0)) >>> 0; });
    return HUES[h % HUES.length];
  }
  function initials(name) {
    return name.split(' ').filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join('');
  }

  /* ---------- small parts -------------------------------------------------- */
  function capacityBar(emp, tall) {
    var w = el('<span class="capbar' + (tall ? ' tall' : '') + '" role="img" aria-label="' +
      emp.allocatedPct + '% allocated"></span>');
    emp.lines.forEach(function (l) {
      var seg = el('<span class="sg" style="flex:' + l.pct + ';background:' + hueOf(l.projectId || 'INTERNAL') + '"></span>');
      seg.setAttribute('data-tip', (l.projectId ? H.projName(l.projectId) : 'Internal') + ' · ' + l.pct + '% · ' + money(l.amount));
      w.appendChild(seg);
    });
    if (emp.allocatedPct < 100) {
      var b = el('<span class="free" style="flex:' + (100 - emp.allocatedPct) + '"></span>');
      b.setAttribute('data-tip', 'Unallocated · ' + (100 - emp.allocatedPct) + '% · ' + money(emp.unallocated));
      w.appendChild(b);
    }
    return w;
  }

  function statusPill(emp) {
    if (emp.allocatedPct > 100) return '<span class="pill crit">Over by ' + (emp.allocatedPct - 100) + '%</span>';
    if (emp.allocatedPct === 100) return '<span class="pill good">Fully allocated</span>';
    if (emp.allocatedPct === 0) return '<span class="pill crit">Not allocated</span>';
    return '<span class="pill watch">' + (100 - emp.allocatedPct) + '% free</span>';
  }

  /* the donut: one arc per line, the gap is the bench */
  function donut(emp) {
    var R = 34, Cx = 42, Cy = 42, circ = 2 * Math.PI * R, sw = 9;
    var h = '<svg class="donut" viewBox="0 0 84 84" aria-hidden="true">' +
      '<circle cx="' + Cx + '" cy="' + Cy + '" r="' + R + '" fill="none" stroke="var(--layer-2)" stroke-width="' + sw + '"/>';
    var acc = 0;
    emp.lines.forEach(function (l) {
      var len = circ * Math.min(l.pct, 100 - acc) / 100;
      if (len <= 0) return;
      h += '<circle cx="' + Cx + '" cy="' + Cy + '" r="' + R + '" fill="none" stroke="' + hueOf(l.projectId || 'INTERNAL') +
        '" stroke-width="' + sw + '" stroke-dasharray="' + len.toFixed(2) + ' ' + (circ - len).toFixed(2) +
        '" stroke-dashoffset="' + (-(circ * acc / 100)).toFixed(2) + '" transform="rotate(-90 ' + Cx + ' ' + Cy + ')"/>';
      acc += l.pct;
    });
    h += '<text x="' + Cx + '" y="' + (Cy + 1) + '" text-anchor="middle" dominant-baseline="middle" ' +
      'font-size="17" font-weight="700" fill="var(--text)" letter-spacing="-0.03em">' + emp.allocatedPct + '%</text></svg>';
    return h;
  }

  /* slider + number: drag for speed, type for precision, both clamped to the
     capacity left so the row can never exceed 100% */
  function control(value, max, colour, onChange) {
    var w = el('<div class="alloc-ctl">' +
      '<input type="range" min="0" max="100" step="' + step() + '" value="' + value + '" aria-label="Allocation percent" ' +
      'style="--fill:' + Math.max(0, Math.min(100, value)) + '%;--cap:' + Math.max(0, Math.min(100, max)) + '%;--accent:' + colour + '">' +
      '<div class="num-ctl"><input type="number" min="0" max="' + max + '" step="' + step() + '" value="' + value + '" aria-label="Allocation percent"><span>%</span></div>' +
      '</div>');
    var rng = w.children[0], num = w.querySelector('input[type=number]');
    function commit(v) {
      v = Math.round(+v || 0);
      if (v > max) { U.toast('Capped at ' + max + '% — that is all the capacity left this month.', { kind: 'warn' }); v = max; }
      onChange(Math.max(0, v));
    }
    rng.addEventListener('input', function () {
      var v = Math.min(max, +rng.value);
      rng.value = v; num.value = v;
      rng.style.setProperty('--fill', v + '%');
    });
    rng.addEventListener('change', function () { commit(rng.value); });
    num.addEventListener('change', function () { commit(num.value); });
    num.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp') { e.preventDefault(); commit(Math.min(max, value + step())); }
      if (e.key === 'ArrowDown') { e.preventDefault(); commit(Math.max(0, value - step())); }
      if (e.key === 'Enter') { e.preventDefault(); num.blur(); }
    });
    return w;
  }

  /* ---------- the person 360 ----------------------------------------------- */
  function person360(s, month, emp) {
    var a = st(s), r = C.rollup(month);
    var map = mapOf(month, emp.id), total = totalOf(map), free = 100 - total;
    var meta = C.byId(C.EMPLOYEES, emp.id) || {};
    var panel = el('<section class="p360" aria-label="' + esc(emp.name) + '"></section>');

    function set(key, val, label) {
      var m = mapOf(month, emp.id);
      if (val <= 0) delete m[key]; else m[key] = val;
      write(month, emp.id, m, label);
      refresh();
    }

    /* --- identity --------------------------------------------------------- */
    var head = el('<header class="p360-head">' +
      '<span class="avatar-lg" style="--hue:' + hueOf(emp.dept) + '">' + esc(initials(emp.name)) + '</span>' +
      '<div class="p360-id"><h3>' + esc(emp.name) + '</h3>' +
      '<div class="p360-sub">' + esc(emp.title) + ' &middot; ' + esc(emp.dept) + '</div></div>' +
      '<button class="icon-btn p360-x" type="button" aria-label="Close" data-tip="Close">' + icon('x') + '</button>' +
      '</header>');
    head.querySelector('.p360-x').addEventListener('click', function () { a.sel = null; refresh(); });
    panel.appendChild(head);

    var facts = el('<div class="p360-facts">' +
      '<div><span class="f-l">Monthly cost</span><span class="f-v num">' + money(emp.monthlyCost) + '</span></div>' +
      '<div><span class="f-l">Software</span><span class="f-v num"' + (emp.tools && emp.tools.length ? ' data-tip="' + esc(emp.tools.map(function (t) { return t.name + ' ' + money(t.amount); }).join(' · ')) + '"' : '') + '>' + money(emp.toolCost || 0) + '</span></div>' +
      '<div><span class="f-l">Joined</span><span class="f-v">' + esc(meta.join ? C.mshort(meta.join) : '—') + '</span></div>' +
      '<div><span class="f-l">Status</span><span class="f-v">' + statusPill(emp) + '</span></div>' +
      '</div>');
    panel.appendChild(facts);

    /* --- capacity --------------------------------------------------------- */
    var cap = el('<div class="p360-cap">' + donut(emp) +
      '<div class="cap-stats">' +
      '<div><span class="f-l">Charged to projects</span><span class="f-v num">' + money(emp.projectCost) + '</span></div>' +
      '<div><span class="f-l">Internal</span><span class="f-v num">' + money(emp.internal) + '</span></div>' +
      '<div><span class="f-l">On the bench</span><span class="f-v num' + (emp.unallocated > 0.5 ? ' warn' : '') + '">' + money(Math.max(0, emp.unallocated)) + '</span></div>' +
      '</div></div>');
    panel.appendChild(cap);

    /* --- editor ----------------------------------------------------------- */
    var ed = el('<div class="p360-block"><div class="blk-head"><h4>Allocation for ' + esc(C.mlabel(month)) + '</h4>' +
      '<span class="blk-note">' + (free > 0 ? free + '% unallocated' : 'at capacity') + '</span></div></div>');
    var lines = el('<div class="alloc-lines"></div>');
    var keys = Object.keys(map).sort(function (x, y) {
      if (x === 'INTERNAL') return 1; if (y === 'INTERNAL') return -1;
      return (map[y] - map[x]) || H.projName(x).localeCompare(H.projName(y));
    });
    keys.forEach(function (key) {
      var isInt = key === 'INTERNAL', proj = isInt ? null : r.byProject[key];
      var cl = isInt ? null : H.clientOf(key);
      var max = 100 - (total - map[key]);
      var line = el('<div class="alloc-line">' +
        '<span class="sw" style="background:' + hueOf(key) + '"></span>' +
        '<span class="nm"><strong>' + (isInt ? 'Internal / non-billable' : esc(H.projName(key))) + '</strong>' +
        '<small>' + (isInt ? 'Stays out of project cost' : esc(cl ? cl.name : '')) +
        (proj ? ' &middot; ' + U.marginPill(proj.margin) : '') + '</small></span>' +
        '<span class="amt num">' + money(emp.monthlyCost * map[key] / 100) + '</span>' +
        '</div>');
      line.insertBefore(control(map[key], max, hueOf(key), function (v) {
        set(key, v, (isInt ? 'internal time' : H.projName(key)) + ' for ' + emp.name);
      }), line.querySelector('.amt'));
      var rm = el('<button class="row-act danger" type="button" data-tip="Remove this line" aria-label="Remove">' + icon('trash') + '</button>');
      rm.addEventListener('click', function () { set(key, 0, 'removing ' + (isInt ? 'internal' : H.projName(key)) + ' from ' + emp.name); });
      line.appendChild(rm);
      lines.appendChild(line);
    });
    if (!keys.length) lines.appendChild(el(U.emptyState('Nothing allocated yet',
      'The whole ' + money(emp.monthlyCost) + ' is on the bench this month. Add a project below to start charging it.', '', 'sliders')));
    ed.appendChild(lines);

    /* add a line */
    var addable = Object.keys(r.byProject).map(function (id) { return r.byProject[id]; })
      .filter(function (p) { return map[p.id] == null; })
      .sort(function (x, y) { return x.name.localeCompare(y.name); });
    var add = el('<div class="alloc-add">' +
      '<select aria-label="Add a project"><option value="">' + (free > 0 ? 'Add a project…' : 'No capacity left this month') + '</option>' +
      addable.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + ' — ' + esc((H.clientOf(p.id) || {}).name || '') + '</option>'; }).join('') +
      (map.INTERNAL == null ? '<option value="INTERNAL">Internal / non-billable</option>' : '') +
      '</select><span class="muted">' + (free > 0 ? 'starts at ' + Math.min(step() * 2, free) + '%, then adjust' : '') + '</span></div>');
    var sel = add.querySelector('select');
    sel.disabled = free <= 0;
    sel.addEventListener('change', function () {
      if (!sel.value) return;
      set(sel.value, Math.min(step() * 2, free), 'adding ' + (sel.value === 'INTERNAL' ? 'internal' : H.projName(sel.value)) + ' for ' + emp.name);
    });
    ed.appendChild(add);

    /* quick actions */
    var q = el('<div class="alloc-quick"></div>');
    function qbtn(label, tip, fn, disabled, ico) {
      var b = el('<button class="btn btn-sm" type="button" data-tip="' + esc(tip) + '">' + (ico ? icon(ico) : '') + '<span>' + esc(label) + '</span></button>');
      b.disabled = !!disabled; b.addEventListener('click', fn); q.appendChild(b); return b;
    }
    var biggest = keys.filter(function (k) { return k !== 'INTERNAL'; }).sort(function (x, y) { return map[y] - map[x]; })[0];
    qbtn('Fill to 100%', biggest ? 'Add the remaining ' + free + '% to ' + H.projName(biggest) : 'Add a project first',
      function () { set(biggest, map[biggest] + free, 'filling ' + emp.name + ' to 100%'); }, !biggest || free <= 0, 'trend');
    qbtn('Rest to internal', 'Book the free ' + free + '% as non-billable time',
      function () { set('INTERNAL', (map.INTERNAL || 0) + free, 'internal time for ' + emp.name); }, free <= 0);
    var prev = C.maddMonths(month, -1), prevMap = C.MONTHS.indexOf(prev) !== -1 ? mapOf(prev, emp.id) : {};
    qbtn('Copy ' + C.mshort(prev), 'Reuse ' + C.mlabel(prev) + ' for this person', function () {
      var clean = {};
      Object.keys(prevMap).forEach(function (k) { if (k === 'INTERNAL' || r.byProject[k]) clean[k] = prevMap[k]; });
      write(month, emp.id, clean, 'copying ' + C.mlabel(prev) + ' for ' + emp.name); refresh();
    }, !Object.keys(prevMap).length, 'compare');
    qbtn('Clear', 'Remove every allocation for this person this month',
      function () { write(month, emp.id, {}, 'clearing ' + emp.name); refresh(); }, !keys.length);
    ed.appendChild(q);
    panel.appendChild(ed);

    /* --- impact on each project ------------------------------------------ */
    var projLines = emp.lines.filter(function (l) { return l.projectId && r.byProject[l.projectId]; });
    if (projLines.length) {
      var im = el('<div class="p360-block"><div class="blk-head"><h4>Impact on projects</h4>' +
        '<span class="blk-note">this month</span></div></div>');
      var tbl = '<table class="grid mini"><thead><tr><th>Project</th><th class="n">Share of team cost</th><th class="n">Revenue</th><th class="n">Margin</th></tr></thead><tbody>';
      projLines.sort(function (x, y) { return y.amount - x.amount; }).forEach(function (l) {
        var p = r.byProject[l.projectId];
        var share = p.empCost ? l.amount / p.empCost : 0;
        tbl += '<tr><td><span class="dotsw" style="background:' + hueOf(l.projectId) + '"></span>' + esc(p.name) + '</td>' +
          '<td class="n">' + pct(share, 0) + ' <span class="muted">of ' + money(p.empCost) + '</span></td>' +
          '<td class="n">' + money(p.revenue) + '</td><td class="n">' + U.marginPill(p.margin) + '</td></tr>';
      });
      im.appendChild(el(tbl + '</tbody></table>'));
      panel.appendChild(im);
    }

    /* --- utilisation history ---------------------------------------------- */
    var months = H.trailing12(month).filter(function (m) { return C.isActiveEmp ? C.isActiveEmp(meta, m) : true; });
    var hist = months.map(function (m) {
      var e = C.rollup(m).byEmployee[emp.id];
      return { m: m, pct: e ? e.allocatedPct : 0, bench: e ? Math.max(0, e.unallocated) : 0, n: e ? e.lines.filter(function (l) { return l.projectId; }).length : 0 };
    });
    if (hist.length > 1) {
      var avg = hist.reduce(function (t, x) { return t + x.pct; }, 0) / hist.length;
      var tr = el('<div class="p360-block"><div class="blk-head"><h4>Utilisation</h4>' +
        '<span class="blk-note">avg ' + avg.toFixed(0) + '% over ' + hist.length + ' months</span></div></div>');
      tr.appendChild(el('<div class="util-spark">' + U.sparkline(hist.map(function (x) { return x.pct / 100; }), 'var(--m-revenue)', 300, 56,
        { labels: hist.map(function (x) { return C.mshort(x.m); }), name: 'Allocated', fmt: 'pct' }) + '</div>'));
      var ht = '<table class="grid mini"><thead><tr><th>Month</th><th class="n">Allocated</th><th class="n">Projects</th><th class="n">Bench</th></tr></thead><tbody>';
      hist.slice(-6).reverse().forEach(function (x) {
        ht += '<tr' + (x.m === month ? ' class="now"' : '') + '><td>' + esc(C.mshort(x.m)) + (x.m === month ? ' <span class="tag">now</span>' : '') + '</td>' +
          '<td class="n">' + x.pct + '%</td><td class="n">' + x.n + '</td>' +
          '<td class="n">' + (x.bench > 0.5 ? '<span class="warn-ink">' + money(x.bench) + '</span>' : '<span class="muted">—</span>') + '</td></tr>';
      });
      tr.appendChild(el(ht + '</tbody></table>'));
      panel.appendChild(tr);
    }

    panel.appendChild(el('<footer class="p360-foot">Every change here writes to <strong>' + esc(C.mlabel(month)) +
      '</strong> only. Earlier months keep the allocation they closed with.</footer>'));
    return panel;
  }

  /* ---------- the people list ---------------------------------------------- */
  function peopleList(s, month, rows) {
    var a = st(s);
    var wrap = el('<div class="wb-list"></div>');
    wrap.appendChild(el('<div class="wl-head"><span>Person</span><span class="r">Cost</span><span>Capacity</span><span class="r">Total</span><span class="r">Status</span></div>'));
    var list = el('<div class="wl-body" role="listbox" aria-label="People"></div>');
    if (!rows.length) list.appendChild(el(U.emptyState('No one matches', 'Clear a filter or widen the search.', '', 'users')));
    rows.forEach(function (emp) {
      var on = a.sel === emp.id;
      var row = el('<button class="wl-row' + (on ? ' on' : '') + '" type="button" role="option" aria-selected="' + on + '">' +
        '<span class="who"><span class="avatar-sm" style="--hue:' + hueOf(emp.dept) + '">' + esc(initials(emp.name)) + '</span>' +
        '<span class="who-t"><strong>' + esc(emp.name) + '</strong><span class="sub">' + esc(emp.title) + ' &middot; ' + esc(emp.dept) + '</span></span></span>' +
        '<span class="num r cost">' + money(emp.monthlyCost) + '</span>' +
        '</button>');
      var capCell = el('<span class="cap"></span>');
      capCell.appendChild(capacityBar(emp));
      row.appendChild(capCell);
      row.appendChild(el('<span class="num r tot"><b>' + emp.allocatedPct + '%</b></span>'));
      row.appendChild(el('<span class="r stat">' + statusPill(emp) + '</span>'));
      row.addEventListener('click', function () { a.sel = on ? null : emp.id; refresh(); });
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  /* ---------- the project 360 ---------------------------------------------- */
  function project360(s, month, p) {
    var a = st(s), r = C.rollup(month);
    var cl = H.clientOf(p.id) || {};
    var panel = el('<section class="p360" aria-label="' + esc(p.name) + '"></section>');
    var head = el('<header class="p360-head">' +
      '<span class="avatar-lg sq" style="--hue:' + hueOf(p.id) + '">' + icon('projects') + '</span>' +
      '<div class="p360-id"><h3>' + esc(p.name) + '</h3><div class="p360-sub">' + esc(cl.name || '') + ' &middot; ' + esc(p.type) + '</div></div>' +
      '<button class="icon-btn p360-x" type="button" aria-label="Close" data-tip="Close">' + icon('x') + '</button></header>');
    head.querySelector('.p360-x').addEventListener('click', function () { a.team = null; refresh(); });
    panel.appendChild(head);

    panel.appendChild(el('<div class="p360-facts">' +
      '<div><span class="f-l">Revenue</span><span class="f-v num">' + money(p.revenue) + '</span></div>' +
      '<div><span class="f-l">Team cost</span><span class="f-v num">' + money(p.empCost) + '</span></div>' +
      '<div><span class="f-l">Other cost</span><span class="f-v num">' + money(p.otherCost) + '</span></div>' +
      '<div><span class="f-l">Margin</span><span class="f-v">' + U.marginPill(p.margin) + '</span></div></div>'));

    var ed = el('<div class="p360-block"><div class="blk-head"><h4>Team for ' + esc(C.mlabel(month)) + '</h4>' +
      '<span class="blk-note">' + p.team.length + ' people</span></div></div>');
    var lines = el('<div class="alloc-lines"></div>');
    p.team.slice().sort(function (x, y) { return y.amount - x.amount; }).forEach(function (t) {
      var emp = r.byEmployee[t.empId];
      var freeCap = 100 - emp.allocatedPct + t.pct;
      var line = el('<div class="alloc-line">' +
        '<span class="avatar-sm" style="--hue:' + hueOf(emp.dept) + '">' + esc(initials(emp.name)) + '</span>' +
        '<span class="nm"><strong>' + esc(emp.name) + '</strong><small>' + esc(emp.title) + ' &middot; ' + emp.allocatedPct + '% allocated overall</small></span>' +
        '<span class="amt num">' + money(t.amount) + '</span></div>');
      line.insertBefore(control(t.pct, freeCap, hueOf(p.id), function (v) {
        var m = mapOf(month, emp.id);
        if (v <= 0) delete m[p.id]; else m[p.id] = v;
        write(month, emp.id, m, emp.name + ' on ' + p.name); refresh();
      }), line.querySelector('.amt'));
      var rm = el('<button class="row-act danger" type="button" data-tip="Take off this project" aria-label="Remove">' + icon('trash') + '</button>');
      rm.addEventListener('click', function () {
        var m = mapOf(month, emp.id); delete m[p.id];
        write(month, emp.id, m, 'removing ' + emp.name + ' from ' + p.name); refresh();
      });
      line.appendChild(rm);
      lines.appendChild(line);
    });
    if (!p.team.length) lines.appendChild(el(U.emptyState('Nobody on this project', 'Add someone with free capacity below.', '', 'users')));
    ed.appendChild(lines);

    var candidates = Object.keys(r.byEmployee).map(function (id) { return r.byEmployee[id]; })
      .filter(function (e) { return e.allocatedPct < 100 && !e.lines.some(function (l) { return l.projectId === p.id; }); })
      .sort(function (x, y) { return y.unallocated - x.unallocated; });
    var add = el('<div class="alloc-add"><select aria-label="Add someone to this project"><option value="">' +
      (candidates.length ? 'Add someone with free capacity…' : 'Everyone is fully allocated') + '</option>' +
      candidates.map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + ' — ' + (100 - e.allocatedPct) + '% free (' + money(e.unallocated) + ')</option>'; }).join('') +
      '</select><span class="muted">' + candidates.length + ' available</span></div>');
    var sel = add.querySelector('select');
    sel.disabled = !candidates.length;
    sel.addEventListener('change', function () {
      if (!sel.value) return;
      var e2 = r.byEmployee[sel.value], m = mapOf(month, sel.value);
      m[p.id] = Math.min(100 - e2.allocatedPct, step() * 4);
      write(month, sel.value, m, 'adding ' + e2.name + ' to ' + p.name); refresh();
    });
    ed.appendChild(add);
    panel.appendChild(ed);

    /* cost history for the project */
    var months = H.trailing12(month);
    var hist = months.map(function (m) { var x = C.rollup(m).byProject[p.id]; return x ? { m: m, cost: x.empCost, rev: x.revenue, margin: x.margin } : null; }).filter(Boolean);
    if (hist.length > 1) {
      var tr = el('<div class="p360-block"><div class="blk-head"><h4>Team cost and margin</h4><span class="blk-note">' + hist.length + ' months</span></div></div>');
      tr.appendChild(el('<div class="util-spark">' + U.sparkline(hist.map(function (x) { return x.margin; }), 'var(--m-profit)', 300, 56,
        { labels: hist.map(function (x) { return C.mshort(x.m); }), name: 'Margin', fmt: 'pct' }) + '</div>'));
      var ht = '<table class="grid mini"><thead><tr><th>Month</th><th class="n">Team cost</th><th class="n">Revenue</th><th class="n">Margin</th></tr></thead><tbody>';
      hist.slice(-6).reverse().forEach(function (x) {
        ht += '<tr' + (x.m === month ? ' class="now"' : '') + '><td>' + esc(C.mshort(x.m)) + (x.m === month ? ' <span class="tag">now</span>' : '') + '</td>' +
          '<td class="n">' + money(x.cost) + '</td><td class="n">' + money(x.rev) + '</td><td class="n">' + U.marginPill(x.margin) + '</td></tr>';
      });
      tr.appendChild(el(ht + '</tbody></table>'));
      panel.appendChild(tr);
    }
    panel.appendChild(el('<footer class="p360-foot">Changing a percentage here moves cost onto or off <strong>' + esc(p.name) + '</strong> in ' + esc(C.mlabel(month)) + ' immediately.</footer>'));
    return panel;
  }

  function projectList(s, month) {
    var a = st(s), r = C.rollup(month);
    var projects = Object.keys(r.byProject).map(function (id) { return r.byProject[id]; }).sort(function (x, y) { return y.empCost - x.empCost; });
    var prevM = C.maddMonths(month, -1);
    var prev = C.MONTHS.indexOf(prevM) !== -1 ? C.rollup(prevM).byProject : {};
    var t = U.table([
      { key: 'name', label: 'Project', cell: function (p) { return '<span class="dotsw" style="background:' + hueOf(p.id) + '"></span><strong>' + esc(p.name) + '</strong><div class="muted" style="font-size:12px;padding-left:16px">' + esc((H.clientOf(p.id) || {}).name || '') + '</div>'; } },
      { key: 'team', label: 'People', num: true, sortVal: function (p) { return p.team.length; }, cell: function (p) { return p.team.length; } },
      { key: 'empCost', label: 'Team cost', num: true, cell: function (p) { return money(p.empCost); } },
      { key: 'delta', label: 'vs ' + C.mshort(prevM), num: true, sortVal: function (p) { return p.empCost - ((prev[p.id] || {}).empCost || 0); },
        cell: function (p) { return prev[p.id] ? U.deltaChip(p.empCost, prev[p.id].empCost, { inverse: true }) : '<span class="muted">new</span>'; } },
      { key: 'revenue', label: 'Revenue', num: true, cell: function (p) { return money(p.revenue); } },
      { key: 'margin', label: 'Margin', num: true, cell: function (p) { return U.marginPill(p.margin); } }
    ], projects, {
      sortKey: 'empCost', id: 'alloc-projects', exportable: false, search: false,
      rowClass: function (p) { return a.team === p.id ? 'on' : ''; },
      onRow: function (p) { a.team = a.team === p.id ? null : p.id; refresh(); }
    });
    var w = el('<div class="wb-list"></div>');
    w.appendChild(t);
    return w;
  }

  /* ---------- matrix ------------------------------------------------------- */
  function matrixView(month, rows) {
    var r = C.rollup(month);
    var used = Object.keys(r.byProject).filter(function (pid) {
      return rows.some(function (e) { return e.lines.some(function (l) { return l.projectId === pid; }); });
    }).sort(function (a, b) { return r.byProject[a].name.localeCompare(r.byProject[b].name); });
    var h = '<div class="panel"><div class="dt-scroll capped"><table class="grid"><thead><tr><th class="stick">Employee</th>';
    used.forEach(function (pid) { h += '<th class="n"><span class="dotsw" style="background:' + hueOf(pid) + '"></span>' + esc(r.byProject[pid].name) + '</th>'; });
    h += '<th class="n">Internal</th><th class="n">Total</th><th class="n">Bench</th></tr></thead><tbody>';
    rows.forEach(function (e) {
      h += '<tr><td class="stick" style="white-space:nowrap"><strong>' + esc(e.name) + '</strong></td>';
      used.forEach(function (pid) {
        var l = e.lines.filter(function (x) { return x.projectId === pid; })[0];
        h += '<td class="n">' + (l ? '<span data-tip="' + money(l.amount) + '">' + l.pct + '%</span>' : '<span class="muted">·</span>') + '</td>';
      });
      var il = e.lines.filter(function (x) { return x.projectId === null; })[0];
      h += '<td class="n">' + (il ? il.pct + '%' : '<span class="muted">·</span>') + '</td>';
      h += '<td class="n"><strong>' + e.allocatedPct + '%</strong></td>';
      h += '<td class="n">' + (e.unallocated > 0.5 ? '<span class="warn-ink">' + money(e.unallocated) + '</span>' : '<span class="muted">—</span>') + '</td></tr>';
    });
    h += '</tbody><tfoot><tr><td class="stick">Cost booked</td>';
    used.forEach(function (pid) { h += '<td class="n">' + moneyK(r.byProject[pid].empCost) + '</td>'; });
    h += '<td class="n">' + moneyK(r.company.internalEmpCost) + '</td><td class="n"></td><td class="n">' +
      moneyK(r.company.unallocatedEmpCost) + '</td></tr></tfoot></table></div></div>';
    return el(h);
  }

  /* ================= the screen =========================================== */
  V.allocations = function (s) {
    var a = st(s), month = s.month, r = C.rollup(month), c = r.company;
    var f = document.createDocumentFragment();

    f.appendChild(H.head('Allocation',
      'Split each person’s month across projects. Editing <strong>' + esc(C.mlabel(month)) + '</strong> never touches another month.'));

    /* --- summary cards ---------------------------------------------------- */
    var all = Object.keys(r.byEmployee).map(function (id) { return r.byEmployee[id]; });
    var full = all.filter(function (e) { return e.allocatedPct === 100; }).length;
    var under = all.filter(function (e) { return e.allocatedPct < 100; }).length;
    var over = all.filter(function (e) { return e.allocatedPct > 100; }).length;
    f.appendChild(el(U.sumStrip([
      { label: 'Payroll this month', value: moneyK(c.employeeCost), foot: c.headcount + ' employees', tip: 'Exact: ' + money(c.employeeCost) },
      { label: 'On client projects', value: moneyK(c.projectEmpCost), foot: pct(c.projectEmpCost / c.employeeCost) + ' of payroll', tip: 'Payroll that reached a billable project. Exact: ' + money(c.projectEmpCost) },
      { label: 'Internal', value: moneyK(c.internalEmpCost), foot: pct(c.internalEmpCost / c.employeeCost) + ' non-billable', tip: 'Internal time and non-billable projects. Exact: ' + money(c.internalEmpCost) },
      { label: 'On the bench', value: moneyK(c.unallocatedEmpCost), foot: pct(c.unallocatedEmpCost / c.employeeCost) + ' unallocated', tip: 'Payroll with no allocation at all. Exact: ' + money(c.unallocatedEmpCost) },
      { label: 'Fully allocated', value: full + ' <small class="of">/ ' + all.length + '</small>', foot: '<span class="pill good">at 100%</span>', tip: 'People whose month adds up to exactly 100%.' },
      { label: 'Needs attention', value: String(under + over), foot: (under ? '<span class="pill watch">' + under + ' under</span> ' : '') + (over ? '<span class="pill crit">' + over + ' over</span>' : (under ? '' : '<span class="pill good">none</span>')), tip: 'Under- or over-allocated people this month.' }
    ])));

    /* --- toolbar ---------------------------------------------------------- */
    var bar = el('<div class="wb-bar"></div>');
    var search = el('<label class="search"><span class="ic">' + U.icon('search') + '</span><input type="text" placeholder="Search people or projects" value="' + esc(a.q) + '"></label>');
    var qi = search.querySelector('input');
    qi.addEventListener('input', function () { a.q = qi.value; refresh(); var n = document.querySelector('.wb-bar .search input'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } });
    bar.appendChild(search);
    function select(label, cur, opts, onPick) {
      var w = el('<select aria-label="' + esc(label) + '"><option value="">' + esc(label) + '</option>' +
        opts.map(function (o) { return '<option value="' + esc(o.v) + '"' + (o.v === cur ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select>');
      w.addEventListener('change', function () { onPick(w.value); refresh(); });
      bar.appendChild(w); return w;
    }
    select('All departments', a.dept, H.dedupe(C.EMPLOYEES.map(function (e) { return e.dept; })).sort().map(function (d) { return { v: d, l: d }; }), function (v) { a.dept = v; });
    select('Any status', a.status, [{ v: 'under', l: 'Under-allocated' }, { v: 'full', l: 'Fully allocated' }, { v: 'over', l: 'Over-allocated' }, { v: 'none', l: 'Not allocated at all' }], function (v) { a.status = v; });
    select('Any project', a.project, Object.keys(r.byProject).map(function (id) { return { v: id, l: r.byProject[id].name }; }).sort(function (x, y) { return x.l.localeCompare(y.l); }), function (v) { a.project = v; });
    bar.appendChild(el('<span class="grow"></span>'));
    var toggle = el('<div class="seg-toggle" role="group" aria-label="View"></div>');
    [['employee', 'By person', 'users'], ['project', 'By project', 'projects'], ['matrix', 'Matrix', 'dashboard']].forEach(function (v) {
      var b = el('<button type="button" aria-pressed="' + (a.view === v[0]) + '">' + icon(v[2]) + '<span>' + v[1] + '</span></button>');
      b.addEventListener('click', function () { a.view = v[0]; refresh(); });
      toggle.appendChild(b);
    });
    bar.appendChild(toggle);
    var prevM = C.maddMonths(month, -1);
    var copy = H.btn('Copy from ' + C.mshort(prevM), '', function () { confirmCopy(month, prevM); }, 'compare');
    copy.disabled = C.MONTHS.indexOf(prevM) === -1;
    bar.appendChild(copy);
    var un = H.btn('Undo', '', undo);
    un.disabled = !undoStack.length;
    un.setAttribute('data-tip', undoStack.length ? 'Revert: ' + undoStack[undoStack.length - 1].label : 'Nothing to undo');
    bar.appendChild(un);
    f.appendChild(bar);

    /* --- rows ------------------------------------------------------------- */
    var q = a.q.trim().toLowerCase();
    var rows = all.filter(function (e) {
      if (a.dept && e.dept !== a.dept) return false;
      if (a.project && !e.lines.some(function (l) { return l.projectId === a.project; })) return false;
      if (a.status === 'under' && e.allocatedPct >= 100) return false;
      if (a.status === 'full' && e.allocatedPct !== 100) return false;
      if (a.status === 'over' && e.allocatedPct <= 100) return false;
      if (a.status === 'none' && e.allocatedPct !== 0) return false;
      if (q) {
        var hay = (e.name + ' ' + e.title + ' ' + e.dept + ' ' + e.lines.map(function (l) { return l.projectId ? H.projName(l.projectId) : 'internal'; }).join(' ')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (x, y) { return (x.allocatedPct - y.allocatedPct) || (y.monthlyCost - x.monthlyCost); });

    var wb = el('<div class="wb"></div>');
    if (a.view === 'employee') {
      wb.appendChild(peopleList(s, month, rows));
      var selEmp = a.sel && r.byEmployee[a.sel];
      wb.appendChild(selEmp ? person360(s, month, selEmp)
        : el('<aside class="p360 empty">' + U.emptyState('Pick a person', 'Select someone on the left to see their whole month — capacity, cost, the projects they charge, and how their utilisation has moved.', '', 'users') + '</aside>'));
      f.appendChild(wb);
    } else if (a.view === 'project') {
      wb.appendChild(projectList(s, month));
      var selP = a.team && r.byProject[a.team];
      wb.appendChild(selP ? project360(s, month, selP)
        : el('<aside class="p360 empty">' + U.emptyState('Pick a project', 'Select a project on the left to staff it and see its cost, revenue and margin history.', '', 'projects') + '</aside>'));
      f.appendChild(wb);
    } else {
      f.appendChild(matrixView(month, rows));
    }

    /* --- bench ------------------------------------------------------------ */
    if (a.view !== 'project') {
      var bench = all.filter(function (e) { return e.unallocated > 0.5; }).sort(function (x, y) { return y.unallocated - x.unallocated; });
      f.appendChild(H.section('Bench', money(c.unallocatedEmpCost) + ' unallocated across ' + bench.length + ' people'));
      var bl = el('<div class="bench"></div>');
      if (!bench.length) bl.appendChild(el(U.emptyState('Everyone is fully allocated', 'Nothing is on the bench this month.', '', 'trend')));
      bench.slice(0, 12).forEach(function (e) {
        var card = el('<button class="bench-card" type="button">' +
          '<span class="avatar-sm" style="--hue:' + hueOf(e.dept) + '">' + esc(initials(e.name)) + '</span>' +
          '<span class="bc-t"><strong>' + esc(e.name) + '</strong><span class="sub">' + esc(e.dept) + '</span></span>' +
          '<span class="bc-v"><b class="num">' + money(e.unallocated) + '</b><span class="sub">' + (100 - e.allocatedPct) + '% free</span></span></button>');
        card.addEventListener('click', function () {
          a.view = 'employee'; a.sel = e.id; a.status = ''; a.dept = ''; a.q = ''; refresh();
          var node = document.querySelector('.p360'); if (node) node.scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
        bl.appendChild(card);
      });
      if (bench.length > 12) bl.appendChild(el('<div class="bench-more">' + (bench.length - 12) + ' more with free capacity — filter by “Under-allocated” above to see them all</div>'));
      f.appendChild(bl);
    }
    return f;
  };

  // the employee page hands off to this screen rather than carrying its own editor
  root.App.openAllocation = function (empId) {
    var a = st(root.App.state);
    a.view = 'employee'; a.q = ''; a.dept = ''; a.status = ''; a.project = ''; a.sel = empId;
    root.App.go('allocations');
    setTimeout(function () { var n = document.querySelector('.p360'); if (n) n.scrollIntoView({ block: 'start' }); }, 0);
  };

  function confirmCopy(month, prevM) {
    var body = el('<div style="display:flex;flex-direction:column;gap:12px">' +
      '<div class="callout">This replaces every allocation in <strong>' + esc(C.mlabel(month)) +
      '</strong> with the one from <strong>' + esc(C.mlabel(prevM)) + '</strong>. ' +
      'Lines for projects that are not running in ' + esc(C.mlabel(month)) + ' are dropped. ' +
      esc(C.mlabel(prevM)) + ' itself is not touched, and you can undo this.</div></div>');
    var go = el('<button class="btn btn-primary" type="button">Copy ' + C.mshort(prevM) + ' → ' + C.mshort(month) + '</button>');
    go.addEventListener('click', function () {
      pushUndo(month, 'copying ' + C.mlabel(prevM) + ' forward');
      var res = C.copyAllocations(prevM, month);
      document.getElementById('dlg').close();
      refresh();
      U.toast('Copied ' + res.copied + ' allocations from ' + C.mlabel(prevM), {
        kind: 'success', action: { label: 'Undo', fn: undo },
        detail: res.dropped ? res.dropped + ' line(s) dropped for projects not running this month' : null
      });
    });
    root.App.openDialog('Copy allocation forward', body, [go], C.mlabel(prevM) + ' → ' + C.mlabel(month));
  }
})(typeof window !== 'undefined' ? window : globalThis);
