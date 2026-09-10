/* ============================================================================
   Formatting, chart primitives and shared components.
   Chart rules held to throughout: one y-scale per chart, categorical hues
   assigned in fixed order, 2px gaps between adjacent fills, rounded data-ends
   anchored to the baseline, recessive grid, direct end labels, hover on
   everything, and a table view of the same numbers nearby.
   ========================================================================== */
(function (root) {
  'use strict';
  var C = root.CTC;

  /* ---------- formatting -----------------------------------------------------
     Currency symbol, digit grouping, abbreviation scale and percentage
     precision all come from Settings, so one change there reformats every
     figure in the product.                                                  */
  var FMT = { symbol: '$', locale: 'en-US', scale: 'international', pctDp: 1 };
  function setFormat(o) { for (var k in o) FMT[k] = o[k]; }

  function money(n) {
    var v = Math.round(n || 0);
    return (v < 0 ? '−' : '') + FMT.symbol + Math.abs(v).toLocaleString(FMT.locale);
  }
  function moneyK(n) {
    var v = n || 0, sg = v < 0 ? '−' : '', a = Math.abs(v);
    if (FMT.scale === 'full') return money(n);
    if (FMT.scale === 'indian') {
      if (a >= 1e7) return sg + FMT.symbol + (a / 1e7).toFixed(2) + ' Cr';
      if (a >= 1e5) return sg + FMT.symbol + (a / 1e5).toFixed(2) + ' L';
      if (a >= 1000) return sg + FMT.symbol + (a / 1000).toFixed(1) + 'K';
      return sg + FMT.symbol + Math.round(a);
    }
    if (a >= 1e6) return sg + FMT.symbol + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1000) return sg + FMT.symbol + (a / 1000).toFixed(1) + 'K';
    return sg + FMT.symbol + Math.round(a);
  }
  function pct(n, d) { return ((n || 0) * 100).toFixed(d === undefined ? FMT.pctDp : d) + '%'; }
  function signed(n) { return (n >= 0 ? '+' : '−') + money(Math.abs(n)).replace('−', ''); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

  function deltaChip(cur, prev, opts) {
    opts = opts || {};
    if (prev == null || prev === 0) return '<span class="delta flat">—</span>';
    var chg, txt;
    if (opts.points) { chg = (cur - prev) * 100; txt = (chg >= 0 ? '+' : '−') + Math.abs(chg).toFixed(1) + ' pts'; }
    else { chg = (cur - prev) / Math.abs(prev) * 100; txt = (chg >= 0 ? '↑' : '↓') + ' ' + Math.abs(chg).toFixed(1) + '%'; }
    var good = opts.inverse ? chg < 0 : chg > 0;
    var cls = Math.abs(chg) < 0.05 ? 'flat' : good ? 'up' : 'down';
    return '<span class="delta ' + cls + '">' + txt + '</span>';
  }

  /* ---------- margin bands -------------------------------------------------- */
  var BANDS = { healthy: 0.35, watch: 0.20 };
  function band(m) {
    if (m < 0) return { key: 'loss', cls: 'loss', label: 'Loss making', glyph: '▼' };
    if (m < BANDS.watch) return { key: 'critical', cls: 'crit', label: 'Critical', glyph: '●' };
    if (m < BANDS.healthy) return { key: 'watch', cls: 'watch', label: 'Watch', glyph: '●' };
    return { key: 'healthy', cls: 'good', label: 'Healthy', glyph: '●' };
  }
  function marginPill(m) {
    var b = band(m);
    return '<span class="pill ' + b.cls + '" title="' + b.label + '"><span class="glyph">' + b.glyph + '</span>' + pct(m) + '</span>';
  }

  /* ---------- svg helpers --------------------------------------------------- */
  var SVGNS = 'http://www.w3.org/2000/svg';
  var uid = 0;
  function svgEl(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    return e;
  }
  function niceTicks(min, max, count) {
    if (min === max) { min -= 1; max += 1; }
    var span = max - min, step = Math.pow(10, Math.floor(Math.log10(span / count)));
    var err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
    for (var v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
    return out;
  }
  // rounded data-end anchored to the baseline: the far end is rounded, the
  // baseline end stays square
  function barPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, Math.abs(h));
    if (h >= 0) {
      return 'M' + x + ' ' + (y + h) + ' L' + x + ' ' + (y + r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
        ' L' + (x + w - r) + ' ' + y + ' Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + ' L' + (x + w) + ' ' + (y + h) + ' Z';
    }
    var b = y + h;
    return 'M' + x + ' ' + b + ' L' + x + ' ' + (y - r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
      ' L' + (x + w - r) + ' ' + y + ' Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y - r) + ' L' + (x + w) + ' ' + b + ' Z';
  }
  function roundTop(x, y, w, h, r, flip) {
    r = Math.min(r, w / 2, h);
    if (h <= 0) return '';
    if (!flip) return 'M' + x + ' ' + (y + h) + ' V' + (y + r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
      ' H' + (x + w - r) + ' Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + ' V' + (y + h) + ' Z';
    var b = y + h;
    return 'M' + x + ' ' + y + ' V' + (b - r) + ' Q' + x + ' ' + b + ' ' + (x + r) + ' ' + b +
      ' H' + (x + w - r) + ' Q' + (x + w) + ' ' + b + ' ' + (x + w) + ' ' + (b - r) + ' V' + y + ' Z';
  }
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    return 'M' + (x + r) + ' ' + y + ' H' + (x + w - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (x + w) + ' ' + (y + r) +
      ' V' + (y + h - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (x + w - r) + ' ' + (y + h) +
      ' H' + (x + r) + ' A' + r + ' ' + r + ' 0 0 1 ' + x + ' ' + (y + h - r) +
      ' V' + (y + r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (x + r) + ' ' + y + ' Z';
  }
  function tipEl() { return el('<div class="tip" role="status"></div>'); }

  /* ---------- responsive chart frame ----------------------------------------
     Charts are drawn at the size they are shown. A fixed viewBox scaled to a
     wide card turns 11px type into 20px and 24px bars into 60px slabs; here the
     SVG is sized in real pixels from the container and redrawn on resize, so
     marks, type and spacing are the same on a 400px card and a 1400px one.  */
  function frame(cfg, draw) {
    var wrap = el('<div class="chart"></div>');
    var tip = tipEl();
    var svg = null, lastW = 0;
    function render() {
      var w = wrap.clientWidth;
      if (!w || Math.abs(w - lastW) < 2) return;
      lastW = w;
      if (svg) svg.remove();
      svg = svgEl('svg', { width: w, height: cfg.height, viewBox: '0 0 ' + w + ' ' + cfg.height,
        role: 'img', 'aria-label': cfg.aria || 'Chart', class: 'ch' });
      draw(svg, w, cfg.height, tip);
      wrap.insertBefore(svg, tip);
    }
    wrap.appendChild(tip);
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () { render(); });
      ro.observe(wrap);
    }
    // first paint: the node is usually appended to the page a tick after it is built
    requestAnimationFrame(render);
    setTimeout(render, 60);
    return wrap;
  }
  function tickMoney(v) {
    var s = moneyK(v);
    return s.replace(/\.0([KM])$/, '$1');
  }
  function textEl(x, y, str, o) {
    o = o || {};
    var t = svgEl('text', { x: x, y: y, 'text-anchor': o.anchor || 'start', fill: o.fill || 'var(--text-3)',
      'font-size': o.size || 11, 'font-weight': o.weight || 500, 'font-family': 'var(--sans)',
      'letter-spacing': '-0.01em' });
    if (o.tabular) t.setAttribute('style', 'font-variant-numeric:tabular-nums');
    t.textContent = str;
    return t;
  }
  function pxTip(tip, wrap, x, y) {
    /* pixel-space placement: inside the plot, clear of the legend row above it */
    var W = wrap.clientWidth, tw = tip.offsetWidth || 180;
    /* SVG elements have no offsetTop: measure the plot's offset inside the frame */
    var svg = wrap.querySelector('svg.ch');
    var top = svg ? Math.round(svg.getBoundingClientRect().top - wrap.getBoundingClientRect().top) : 0;
    var left = Math.min(Math.max(6, x - tw / 2), Math.max(6, W - tw - 6));
    tip.style.left = left + 'px';
    tip.style.top = (top + (y == null ? 6 : y)) + 'px';
    tip.style.opacity = 1;
  }
  function monthTick(m, i, n) {
    var p = C.mparse(m);
    return C.mabbr(m) + (p.m === 1 || i === 0 ? " '" + String(p.y).slice(2) : '');
  }

  /* ---------- line / area chart --------------------------------------------- */
  function lineChart(cfg) {
    var months = cfg.months, series = cfg.series;
    var H = cfg.height || 240;
    var all = [];
    series.forEach(function (s) { s.values.forEach(function (v) { if (v != null) all.push(v); }); });
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    if (cfg.zeroBase !== false) lo = Math.min(0, lo);
    var ticks = niceTicks(lo, hi, 4), y0 = ticks[0], y1 = ticks[ticks.length - 1];
    var fmt = cfg.tickFmt || tickMoney;

    var wrap = frame({ height: H, aria: cfg.aria || 'Monthly trend' }, function (svg, W, H, tip) {
      var PL = 52, PR = cfg.endLabels === false ? 16 : 64, PT = 14, PB = 26;
      var iw = W - PL - PR, ih = H - PT - PB;
      var X = function (i) { return PL + (months.length === 1 ? iw / 2 : i * iw / (months.length - 1)); };
      var Y = function (v) { return PT + ih - (v - y0) / (y1 - y0) * ih; };
      var defs = svgEl('defs'); svg.appendChild(defs);

      /* grid + y ticks: hairline, recessive */
      ticks.forEach(function (t) {
        svg.appendChild(svgEl('line', { x1: PL, x2: PL + iw, y1: Y(t) + .5, y2: Y(t) + .5, stroke: 'var(--grid)', 'stroke-width': 1 }));
        svg.appendChild(textEl(PL - 8, Y(t) + 4, fmt(t), { anchor: 'end', tabular: true }));
      });
      if (y0 < 0) svg.appendChild(svgEl('line', { x1: PL, x2: PL + iw, y1: Y(0), y2: Y(0), stroke: 'var(--axis)', 'stroke-width': 1 }));

      /* x labels: thin out to what fits */
      var every = Math.max(1, Math.ceil((months.length * 40) / iw)), last = months.length - 1;
      months.forEach(function (m, i) {
        if ((last - i) % every !== 0) return;
        svg.appendChild(textEl(X(i), H - 8, monthTick(m, i, months.length), { anchor: i === last ? 'end' : i === 0 ? 'start' : 'middle' }));
      });

      /* marks */
      var endPts = [];
      series.forEach(function (s) {
        var pts = s.values.map(function (v, i) { return [X(i), Y(v)]; });
        var d = smoothPath(pts);
        if (s.area) {
          var gid = 'g' + (++uid);
          var grad = svgEl('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
          grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': .16 }));
          grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': 0 }));
          defs.appendChild(grad);
          var base = Y(Math.max(y0, 0));
          svg.appendChild(svgEl('path', { d: d + ' L' + X(months.length - 1).toFixed(1) + ' ' + base.toFixed(1) + ' L' + X(0).toFixed(1) + ' ' + base.toFixed(1) + ' Z', fill: 'url(#' + gid + ')' }));
        }
        svg.appendChild(svgEl('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        var li = months.length - 1;
        svg.appendChild(svgEl('circle', { cx: X(li), cy: Y(s.values[li]), r: 4, fill: s.color, stroke: 'var(--layer)', 'stroke-width': 2 }));
        endPts.push({ y: Y(s.values[li]), v: s.values[li], s: s });
      });

      /* direct end labels, nudged apart only when they would overlap */
      if (cfg.endLabels !== false) {
        endPts.sort(function (a, b) { return a.y - b.y; });
        var lastY = -Infinity;
        endPts.forEach(function (e) {
          var y = Math.max(e.y, lastY + 13);
          lastY = y;
          var lx = X(months.length - 1) + 10;
          if (Math.abs(y - e.y) > 2) svg.appendChild(svgEl('line', { x1: lx - 4, y1: e.y, x2: lx - 1, y2: y, stroke: 'var(--border-strong)', 'stroke-width': 1 }));
          svg.appendChild(textEl(lx, y + 4, fmt(e.v), { fill: 'var(--text-2)', weight: 600, tabular: true }));
        });
      }

      /* hover: crosshair snaps to the month, one readout for every series */
      var cross = svgEl('line', { y1: PT, y2: PT + ih, stroke: 'var(--border-strong)', 'stroke-width': 1, opacity: 0 });
      svg.appendChild(cross);
      var dots = series.map(function (s) {
        var c = svgEl('circle', { r: 4, fill: s.color, stroke: 'var(--layer)', 'stroke-width': 2, opacity: 0 });
        svg.appendChild(c); return c;
      });
      var half = months.length > 1 ? iw / (months.length - 1) / 2 : iw / 2;
      months.forEach(function (m, i) {
        var r = svgEl('rect', { x: Math.max(PL - half, X(i) - half), y: PT, width: half * 2, height: ih, fill: 'transparent',
          style: cfg.onClickMonth ? 'cursor:pointer' : '' });
        r.addEventListener('mouseenter', function () {
          cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 1);
          dots.forEach(function (dt, si) { dt.setAttribute('cx', X(i)); dt.setAttribute('cy', Y(series[si].values[i])); dt.setAttribute('opacity', 1); });
          tip.innerHTML = '<div class="t-head">' + esc(C.mlabel(m)) + '</div>' + series.map(function (s) {
            return '<div class="t-row"><span class="t-key"><span class="t-line" style="background:' + s.color + '"></span>' + esc(s.label) + '</span><span>' +
              (cfg.tipFmt ? cfg.tipFmt(s.values[i]) : money(s.values[i])) + '</span></div>';
          }).join('') + (cfg.onClickMonth ? '<div class="t-cta">Click to open this month →</div>' : '');
          pxTip(tip, wrap, X(i), 4);
        });
        r.addEventListener('mouseleave', function () {
          cross.setAttribute('opacity', 0); dots.forEach(function (d) { d.setAttribute('opacity', 0); }); tip.style.opacity = 0;
        });
        if (cfg.onClickMonth) r.addEventListener('click', function () { cfg.onClickMonth(m); });
        svg.appendChild(r);
      });
    });

    if (series.length > 1) {
      var lg = el('<div class="legend"></div>');
      series.forEach(function (s) {
        lg.appendChild(el('<div class="item"><span class="' + (s.area ? 'swatch' : 'lkey') + '" style="background:' + s.color + '"></span>' + esc(s.label) + '</div>'));
      });
      wrap.insertBefore(lg, wrap.firstChild);
    }
    return wrap;
  }

  /* ---------- column chart --------------------------------------------------- */
  function columnChart(cfg) {
    var months = cfg.months, values = cfg.values;
    var H = cfg.height || 220;
    var lo = Math.min(0, Math.min.apply(null, values)), hi = Math.max.apply(null, values);
    var ticks = niceTicks(lo, hi, 4), y0 = ticks[0], y1 = ticks[ticks.length - 1];
    var fmt = cfg.tickFmt || tickMoney;
    var max = Math.max.apply(null, values), maxI = values.indexOf(max);

    var wrap = frame({ height: H, aria: cfg.aria || 'Monthly values' }, function (svg, W, H, tip) {
      var PL = 52, PR = 12, PT = 22, PB = 26;
      var iw = W - PL - PR, ih = H - PT - PB;
      var Y = function (v) { return PT + ih - (v - y0) / (y1 - y0) * ih; };
      var step = iw / months.length;
      var bw = Math.min(24, Math.max(6, step - 6));         /* thin marks: never fill the slot */

      ticks.forEach(function (t) {
        svg.appendChild(svgEl('line', { x1: PL, x2: PL + iw, y1: Y(t) + .5, y2: Y(t) + .5, stroke: 'var(--grid)', 'stroke-width': 1 }));
        svg.appendChild(textEl(PL - 8, Y(t) + 4, fmt(t), { anchor: 'end', tabular: true }));
      });
      var every = Math.max(1, Math.ceil((months.length * 36) / iw)), last = months.length - 1;

      months.forEach(function (m, i) {
        var x = PL + i * step + (step - bw) / 2, v = values[i];
        var h = Math.abs(Y(v) - Y(0));
        var color = cfg.colorFor ? cfg.colorFor(v, i) : 'var(--s1)';
        var op = cfg.opacityFor ? cfg.opacityFor(v, i) : 1;
        var top = v >= 0 ? Y(v) : Y(0);
        var bar = svgEl('path', { d: roundTop(x, top, bw, h, 4, v < 0), fill: color, opacity: op });
        svg.appendChild(bar);
        /* one direct label: the extreme (or the current month when it is the last) */
        var label = (i === maxI || i === months.length - 1) && (cfg.labels !== false);
        if (label) svg.appendChild(textEl(x + bw / 2, top - 6, cfg.tipFmt ? cfg.tipFmt(v) : fmt(v),
          { anchor: 'middle', fill: 'var(--text-2)', weight: 600, tabular: true }));
        if ((last - i) % every === 0) svg.appendChild(textEl(x + bw / 2, H - 8, C.mabbr(m), { anchor: 'middle' }));
        var hit = svgEl('rect', { x: PL + i * step, y: PT, width: step, height: ih, fill: 'transparent',
          style: cfg.onClickMonth ? 'cursor:pointer' : '' });
        hit.addEventListener('mouseenter', function () {
          bar.setAttribute('opacity', Math.min(1, op * .7 + .3)); bar.setAttribute('filter', 'brightness(1.08)');
          tip.innerHTML = '<div class="t-head">' + esc(C.mlabel(m)) + '</div><div class="t-row"><span class="t-key"><span class="t-dot" style="background:' + color + '"></span>' +
            esc(cfg.label || 'Value') + '</span><span>' + (cfg.tipFmt ? cfg.tipFmt(v) : money(v)) + '</span></div>' +
            (cfg.onClickMonth ? '<div class="t-cta">Click to open this month →</div>' : '');
          pxTip(tip, wrap, x + bw / 2, 4);
        });
        hit.addEventListener('mouseleave', function () { bar.setAttribute('opacity', op); bar.removeAttribute('filter'); tip.style.opacity = 0; });
        if (cfg.onClickMonth) hit.addEventListener('click', function () { cfg.onClickMonth(m); });
        svg.appendChild(hit);
      });
      svg.appendChild(svgEl('line', { x1: PL, x2: PL + iw, y1: Y(0) + .5, y2: Y(0) + .5, stroke: 'var(--axis)', 'stroke-width': 1 }));
    });
    return wrap;
  }

  /* ---------- stacked column chart -------------------------------------------
     cfg.months, cfg.series: [{label, values, color}] stacked bottom-up in order.
     Tooltip lists every layer plus the stack total; cfg.extra(i) may append
     more tooltip rows (e.g. allocation) without drawing anything. */
  function stackedColumnChart(cfg) {
    var months = cfg.months, series = cfg.series;
    var H = cfg.height || 220;
    var totals = months.map(function (_, i) { return series.reduce(function (t, sr) { return t + Math.max(0, sr.values[i] || 0); }, 0); });
    var hi = Math.max.apply(null, totals.concat([0]));
    var ticks = niceTicks(0, hi, 4), y0 = ticks[0], y1 = ticks[ticks.length - 1] || 1;
    var fmt = cfg.tickFmt || tickMoney;
    var maxI = totals.indexOf(Math.max.apply(null, totals));

    var wrap = frame({ height: H, aria: cfg.aria || 'Stacked monthly values' }, function (svg, W, H, tip) {
      var PL = 52, PR = 12, PT = 22, PB = 26;
      var iw = W - PL - PR, ih = H - PT - PB;
      var Y = function (v) { return PT + ih - (v - y0) / (y1 - y0) * ih; };
      var step = iw / months.length;
      var bw = Math.min(26, Math.max(6, step - 6));
      ticks.forEach(function (t) {
        svg.appendChild(svgEl('line', { x1: PL, x2: PL + iw, y1: Y(t) + .5, y2: Y(t) + .5, stroke: 'var(--grid)', 'stroke-width': 1 }));
        svg.appendChild(textEl(PL - 8, Y(t) + 4, fmt(t), { anchor: 'end', tabular: true }));
      });
      var every = Math.max(1, Math.ceil((months.length * 36) / iw)), last = months.length - 1;
      months.forEach(function (m, i) {
        var x = PL + i * step + (step - bw) / 2, base = 0, parts = [];
        series.forEach(function (sr, k) {
          var v = Math.max(0, sr.values[i] || 0); if (!v) return;
          var top = Y(base + v), h = Y(base) - Y(base + v);
          var isTop = (base + v) >= totals[i] - 1e-6;
          var d = isTop ? roundTop(x, top, bw, h, 4, false) : 'M' + x + ' ' + top + 'h' + bw + 'v' + h + 'h' + (-bw) + 'z';
          var bar = svgEl('path', { d: d, fill: sr.color || 'var(--s' + (k + 1) + ')', opacity: cfg.faded && cfg.faded(i) ? .45 : 1 });
          svg.appendChild(bar); parts.push(bar); base += v;
        });
        if ((i === last || (i === maxI && (last - i) * step > 44)) && cfg.labels !== false && totals[i] > 0)
          svg.appendChild(textEl(x + bw / 2, Y(totals[i]) - 6, fmt(totals[i]), { anchor: 'middle', fill: 'var(--text-2)', weight: 600, tabular: true }));
        if ((last - i) % every === 0) svg.appendChild(textEl(x + bw / 2, H - 8, C.mabbr(m), { anchor: 'middle' }));
        var hit = svgEl('rect', { x: PL + i * step, y: PT, width: step, height: ih, fill: 'transparent', style: cfg.onClickMonth ? 'cursor:pointer' : '' });
        hit.addEventListener('mouseenter', function () {
          parts.forEach(function (b) { b.setAttribute('filter', 'brightness(1.08)'); });
          var rows = series.map(function (sr) {
            return '<div class="t-row"><span class="t-key"><span class="t-dot" style="background:' + (sr.color || '') + '"></span>' + esc(sr.label) + '</span><span>' + money(sr.values[i] || 0) + '</span></div>';
          }).join('');
          rows += '<div class="t-row t-line"><span class="t-key">' + esc(cfg.totalLabel || 'Total') + '</span><span><strong>' + money(totals[i]) + '</strong></span></div>';
          if (cfg.extra) rows += cfg.extra(i);
          tip.innerHTML = '<div class="t-head">' + esc(C.mlabel(m)) + '</div>' + rows + (cfg.onClickMonth ? '<div class="t-cta">Click to open this month →</div>' : '');
          pxTip(tip, wrap, x + bw / 2, 4);
        });
        hit.addEventListener('mouseleave', function () { parts.forEach(function (b) { b.removeAttribute('filter'); }); tip.style.opacity = 0; });
        if (cfg.onClickMonth) hit.addEventListener('click', function () { cfg.onClickMonth(m); });
        svg.appendChild(hit);
      });
      svg.appendChild(svgEl('line', { x1: PL, x2: PL + iw, y1: Y(0) + .5, y2: Y(0) + .5, stroke: 'var(--axis)', 'stroke-width': 1 }));
    });
    return wrap;
  }

  /* ---------- month pivot ------------------------------------------------------
     Metrics down the side, months across the top. cfg.months: ['2026-01',…];
     cfg.rows: [{label, sub, cell(month, i) -> html, cls, total(html)}];
     cfg.current: month to highlight; cfg.onMonth(month); cfg.flags: {month: text}
     shown as a marker under the header (e.g. an anniversary raise). */
  function pivot(cfg) {
    var months = cfg.months, cur = cfg.current;
    var wrap = el('<div class="pv-wrap"></div>');
    var h = '<table class="pv"><thead><tr><th class="pv-side">' + esc(cfg.corner || '') + '</th>';
    months.forEach(function (m) {
      var flag = cfg.flags && cfg.flags[m];
      h += '<th class="pv-m' + (m === cur ? ' cur' : '') + (cfg.onMonth ? ' go' : '') + '" data-m="' + m + '"' + (flag ? ' data-tip="' + esc(flag) + '"' : '') + '>' +
        '<span class="pv-mon">' + esc(C.mabbr(m)) + '</span><span class="pv-yr">' + m.slice(2, 4) + '</span>' + (flag ? '<i class="pv-flag"></i>' : '') + '</th>';
    });
    if (cfg.totalLabel) h += '<th class="pv-tot">' + esc(cfg.totalLabel) + '</th>';
    h += '</tr></thead><tbody>';
    cfg.rows.forEach(function (r) {
      h += '<tr class="' + (r.cls || '') + '"><th class="pv-side"><span class="pv-lab">' + esc(r.label) + '</span>' + (r.sub ? '<span class="pv-sub">' + esc(r.sub) + '</span>' : '') + '</th>';
      months.forEach(function (m, i) { h += '<td class="' + (m === cur ? 'cur' : '') + '">' + (r.cell(m, i) || '') + '</td>'; });
      if (cfg.totalLabel) h += '<td class="pv-tot">' + (r.total || '') + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table>';
    wrap.innerHTML = h;
    if (cfg.onMonth) wrap.querySelectorAll('th.pv-m').forEach(function (th) { th.addEventListener('click', function () { cfg.onMonth(th.getAttribute('data-m')); }); });
    /* land on the current month, not January */
    requestAnimationFrame(function () {
      var c = wrap.querySelector('th.pv-m.cur'); if (!c) return;
      var side = wrap.querySelector('th.pv-side').offsetWidth;
      wrap.scrollLeft = Math.max(0, c.offsetLeft - side - (wrap.clientWidth - side) / 2 + c.offsetWidth / 2);
    });
    return wrap;
  }

  /* ---------- waterfall -----------------------------------------------------
     steps: [{label, value, kind:'total'|'add'|'sub'}] — 'total' bars sit on
     the baseline, 'add'/'sub' float from the running balance.               */
  function waterfall(cfg) {
    /* Modern bridge: totals are solid columns, movements are floating blocks
       in their semantic colour, and a hairline steps between them so the eye
       follows the running balance rather than reading eight unrelated bars.
       Drawn at real pixel size like every other chart. */
    var steps = cfg.steps, H = cfg.height || 300;
    var run = 0, geo = [];
    steps.forEach(function (s) {
      if (s.kind === 'total') { geo.push({ s: s, from: 0, to: s.value }); run = s.value; }
      else { var from = run; run += s.value; geo.push({ s: s, from: from, to: run }); }
    });
    var hi = Math.max.apply(null, geo.map(function (g) { return Math.max(g.from, g.to); }));
    var lo = Math.min(0, Math.min.apply(null, geo.map(function (g) { return Math.min(g.from, g.to); })));
    var ticks = niceTicks(lo, hi, 4), y0 = ticks[0], y1 = ticks[ticks.length - 1];

    var wrap = frame({ height: H, aria: cfg.aria || 'Profit bridge' }, function (svg, W, H, tip) {
      var PL = 52, PR = 12, PT = 26, PB = 48;
      var iw = W - PL - PR, ih = H - PT - PB;
      var Y = function (v) { return PT + ih - (v - y0) / (y1 - y0) * ih; };
      var step = iw / steps.length, bw = Math.min(48, Math.max(14, step - 24));

      ticks.forEach(function (t) {
        svg.appendChild(svgEl('line', { x1: PL, x2: PL + iw, y1: Y(t) + .5, y2: Y(t) + .5, stroke: 'var(--grid)', 'stroke-width': 1 }));
        svg.appendChild(textEl(PL - 8, Y(t) + 4, tickMoney(t), { anchor: 'end', tabular: true }));
      });
      svg.appendChild(svgEl('line', { x1: PL, x2: PL + iw, y1: Y(0) + .5, y2: Y(0) + .5, stroke: 'var(--border-strong)', 'stroke-width': 1 }));

      geo.forEach(function (g, i) {
        var x = PL + i * step + (step - bw) / 2;
        var top = Math.min(Y(g.from), Y(g.to)), bottom = Math.max(Y(g.from), Y(g.to));
        var h = Math.max(3, bottom - top);
        var isTotal = g.s.kind === 'total';
        var color = isTotal ? (i === geo.length - 1 ? 'var(--m-profit)' : 'var(--m-revenue)')
                            : g.s.value >= 0 ? 'var(--m-profit)' : 'var(--m-cost)';
        var base = isTotal ? 1 : .9;
        var p = svgEl('path', { d: isTotal ? roundTop(x, top, bw, h, 4) : roundRect(x, top, bw, h, 4), fill: color, opacity: base });
        svg.appendChild(p);
        if (i < geo.length - 1) {
          svg.appendChild(svgEl('line', {
            x1: x + bw + 3, x2: PL + (i + 1) * step + (step - bw) / 2 - 3, y1: Y(g.to) + .5, y2: Y(g.to) + .5,
            stroke: 'var(--border-strong)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: .8
          }));
        }
        var vt = isTotal ? tickMoney(g.s.value) : (g.s.value >= 0 ? '+' : '−') + tickMoney(Math.abs(g.s.value)).replace('−', '');
        svg.appendChild(textEl(x + bw / 2, top - 8, vt, { anchor: 'middle', fill: isTotal ? 'var(--text)' : 'var(--text-2)', weight: isTotal ? 700 : 600, tabular: true }));

        /* wrapped category label, at most two lines */
        var words = g.s.label.split(' '), lines = [''], limit = Math.max(8, Math.floor(step / 6.2));
        words.forEach(function (w) {
          if ((lines[lines.length - 1] + ' ' + w).trim().length > limit) lines.push(w);
          else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim();
        });
        lines.slice(0, 2).forEach(function (ln, li) {
          svg.appendChild(textEl(x + bw / 2, PT + ih + 18 + li * 13, ln, { anchor: 'middle',
            fill: isTotal ? 'var(--text)' : 'var(--text-3)', weight: isTotal ? 600 : 450 }));
        });

        var hit = svgEl('rect', { x: PL + i * step, y: PT, width: step, height: ih, fill: 'transparent' });
        hit.addEventListener('mouseenter', function () {
          p.setAttribute('opacity', base * .68);
          tip.innerHTML = '<div class="t-head">' + esc(g.s.label) + '</div>' +
            '<div class="t-row"><span class="t-key">' + (isTotal ? 'Balance' : 'Movement') + '</span><span>' +
            (isTotal ? money(g.s.value) : signed(g.s.value)) + '</span></div>' +
            (isTotal ? '' : '<div class="t-row"><span class="t-key">Running</span><span>' + money(g.to) + '</span></div>') +
            (g.s.note ? '<div class="t-note">' + esc(g.s.note) + '</div>' : '');
          pxTip(tip, wrap, x + bw / 2, 4);
        });
        hit.addEventListener('mouseleave', function () { p.setAttribute('opacity', base); tip.style.opacity = 0; });
        svg.appendChild(hit);
      });
    });
    return wrap;
  }

  /* ---------- segmented composition bar -------------------------------------- */
  function segbar(rows, total, opts) {
    opts = opts || {};
    var wrap = el('<div></div>');
    var bar = el('<div class="segbar" role="img" aria-label="' + esc(opts.aria || 'Composition') + '"></div>');
    var legend = el('<div class="seg-legend"></div>');
    rows.forEach(function (r) {
      var share = total ? r.value / total : 0;
      var seg = el('<div class="seg" style="flex:' + Math.max(share, 0.004) + ' 0 0;background:' + r.color + '" title="' + esc(r.label) + ' · ' + money(r.value) + '"></div>');
      bar.appendChild(seg);
      var row = el('<div class="row"><span class="sw" style="background:' + r.color + '"></span>' +
        '<span class="lb">' + esc(r.label) + '</span><span class="vl">' + money(r.value) + '</span>' +
        '<span class="pc">' + (share * 100).toFixed(1) + '%</span></div>');
      row.addEventListener('mouseenter', function () { seg.style.opacity = .6; });
      row.addEventListener('mouseleave', function () { seg.style.opacity = 1; });
      if (r.onClick) { row.style.cursor = 'pointer'; row.addEventListener('click', r.onClick); }
      legend.appendChild(row);
    });
    wrap.appendChild(bar); wrap.appendChild(legend);
    return wrap;
  }

  /* ---------- horizontal breakdown ------------------------------------------ */
  function breakdown(rows, total) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }));
    var wrap = el('<div class="brk"></div>');
    rows.forEach(function (r) {
      var w = max ? r.value / max * 100 : 0;
      var share = total ? r.value / total * 100 : 0;
      wrap.appendChild(el('<div class="brk-row">' +
        '<span class="brk-lbl">' + esc(r.label) + '</span>' +
        '<span class="bar brk-bar"><span style="width:' + w.toFixed(1) + '%;background:' + (r.color || 'var(--s1)') + '"></span></span>' +
        '<span class="brk-val">' + money(r.value) + '</span>' +
        '<span class="brk-pct">' + share.toFixed(1) + '%</span>' +
        '</div>'));
    });
    return wrap;
  }

  /* ---------- bullet cell (bar behind a number, inside a table) -------------- */
  function bullet(value, max, color, text) {
    var w = max ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
    return '<span class="bullet"><span class="fill" style="width:' + w.toFixed(1) + '%;background:' + (color || 'var(--s1)') + '"></span>' +
      '<span class="val">' + (text || money(value)) + '</span></span>';
  }

  /* ---------- sparkline -----------------------------------------------------
     A monotone Catmull-Rom curve rather than a polyline: the trend reads as a
     shape instead of a zigzag, and the overshoot clamp keeps a spike from
     bulging past its own data point. The area is a two-stop wash so the line
     stays the figure and the fill stays the ground. Points are exposed as
     data attributes so the card can answer a hover with a real value.       */
  function smoothPath(pts) {
    if (pts.length < 3) return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var t = 0.22;                                     /* tension: gentle, never loopy */
      var c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = p1[1] + (p2[1] - p0[1]) * t;
      var c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = p2[1] - (p3[1] - p1[1]) * t;
      /* clamp the control points inside the segment's own y-range so a curve
         never overshoots a local extreme -- an overshoot would draw a value
         the data does not contain */
      var loY = Math.min(p1[1], p2[1]), hiY = Math.max(p1[1], p2[1]);
      c1y = Math.min(hiY, Math.max(loY, c1y)); c2y = Math.min(hiY, Math.max(loY, c2y));
      d += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ',' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) +
           ',' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d;
  }
  function sparkline(values, color, w, h, opts) {
    if (!values || !values.length) return '';
    opts = opts || {};
    var W = w || 300, H = h || 44, PB = 1;
    var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    if (lo === hi) { lo -= 1; hi += 1; }
    var pad = (hi - lo) * 0.18; lo -= pad; hi += pad;
    /* inset the right end so the endpoint dot sits inside the card, not on its edge */
    var RI = 5;
    var X = function (i) { return values.length === 1 ? W / 2 : i * (W - RI) / (values.length - 1); };
    var Y = function (v) { return H - PB - (v - lo) / (hi - lo) * (H - PB * 2 - 4); };
    var pts = values.map(function (v, i) { return [X(i), Y(v)]; });
    var d = smoothPath(pts);
    var id = 'sp' + (++uid);
    var lastX = X(values.length - 1), lastY = Y(values[values.length - 1]);
    var labels = opts.labels || [];
    var data = opts.labels
      ? ' data-spark="' + esc(JSON.stringify({ v: values, l: labels, n: opts.name || '', f: opts.fmt || 'money' })) + '"'
      : '';
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"' + data +
      ' role="img" aria-label="' + esc(opts.aria || 'Trend, last ' + values.length + ' months') + '">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.22"/>' +
      '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      '<path d="' + d + ' L' + W + ' ' + Y(values[values.length - 1]).toFixed(1) + ' L' + W + ' ' + H + ' L0 ' + H + ' Z" fill="url(#' + id + ')"/>' +
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" ' +
      'stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      '<circle cx="' + lastX.toFixed(1) + '" cy="' + lastY.toFixed(1) + '" r="2.6" fill="' + color + '" ' +
      'stroke="var(--layer)" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>';
  }

  /* ---------- data table -----------------------------------------------------
     One component behind every table in the product: sort, in-table search,
     column visibility, density, pagination, sticky header and first column,
     keyboard row navigation, and a pinned totals row. State is remembered per
     table shape, so a re-render does not throw away the reader's sort or page.
     Call signature is unchanged: table(columns, rows, options).            */
  var dtState = {};
  // a density change in Settings applies to tables that are already on screen
  function setDensity(dense) {
    Object.keys(dtState).forEach(function (k) { dtState[k].dense = !!dense; });
  }
  var PAGE_SIZES = [10, 25, 50, 100, 0];

  function stripTags(html) {
    return String(html).replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function table(cols, rows, opts) {
    opts = opts || {};
    var sig = opts.id || cols.map(function (c) { return c.label; }).join('|');
    var stt = dtState[sig];
    if (!stt) {
      stt = dtState[sig] = {
        sortKey: opts.sortKey || null, sortDir: opts.sortDir || -1,
        page: 0, q: '', hidden: {}, dense: !!(root.SET && root.SET.get().density === 'compact'),
        pageSize: opts.pageSize != null ? opts.pageSize : 25
      };
    }
    var searchable = opts.search !== false && rows.length > 8;
    var wrap = el('<div class="dt"></div>');

    function visibleCols() {
      return cols.filter(function (c, i) { return i === 0 || !stt.hidden[c.key]; });
    }

    function draw() {
      wrap.innerHTML = '';
      var vc = visibleCols();
      var sticky = opts.stickyFirst !== false && vc.length > 6;

      /* ---- filter ---- */
      var data = rows;
      if (stt.q) {
        var q = stt.q.toLowerCase();
        data = rows.filter(function (r) {
          if (r.__dtText == null) r.__dtText = stripTags(cols.map(function (c) { return c.cell(r, rows); }).join(' ')).toLowerCase();
          return r.__dtText.indexOf(q) !== -1;
        });
      }

      /* ---- sort ---- */
      if (stt.sortKey) {
        var col = cols.filter(function (c) { return c.key === stt.sortKey; })[0];
        if (col) {
          data = data.slice().sort(function (a, b) {
            var av = col.sortVal ? col.sortVal(a) : a[stt.sortKey];
            var bv = col.sortVal ? col.sortVal(b) : b[stt.sortKey];
            if (typeof av === 'string' || typeof bv === 'string') return stt.sortDir * String(av).localeCompare(String(bv));
            return stt.sortDir * ((av || 0) - (bv || 0));
          });
        }
      }

      /* ---- paginate ---- */
      var total = data.length;
      var size = stt.pageSize || total || 1;
      var pages = Math.max(1, Math.ceil(total / size));
      if (stt.page > pages - 1) stt.page = pages - 1;
      if (stt.page < 0) stt.page = 0;
      var from = stt.pageSize ? stt.page * size : 0;
      var page = stt.pageSize ? data.slice(from, from + size) : data;

      /* ---- toolbar ---- */
      var hideable = cols.filter(function (c, i) { return i > 0 && c.hideable !== false && c.label; });
      var bar = el('<div class="dt-bar"></div>');
      bar.appendChild(el('<span class="count">' + (total === rows.length
        ? total + (total === 1 ? ' row' : ' rows')
        : total + ' of ' + rows.length + ' rows') + '</span>'));
      if (searchable) {
        var sb = el('<label class="search" style="min-width:180px;max-width:280px"><span class="ic">' + icon('search') + '</span>' +
          '<input type="text" placeholder="Filter these rows" value="' + esc(stt.q) + '" aria-label="Filter rows"></label>');
        var si = sb.querySelector('input');
        si.addEventListener('input', function () {
          stt.q = si.value; stt.page = 0; draw();
          var again = wrap.querySelector('.dt-bar input');
          if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        });
        bar.appendChild(sb);
      }
      bar.appendChild(el('<span class="grow"></span>'));
      if (opts.toolbar) bar.appendChild(opts.toolbar);
      var tools = el('<div class="dt-tools"></div>');
      var dens = el('<button class="dt-tool" type="button" aria-pressed="' + stt.dense + '" title="Compact rows">' + icon('rows') + ' Compact</button>');
      dens.addEventListener('click', function () { stt.dense = !stt.dense; draw(); });
      tools.appendChild(dens);
      if (hideable.length) {
        var menu = el('<div class="dt-menu"></div>');
        var mb = el('<button class="dt-tool" type="button" title="Show or hide columns">' + icon('columns') + ' Columns</button>');
        var pop = el('<div class="dt-pop" hidden></div>');
        hideable.forEach(function (c) {
          var lab = el('<label><input type="checkbox"' + (stt.hidden[c.key] ? '' : ' checked') + '>' + esc(c.label) + '</label>');
          lab.querySelector('input').addEventListener('change', function (e) {
            if (e.target.checked) delete stt.hidden[c.key]; else stt.hidden[c.key] = 1;
            draw();
          });
          pop.appendChild(lab);
        });
        mb.addEventListener('click', function (e) { e.stopPropagation(); pop.hidden = !pop.hidden; });
        document.addEventListener('click', function () { if (pop) pop.hidden = true; });
        pop.addEventListener('click', function (e) { e.stopPropagation(); });
        menu.appendChild(mb); menu.appendChild(pop);
        tools.appendChild(menu);
      }
      if (root.EXP && opts.exportable !== false) {
        tools.appendChild(root.EXP.menu(function () {
          var visible = visibleCols().filter(function (c) { return !c.noExport; });
          return root.EXP.fromTable(visible, data, {
            name: opts.exportName || (opts.title || visible[0].label),
            title: opts.title || opts.exportName || 'Table export',
            subtitle: opts.subtitle || '',
            foot: opts.foot ? visible.map(function (c) { return opts.foot[c.key] || ''; }) : null
          });
        }));
      }
      bar.appendChild(tools);
      if (opts.bar !== false) wrap.appendChild(bar);

      /* ---- table ---- */
      // cap the height only when the table is not paginated — otherwise the
      // page size already bounds it and a nested scrollbar just gets in the way
      var scroll = el('<div class="dt-scroll' + (!stt.pageSize && page.length > 18 ? ' capped' : '') + '"></div>');
      var h = '<table class="grid' + (stt.dense ? ' dense' : '') + '"><thead><tr>';
      vc.forEach(function (c, i) {
        var isSorted = stt.sortKey === c.key;
        h += '<th class="' + (c.num ? 'n ' : '') + (c.sortable === false ? '' : 'sortable ') +
          (isSorted ? 'sorted ' : '') + (sticky && i === 0 ? 'stick' : '') + '" data-k="' + esc(c.key) + '"' +
          (c.sortable === false ? '' : ' aria-sort="' + (isSorted ? (stt.sortDir === -1 ? 'descending' : 'ascending') : 'none') + '"') +
          (c.width ? ' style="width:' + c.width + '"' : '') + '>' + esc(c.label) +
          (c.sortable === false ? '' : ' <span class="arrow">' + (isSorted && stt.sortDir === 1 ? '▲' : '▼') + '</span>') + '</th>';
      });
      h += '</tr></thead><tbody>';
      if (!page.length) {
        h += '<tr><td colspan="' + vc.length + '"><div class="empty">' +
          esc(stt.q ? 'Nothing matches “' + stt.q + '”.' : (opts.empty || 'No records for this period.')) + '</div></td></tr>';
      }
      page.forEach(function (r, i) {
        var rc = opts.rowClass ? (opts.rowClass(r) || '') : '';
        h += '<tr class="' + (opts.onRow ? 'clickable' : '') + (rc ? ' ' + rc : '') + '" data-i="' + i + '"' + (opts.onRow ? ' tabindex="0"' : '') + '>';
        vc.forEach(function (c, ci) {
          h += '<td class="' + (c.num ? 'n ' : '') + (stt.sortKey === c.key ? 'sorted ' : '') +
            (sticky && ci === 0 ? 'stick' : '') + '">' + c.cell(r, rows) + '</td>';
        });
        h += '</tr>';
      });
      h += '</tbody>';
      if (opts.foot) {
        h += '<tfoot><tr>';
        vc.forEach(function (c, ci) {
          h += '<td class="' + (c.num ? 'n ' : '') + (sticky && ci === 0 ? 'stick' : '') + '">' +
            (opts.foot[c.key] != null ? opts.foot[c.key] : '') + '</td>';
        });
        h += '</tr></tfoot>';
      }
      h += '</table>';
      scroll.innerHTML = h;
      wrap.appendChild(scroll);

      scroll.querySelectorAll('th.sortable').forEach(function (th) {
        th.addEventListener('click', function () {
          var k = th.dataset.k;
          if (stt.sortKey === k) stt.sortDir = -stt.sortDir; else { stt.sortKey = k; stt.sortDir = -1; }
          draw();
        });
      });
      if (opts.onAction) {
        scroll.querySelectorAll('tbody tr[data-i]').forEach(function (tr) {
          var row = page[+tr.dataset.i];
          tr.querySelectorAll('.row-act').forEach(function (b) {
            b.addEventListener('click', function (ev) {
              ev.stopPropagation();
              opts.onAction(row, b.dataset.act || b.textContent.trim());
            });
          });
        });
      }
      if (opts.onRow) {
        scroll.querySelectorAll('tbody tr.clickable').forEach(function (tr) {
          var row = page[+tr.dataset.i];
          tr.addEventListener('click', function () { opts.onRow(row); });
          tr.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onRow(row); }
            if (e.key === 'ArrowDown' && tr.nextElementSibling) { e.preventDefault(); tr.nextElementSibling.focus(); }
            if (e.key === 'ArrowUp' && tr.previousElementSibling) { e.preventDefault(); tr.previousElementSibling.focus(); }
          });
        });
      }

      /* ---- pagination ---- */
      if (opts.bar !== false && (total > PAGE_SIZES[0] || (stt.pageSize && stt.pageSize !== 25))) {
        var foot = el('<div class="dt-foot"></div>');
        var sizeSel = el('<label style="display:flex;align-items:center;gap:8px">Rows per page <select>' +
          PAGE_SIZES.map(function (n) {
            return '<option value="' + n + '"' + (n === stt.pageSize ? ' selected' : '') + '>' + (n || 'All') + '</option>';
          }).join('') + '</select></label>');
        sizeSel.querySelector('select').addEventListener('change', function (e) {
          stt.pageSize = +e.target.value; stt.page = 0; draw();
        });
        foot.appendChild(sizeSel);
        var right = el('<div style="display:flex;align-items:center;gap:12px"></div>');
        right.appendChild(el('<span class="rng">' + (total ? (from + 1) + '–' + Math.min(from + size, total) : 0) + ' of ' + total + '</span>'));
        var pg = el('<div class="pg"></div>');
        var prev = el('<button type="button" aria-label="Previous page">◀</button>');
        var next = el('<button type="button" aria-label="Next page">▶</button>');
        prev.disabled = !stt.pageSize || stt.page === 0;
        next.disabled = !stt.pageSize || stt.page >= pages - 1;
        prev.addEventListener('click', function () { stt.page--; draw(); });
        next.addEventListener('click', function () { stt.page++; draw(); });
        pg.appendChild(prev);
        pg.appendChild(el('<span style="padding:0 8px" class="rng">' + (stt.pageSize ? (stt.page + 1) + ' / ' + pages : '1 / 1') + '</span>'));
        pg.appendChild(next);
        right.appendChild(pg);
        foot.appendChild(right);
        wrap.appendChild(foot);
      }
    }
    draw();
    return wrap;
  }

  /* ---------- toasts ---------------------------------------------------------
     Stacked, typed and dismissible. Called either as toast(msg, opts) or in
     the older toast(msg, actionLabel, actionFn) form.                       */
  var TOAST_ICON = {
    success: 'M20 6L9 17l-5-5',
    error: 'M12 8v5M12 16.5v.01M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20.4h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    warn: 'M12 8v5M12 16.5v.01M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20.4h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    info: 'M12 16v-5M12 8v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'
  };
  function toastStack() {
    var st = document.querySelector('.toast-stack');
    if (!st) { st = el('<div class="toast-stack" role="status" aria-live="polite"></div>'); document.body.appendChild(st); }
    return st;
  }
  function toast(msg, a, b) {
    var o = (a && typeof a === 'object') ? a : { action: a ? { label: a, fn: b } : null };
    var kind = o.kind || 'info';
    var t = el('<div class="toast ' + kind + '">' +
      '<svg class="t-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="' + TOAST_ICON[kind] + '"/></svg>' +
      '<div class="t-body"><div class="t-msg">' + esc(msg) + '</div>' +
      (o.detail ? '<div class="t-sub">' + esc(o.detail) + '</div>' : '') + '</div>' +
      '<button class="t-x" type="button" aria-label="Dismiss">\u00d7</button></div>');
    if (o.action && o.action.label) {
      var act = el('<button class="t-act" type="button">' + esc(o.action.label) + '</button>');
      act.addEventListener('click', function () { close(); if (o.action.fn) o.action.fn(); });
      t.querySelector('.t-body').appendChild(act);
    }
    var timer = null;
    function close() { clearTimeout(timer); if (t.parentNode) t.parentNode.removeChild(t); }
    t.querySelector('.t-x').addEventListener('click', close);
    t.addEventListener('mouseenter', function () { clearTimeout(timer); });
    t.addEventListener('mouseleave', arm);
    function arm() { clearTimeout(timer); timer = setTimeout(close, o.timeout || (o.action ? 8000 : 4600)); }
    var stack = toastStack();
    while (stack.children.length >= 3) stack.removeChild(stack.firstChild);
    stack.appendChild(t);
    arm();
    return close;
  }

  /* ---------- form primitives -------------------------------------------------
     One field component behind every dialog: label, control, hint, and an
     invalid state that shows the reason under the input it belongs to.      */
  var CARET = '<svg class="caret" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  function field(cfg) {
    var f = el('<div class="fld"></div>');
    var id = 'f' + (++uid);
    f.appendChild(el('<label class="fl-label" for="' + id + '">' + esc(cfg.label) +
      (cfg.required ? '<span class="req" aria-hidden="true">*</span>' : '') + '</label>'));
    var ctl = el('<div class="fl-ctl"></div>');
    if (cfg.prefix) ctl.appendChild(el('<span class="affix">' + esc(cfg.prefix) + '</span>'));
    var input;
    if (cfg.type === 'select') {
      input = el('<select id="' + id + '">' + (cfg.options || []).map(function (o) {
        return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(cfg.value) ? ' selected' : '') + '>' + esc(o.l) + '</option>';
      }).join('') + '</select>');
      ctl.appendChild(input);
      ctl.appendChild(el(CARET));
    } else {
      input = el('<input id="' + id + '" type="' + (cfg.type || 'text') + '"' +
        (cfg.step ? ' step="' + cfg.step + '"' : '') + (cfg.min != null ? ' min="' + cfg.min + '"' : '') +
        (cfg.placeholder ? ' placeholder="' + esc(cfg.placeholder) + '"' : '') +
        ' value="' + esc(cfg.value == null ? '' : cfg.value) + '">');
      ctl.appendChild(input);
    }
    f.appendChild(ctl);
    var hint = el('<div class="fl-hint">' + (cfg.hint || '') + '</div>');
    if (!cfg.hint) hint.hidden = true;
    f.appendChild(hint);

    f.input = input;
    f.value = function () { return input.value; };
    f.setHint = function (html) { hint.innerHTML = html || ''; hint.hidden = !html; };
    f.clear = function () { f.classList.remove('invalid', 'ok'); f.setHint(cfg.hint || ''); };
    f.fail = function (message) {
      f.classList.add('invalid'); f.classList.remove('ok');
      f.setHint(esc(message));
      return false;
    };
    f.pass = function () { f.classList.remove('invalid'); return true; };
    input.addEventListener('input', function () { if (f.classList.contains('invalid')) f.clear(); });
    return f;
  }
  /* The minimum a password must meet, mirroring assert_password_ok() in the
     database. One place for the rule, so the message on screen and the one
     PostgreSQL raises cannot drift apart. */
  var PASSWORD_MIN = 10;

  function formGrid(fields) {
    var g = el('<div class="form-grid"></div>');
    fields.forEach(function (x) { g.appendChild(x); });
    return g;
  }
  function formSection(label) {
    return el('<div class="form-sec"><span class="lb">' + esc(label) + '</span><span class="rule"></span></div>');
  }
  function readout(text) {
    var n = el('<div class="readout">' + (text || '') + '</div>');
    n.set = function (html) { n.innerHTML = html; return n; };
    return n;
  }

  function panel(title, hint, bodyNode, flush, actions) {
    var p = el('<section class="panel"><div class="panel-head"><div><h2>' + esc(title) + '</h2>' +
      (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div><div class="acts"></div></div>' +
      '<div class="panel-body' + (flush ? ' flush' : '') + '"></div></section>');
    if (actions) p.querySelector('.acts').appendChild(actions);
    if (bodyNode) p.querySelector('.panel-body').appendChild(bodyNode);
    return p;
  }

  /* the slice of a person's software share that followed their allocation onto
     projects; the rest sits on internal time or the bench as overhead */
  function toolOnProjects(e) {
    if (!e || !e.toolCost) return 0;
    var pctOn = (e.lines || []).reduce(function (t, l) { return t + (l.projectId ? l.pct : 0); }, 0);
    return e.toolCost * Math.min(100, pctOn) / 100;
  }
  function kpi(label, value, footHtml, lead) {
    return '<div class="kpi' + (lead ? ' lead' : '') + '"><div class="k-label">' + esc(label) + '</div>' +
      '<div class="k-value num">' + value + '</div>' +
      '<div class="k-foot">' + (footHtml || '') + '</div></div>';
  }

  /* ---------- metric card ---------------------------------------------------
     The headline unit of the dashboard. One call renders the whole card, so
     every metric on every screen has the same anatomy: accent-tinted icon,
     small-caps label, the figure at the top of the type scale, a comparison
     line, and a sparkline bled to the card edges. Pass `on` to make the whole
     card a button; pass `tip` and the number explains itself on hover.      */
  var TILE_ICON = { revenue: 'dollar', people: 'users', other: 'pie', cost: 'wallet',
                    profit: 'trend', margin: 'percent' };
  function tile(cfg, value, footHtml, sparkHtml, accent) {
    var o = (cfg && typeof cfg === 'object') ? cfg
      : { label: cfg, value: value, foot: footHtml, spark: sparkHtml, accent: !!accent };
    var kind = o.kind || null;
    var tag = o.on ? 'button' : 'div';
    var cls = 'tile' + (kind ? ' m-' + kind : '') + (o.accent ? ' accent' : '') + (o.on ? ' clickable' : '');
    var ico = o.icon || (kind && TILE_ICON[kind]);
    var h = '<' + tag + ' class="' + cls + '"' + (o.on ? ' type="button"' : '') +
      (o.tip ? ' data-tip="' + esc(o.tip) + '"' : '') + '>' +
      '<div class="t-top">' +
      (ico ? '<span class="t-ico">' + icon(ico) + '</span>' : '') +
      '<span class="t-label">' + esc(o.label) + '</span></div>' +
      '<div class="t-value num">' + o.value + '</div>' +
      '<div class="t-foot">' + (o.foot || '') + '</div>' +
      (o.spark ? '<div class="t-spark">' + o.spark + '</div>' : '') +
      '</' + tag + '>';
    var node = el(h);
    if (o.on) node.addEventListener('click', o.on);
    return node;
  }

  /* ---------- summary strip -------------------------------------------------
     Counts that frame the money. One panel, hairline-divided cells, each with
     a label, a figure and an optional comparison foot.                      */
  function sumStrip(cells) {
    return '<div class="sumstrip">' + cells.map(function (c) {
      return '<div class="sumcell"' + (c.tip ? ' data-tip="' + esc(c.tip) + '"' : '') + '>' +
        '<span class="s-label">' + esc(c.label) + '</span>' +
        '<span class="s-value num">' + c.value + (c.unit ? ' <small>' + esc(c.unit) + '</small>' : '') + '</span>' +
        '<span class="s-foot">' + (c.foot || '') + '</span></div>';
    }).join('') + '</div>';
  }

  /* ---------- insight callout ---------------------------------------------- */
  function insightCard(text, kind, ico) {
    return '<div class="insight' + (kind ? ' ' + kind : '') + '">' +
      '<span class="i-ico">' + icon(ico || 'spark') + '</span>' +
      '<span class="i-body">' + text + '</span></div>';
  }

  /* ---------- empty / error state ------------------------------------------ */
  function emptyState(title, body, actionHtml, ico) {
    return '<div class="state"><span class="s-ico">' + icon(ico || 'info') + '</span>' +
      '<h3>' + esc(title) + '</h3><p>' + body + '</p>' + (actionHtml || '') + '</div>';
  }

  function metric(label, value, footHtml) {
    return '<div class="metric"><div class="m-label">' + esc(label) + '</div>' +
      '<div class="m-value">' + value + '</div><div class="m-foot">' + (footHtml || '') + '</div></div>';
  }
  function hero(label, value, deltaHtml, note, sparkHtml) {
    return '<div class="hero"><div class="h-label">' + esc(label) + '</div>' +
      '<div class="h-value">' + value + '</div>' +
      '<div class="h-row"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' + (deltaHtml || '') +
      '<span class="h-note">' + (note || '') + '</span></div>' + (sparkHtml || '') + '</div></div>';
  }


  /* ---------- hover tooltips -----------------------------------------------
     Any element carrying data-tip gets one. The node is fixed to the viewport
     and appended to <body>, so a table's overflow:auto cannot clip it -- which
     is what makes icon-only buttons usable in a scrolling register.          */
  var tipNode = null, tipTimer = 0;
  function hideTip() { clearTimeout(tipTimer); if (tipNode) tipNode.classList.remove('on'); }
  function showTip(target, html, o) {
    o = o || {};
    var text = html != null ? html : target.getAttribute('data-tip');
    if (!text || !document.body.contains(target)) return;
    if (!tipNode) { tipNode = el('<div class="htip" role="tooltip"></div>'); document.body.appendChild(tipNode); }
    if (o.html) tipNode.innerHTML = text; else tipNode.textContent = text;
    tipNode.dataset.kind = o.kind || 'label';
    tipNode.classList.add('on');
    var r = target.getBoundingClientRect(), t = tipNode.getBoundingClientRect();
    var cx = o.x != null ? o.x : r.left + r.width / 2;
    var left = Math.max(8, Math.min(window.innerWidth - t.width - 8, cx - t.width / 2));
    var top = (o.y != null ? o.y : r.top) - t.height - 8;
    if (top < 8) top = (o.y != null ? o.y : r.bottom) + 12;
    tipNode.style.left = Math.round(left) + 'px';
    tipNode.style.top = Math.round(top) + 'px';
  }
  function tipTarget(e) { return e.target && e.target.closest ? e.target.closest('[data-tip]') : null; }
  if (typeof document !== 'undefined') {
    document.addEventListener('mouseover', function (e) {
      var t = tipTarget(e); if (!t) return;
      clearTimeout(tipTimer); tipTimer = setTimeout(function () { showTip(t); }, 260);
    });
    document.addEventListener('mouseout', function (e) { if (tipTarget(e)) hideTip(); });
    document.addEventListener('focusin', function (e) { var t = tipTarget(e); if (t) showTip(t); });
    document.addEventListener('focusout', hideTip);
    document.addEventListener('click', hideTip, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideTip(); });
    window.addEventListener('scroll', hideTip, true);
    window.addEventListener('resize', hideTip);
  }

  /* ---------- icon ---------------------------------------------------------- */
  function icon(id, cls) {
    return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-' + id + '"></use></svg>';
  }

  root.UI = {
    stackedColumnChart: stackedColumnChart, pivot: pivot,
    money: money, moneyK: moneyK, pct: pct, signed: signed, esc: esc, el: el, setFormat: setFormat,
    deltaChip: deltaChip, band: band, marginPill: marginPill, BANDS: BANDS,
    lineChart: lineChart, columnChart: columnChart, waterfall: waterfall,
    segbar: segbar, breakdown: breakdown, bullet: bullet, sparkline: sparkline,
    table: table, setDensity: setDensity, toast: toast, panel: panel,
    sumStrip: sumStrip, insightCard: insightCard, emptyState: emptyState, toolOnProjects: toolOnProjects,
    icon: icon, hideTip: hideTip, field: field, PASSWORD_MIN: PASSWORD_MIN, formGrid: formGrid, formSection: formSection, readout: readout, kpi: kpi, metric: metric, hero: hero, tile: tile
  };
})(typeof window !== 'undefined' ? window : globalThis);
