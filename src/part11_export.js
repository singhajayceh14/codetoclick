/* ============================================================================
   Export.

   Three destinations, one code path per table:
     · Excel        — a UTF-8 CSV with real numbers in the numeric columns,
                      so Excel sums them instead of treating them as text.
     · PDF          — a typeset document: branded header, title block, the
                      table with repeating headers and a bold totals row,
                      margin figures coloured by band, page numbers.
     · Clipboard    — an HTML table on the clipboard, so a paste into Excel
                      or Sheets keeps the headers, alignment and colours.

   Saving a file goes through the viewer's download prompt, which can be
   declined or unavailable; every path handles that rather than assuming.
   ========================================================================== */
(function (root) {
  'use strict';
  var C = root.CTC, U = root.UI, H = root.VIEWHELP;
  var esc = U.esc, el = U.el;

  /* ---------- the download capability, resolved once ----------------------- */
  var ns; // undefined = still resolving, null = unavailable
  function ensure() {
    if (ns !== undefined) return Promise.resolve(ns);
    if (!root.claude || typeof root.claude.use !== 'function') { ns = null; return Promise.resolve(null); }
    return root.claude.use('downloads').then(function (x) { ns = x || null; return ns; },
      function () { ns = null; return ns; });
  }
  var MSG = {
    declined: 'Save cancelled.',
    unavailable: 'Saving files is not available in this view. Use “Copy for Excel” instead.',
    not_granted: 'Saving files is not available in this view. Use “Copy for Excel” instead.',
    capability_disabled: 'Saving files is not available in this view.',
    capability_removed: 'Saving files is not available in this view.',
    too_large: 'That export is over the 16 MB limit — narrow the period or filter the rows first.',
    rate_limited: 'A save prompt is already open. Finish that one first.',
    rejected_extension: 'That file type cannot be saved from here.',
    extension_not_enabled: 'That file type is not available in this view.',
    bad_request: 'Nothing to export.'
  };
  function browserSave(filename, data) {
    var type = /\.pdf$/i.test(filename) ? 'application/pdf'
      : /\.csv$/i.test(filename) ? 'text/csv;charset=utf-8'
      : /\.json$/i.test(filename) ? 'application/json' : 'application/octet-stream';
    var blob = new Blob([data], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return Promise.resolve();
  }
  function save(filename, data) {
    return ensure().then(function (d) {
      if (!d) return browserSave(filename, data);
      return d.save({ filename: filename, data: data });
    }).then(function () {
      U.toast('Saved ' + filename);
    }, function (e) {
      var code = (e && e.code) || 'unavailable';
      U.toast(MSG[code] || MSG.unavailable);
    });
  }

  /* ---------- turning a rendered table into data --------------------------- */
  // A cell can hold two facts stacked in blocks (a project and its client);
  // flatten those to "a · b" rather than running the words together, and turn
  // decorative status glyphs into plain signs a spreadsheet can read.
  function stripTags(html) {
    return String(html)
      .replace(/<(?:div|p|h[1-6])\b[^>]*>/gi, '\u0001')
      .replace(/<\/(?:div|p|h[1-6])>|<br\s*\/?>/gi, '\u0001')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\u2191/g, '+').replace(/\u2193/g, '-')
      .replace(/[\u25cf\u25b2\u25bc\u2713\u2717\u2715\u26a0\u21e7\u21e9\u25b8\u25be\u2193\u2191]/g, '')
      .replace(/[ \t]+/g, ' ')
      .split('\u0001').map(function (x) { return x.trim(); }).filter(Boolean).join(' \u00b7 ')
      .replace(/\s+/g, ' ').trim();
  }
  function numberOf(text) {
    var t = String(text).replace(/[−–]/g, '-');
    var neg = /^-/.test(t) || /\(.*\)/.test(t);
    var n = parseFloat(t.replace(/[^0-9.\-]/g, ''));
    if (isNaN(n)) return null;
    if (/%$/.test(t.trim())) n = n; // percentages export as written
    return neg && n > 0 ? -n : n;
  }
  // spec: {name, title, subtitle, cols:[{label,num}], rows:[[cell,...]], foot:[]}
  function fromTable(cols, rows, opts) {
    opts = opts || {};
    return {
      name: opts.name || 'export',
      title: opts.title || 'Export',
      subtitle: opts.subtitle || '',
      cols: cols.map(function (c) { return { label: c.label || '', num: !!c.num }; }),
      rows: rows.map(function (r) { return cols.map(function (c) { return stripTags(c.cell(r, rows)); }); }),
      foot: opts.foot || null
    };
  }

  /* ---------- CSV ---------------------------------------------------------- */
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(spec) {
    var S = root.SET ? root.SET.get() : { currency: 'USD' };
    var out = [];
    out.push(csvCell(spec.title));
    if (spec.subtitle) out.push(csvCell(spec.subtitle));
    out.push(csvCell('Amounts in ' + S.currency + ' · exported ' + new Date().toLocaleString()));
    out.push('');
    out.push(spec.cols.map(function (c) { return csvCell(c.label); }).join(','));
    spec.rows.forEach(function (r) {
      out.push(r.map(function (v, i) {
        if (!spec.cols[i].num) return csvCell(v);
        var n = numberOf(v);
        return n == null ? csvCell(v) : n;
      }).join(','));
    });
    if (spec.foot) out.push(spec.foot.map(function (v, i) {
      if (!spec.cols[i] || !spec.cols[i].num) return csvCell(stripTags(v || ''));
      var n = numberOf(stripTags(v || ''));
      return n == null ? csvCell(stripTags(v || '')) : n;
    }).join(','));
    return '﻿' + out.join('\r\n');   // BOM so Excel reads UTF-8
  }
  function exportCSV(spec) { return save(slug(spec.name) + '.csv', toCSV(spec)); }

  /* ---------- clipboard, formatted for a spreadsheet ----------------------- */
  function toHTMLTable(spec) {
    var h = '<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt">';
    h += '<tr><td colspan="' + spec.cols.length + '" style="font-size:14pt;font-weight:700;padding:6px 8px">' + esc(spec.title) + '</td></tr>';
    if (spec.subtitle) h += '<tr><td colspan="' + spec.cols.length + '" style="color:#525252;padding:0 8px 8px">' + esc(spec.subtitle) + '</td></tr>';
    h += '<tr>' + spec.cols.map(function (c) {
      return '<th style="background:#e8e8e8;border:1px solid #c6c6c6;padding:6px 8px;text-align:' +
        (c.num ? 'right' : 'left') + ';font-weight:700">' + esc(c.label) + '</th>';
    }).join('') + '</tr>';
    spec.rows.forEach(function (r, i) {
      h += '<tr>' + r.map(function (v, ci) {
        return '<td style="border:1px solid #d7dde5;padding:5px 8px;text-align:' +
          (spec.cols[ci].num ? 'right' : 'left') + ';background:' + (i % 2 ? '#f7f7f7' : '#ffffff') + '">' + esc(v) + '</td>';
      }).join('') + '</tr>';
    });
    if (spec.foot) h += '<tr>' + spec.cols.map(function (c, ci) {
      return '<td style="border-top:2px solid #8d8d8d;padding:6px 8px;font-weight:700;text-align:' +
        (c.num ? 'right' : 'left') + '">' + esc(stripTags(spec.foot[ci] || '')) + '</td>';
    }).join('') + '</tr>';
    return h + '</table>';
  }
  function copyForExcel(spec) {
    var html = toHTMLTable(spec);
    var text = [spec.cols.map(function (c) { return c.label; }).join('\t')]
      .concat(spec.rows.map(function (r) { return r.join('\t'); })).join('\n');
    var done = function () { U.toast('Copied — paste into Excel or Sheets to keep the formatting.'); };
    if (root.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      navigator.clipboard.write([new root.ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      })]).then(done, function () { navigator.clipboard.writeText(text).then(done, function () { U.toast('Could not reach the clipboard.'); }); });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done, function () { U.toast('Could not reach the clipboard.'); });
    } else U.toast('Could not reach the clipboard.');
  }

  /* ---------- PDF ---------------------------------------------------------- */
  var INK = [22, 22, 22], SOFT = [82, 82, 82], MUTE = [111, 111, 111],
    RULE = [198, 198, 198], HEAD = [232, 232, 232], ZEBRA = [247, 247, 247],
    BLUE = [15, 98, 254], OK = [14, 96, 39], WARN = [142, 106, 0], BAD = [162, 25, 31];

  function pdfAvailable() { return !!(root.jspdf && root.jspdf.jsPDF); }

  // the built-in PDF fonts are WinAnsi; anything outside it prints as garbage,
  // so fold those few glyphs to safe equivalents on the way in
  var PDF_MAP = [[/\u2212/g, '-'], [/\u20b9/g, 'Rs '], [/\u2192/g, '->'], [/\u2713/g, 'v'],
  [/\u2717|\u2715/g, 'x'], [/\u25b2/g, '^'], [/\u25bc/g, 'v'], [/\u25cf/g, '*'],
  [/\u26a0/g, '!'], [/\u2264/g, '<='], [/\u2265/g, '>='], [/\u2009|\u00a0/g, ' ']];
  function pdfSafe(v) {
    var t = String(v == null ? '' : v);
    PDF_MAP.forEach(function (m) { t = t.replace(m[0], m[1]); });
    return t;
  }
  function safeSpec(spec) {
    return {
      name: spec.name, landscape: spec.landscape,
      title: pdfSafe(spec.title), subtitle: pdfSafe(spec.subtitle),
      kpis: (spec.kpis || []).map(function (k) { return { label: pdfSafe(k.label), value: pdfSafe(k.value) }; }),
      cols: spec.cols, rows: (spec.rows || []).map(function (r) { return r.map(pdfSafe); }),
      foot: spec.foot ? spec.foot.map(function (v) { return pdfSafe(stripTags(v || '')); }) : null,
      heading: spec.heading ? pdfSafe(spec.heading) : null,
      text: spec.text ? pdfSafe(spec.text) : null
    };
  }

  function newDoc(landscape) {
    return new root.jspdf.jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  }
  function chrome(doc, spec) {
    var W = doc.internal.pageSize.getWidth();
    var M = 40;
    // wordmark, drawn in three runs so "to" carries the brand colour
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    var x = M;
    doc.setTextColor.apply(doc, INK); doc.text('Code', x, 44); x += doc.getTextWidth('Code');
    doc.setTextColor.apply(doc, BLUE); doc.setFont('helvetica', 'normal');
    doc.text('to', x, 44); x += doc.getTextWidth('to');
    doc.setTextColor.apply(doc, INK); doc.setFont('helvetica', 'bold');
    doc.text('Click', x, 44);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, MUTE);
    doc.text('Profitability Intelligence', W - M, 44, { align: 'right' });
    doc.setDrawColor.apply(doc, RULE); doc.setLineWidth(0.7);
    doc.line(M, 52, W - M, 52);
    return M;
  }
  function footer(doc, note) {
    var W = doc.internal.pageSize.getWidth(), Hh = doc.internal.pageSize.getHeight(), M = 40;
    var n = doc.internal.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor.apply(doc, RULE); doc.setLineWidth(0.5);
      doc.line(M, Hh - 34, W - M, Hh - 34);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, MUTE);
      doc.text(note, M, Hh - 22);
      doc.text('Page ' + i + ' of ' + n, W - M, Hh - 22, { align: 'right' });
    }
  }
  function titleBlock(doc, spec, y) {
    var W = doc.internal.pageSize.getWidth(), M = 40;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor.apply(doc, INK);
    doc.text(spec.title, M, y);
    y += 16;
    if (spec.subtitle) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, SOFT);
      doc.splitTextToSize(spec.subtitle, W - M * 2).forEach(function (ln) { doc.text(ln, M, y); y += 12; });
    }
    return y + 8;
  }
  function kpiBand(doc, items, y) {
    if (!items || !items.length) return y;
    var W = doc.internal.pageSize.getWidth(), M = 40;
    var w = (W - M * 2) / items.length;
    doc.setDrawColor.apply(doc, RULE); doc.setLineWidth(0.5);
    doc.rect(M, y, W - M * 2, 42);
    items.forEach(function (it, i) {
      var x = M + i * w;
      if (i) doc.line(x, y, x, y + 42);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, MUTE);
      doc.text(String(it.label), x + 10, y + 15);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor.apply(doc, INK);
      doc.text(String(it.value), x + 10, y + 33);
    });
    return y + 58;
  }
  function tableInto(doc, spec, y) {
    var marginCol = -1;
    spec.cols.forEach(function (c, i) { if (/margin/i.test(c.label)) marginCol = i; });
    var colStyles = {};
    spec.cols.forEach(function (c, i) { if (c.num) colStyles[i] = { halign: 'right' }; });
    doc.autoTable({
      startY: y,
      head: [spec.cols.map(function (c) { return c.label; })],
      body: spec.rows,
      foot: spec.foot ? [spec.foot.map(function (v) { return stripTags(v || ''); })] : undefined,
      theme: 'grid',
      margin: { left: 40, right: 40, bottom: 48 },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 5, lineColor: [223, 227, 234], lineWidth: 0.4, textColor: INK },
      headStyles: { fillColor: HEAD, textColor: INK, fontStyle: 'bold', fontSize: 8, lineColor: RULE },
      footStyles: { fillColor: [244, 244, 244], textColor: INK, fontStyle: 'bold', lineColor: RULE },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles: colStyles,
      didParseCell: function (d) {
        if (d.section === 'body' && d.column.index === marginCol) {
          var n = numberOf(d.cell.raw);
          if (n != null) {
            d.cell.styles.textColor = n < 0 ? BAD : n < (U.BANDS.watch * 100) ? BAD : n < (U.BANDS.healthy * 100) ? WARN : OK;
            d.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });
    return doc.lastAutoTable.finalY;
  }
  function exportPDF(spec) {
    if (!pdfAvailable()) { U.toast('The PDF renderer did not load in this view. Excel (CSV) and Copy for Excel still work.'); return; }
    var S = root.SET ? root.SET.get() : { currency: 'USD' };
    var safe = safeSpec(spec);
    var landscape = spec.landscape != null ? spec.landscape : spec.cols.length > 6;
    var doc = newDoc(landscape);
    chrome(doc, safe);
    var y = titleBlock(doc, safe, 78);
    y = kpiBand(doc, safe.kpis, y);
    tableInto(doc, safe, y);
    footer(doc, pdfSafe('Code to Click · Confidential · Amounts in ' + S.currency + ' · Generated ' + new Date().toLocaleDateString()));
    return save(slug(spec.name) + '.pdf', doc.output('arraybuffer'));
  }

  /* a multi-section document, used by the management report */
  function exportDocument(d) {
    if (!pdfAvailable()) { U.toast('The PDF renderer did not load in this view. Excel (CSV) and Copy for Excel still work.'); return; }
    var S = root.SET ? root.SET.get() : { currency: 'USD' };
    var doc = newDoc(false), M = 40, W = doc.internal.pageSize.getWidth();
    var top = safeSpec(d);
    chrome(doc, top);
    var y = titleBlock(doc, top, 78);
    y = kpiBand(doc, top.kpis, y);
    d.sections.map(safeSpec).forEach(function (sec) {
      if (y > doc.internal.pageSize.getHeight() - 150) { doc.addPage(); chrome(doc, top); y = 78; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor.apply(doc, INK);
      doc.text(sec.heading, M, y); y += 6;
      doc.setDrawColor.apply(doc, RULE); doc.line(M, y, W - M, y); y += 14;
      if (sec.text) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, SOFT);
        doc.splitTextToSize(sec.text, W - M * 2).forEach(function (ln) { doc.text(ln, M, y); y += 13; });
        y += 8;
      }
      if (sec.cols && sec.rows && sec.rows.length) { y = tableInto(doc, sec, y) + 22; }
    });
    footer(doc, pdfSafe('Code to Click · Confidential · Amounts in ' + S.currency + ' · Generated ' + new Date().toLocaleDateString()));
    return save(slug(d.name) + '.pdf', doc.output('arraybuffer'));
  }

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'export';
  }

  /* ---------- the export control ------------------------------------------- */
  function menu(getSpec, label) {
    var wrap = el('<div class="dt-menu"></div>');
    var b = el('<button class="dt-tool" type="button" title="Export this table">' + U.icon('download') + ' ' + esc(label || 'Export') + '</button>');
    var pop = el('<div class="dt-pop" hidden style="min-width:250px"></div>');
    [
      ['Excel (.csv)', 'Opens straight in Excel, numbers stay numbers', function (sp) { exportCSV(sp); }],
      ['PDF document', 'Typeset, with headers, totals and page numbers', function (sp) { exportPDF(sp); }],
      ['Copy for Excel', 'Paste keeps headers, alignment and colour', function (sp) { copyForExcel(sp); }]
    ].forEach(function (item) {
      var row = el('<button class="exp-item" type="button"><span>' + esc(item[0]) + '</span><small>' + esc(item[1]) + '</small></button>');
      row.addEventListener('click', function (e) {
        e.stopPropagation(); pop.hidden = true;
        item[2](getSpec());
      });
      pop.appendChild(row);
    });
    b.addEventListener('click', function (e) { e.stopPropagation(); pop.hidden = !pop.hidden; });
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { pop.hidden = true; });
    wrap.appendChild(b); wrap.appendChild(pop);
    return wrap;
  }

  root.EXP = {
    menu: menu, fromTable: fromTable, exportCSV: exportCSV, exportPDF: exportPDF, saveFile: save,
    exportDocument: exportDocument, copyForExcel: copyForExcel, stripTags: stripTags,
    available: ensure, pdfAvailable: pdfAvailable
  };
  ensure();
})(typeof window !== 'undefined' ? window : globalThis);
