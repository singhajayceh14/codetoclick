---
name: frontend-ui
description: Build or change UI in this app — screens, tables, cards, charts, styling, dark mode, responsive fixes. Read this BEFORE writing any markup, CSS, or view code, and before applying advice from a general UI plugin. Covers the vanilla-JS part file idiom, the token system, the shared UI helpers, and the checks a UI change must pass.
---

# Building UI in Code to Click

## First: the general UI plugins do not apply here

Three UI plugins are enabled globally (`frontend-design`, `ui-ux-pro-max`,
`ui-ux-design-pro`). They assume React + TypeScript + Tailwind + shadcn/ui +
Radix + Motion. **This project has none of those.** It is vanilla ES5-style
JavaScript in IIFE modules, hand-written CSS with custom properties, and no
build step beyond `cat`.

Their taste and accessibility reasoning is still worth reading. Their code is
not — a shadcn `<Dialog>` or a `className="flex gap-4"` cannot be pasted into
this repo. Translate the idea into the idiom below, or do not use it.

## Where UI lives

Edit `src/part*.{js,html}`. Never `public/index.html` — it is the built
artefact, it is 583KB, and a hand-edit is erased by the next build. `Edit` is
deny-listed on `public/**` for this reason.

| File | What it holds |
|---|---|
| `part1_head.html` | all CSS — tokens, components, dark theme, responsive |
| `part7_body.html` | the page shell |
| `part3_ui.js` | shared helpers: formatting, tables, cards, bands (`root.UI`) |
| `part4_views.js`, `part5_views2.js` | screens |
| `part15_profitability.js` | the richest screen — **read it first as the worked example** |

After any edit run `/build`, or the change does nothing.

## The module idiom

Every part is an IIFE that takes the global and hangs a namespace on it:

```js
(function (root) {
  'use strict';
  var C = root.CTC, U = root.UI, V = root.VIEWS, H = root.VIEWHELP;
  var money = U.money, moneyK = U.moneyK, pct = U.pct, esc = U.esc, el = U.el;
  var head = H.head, btn = H.btn, frag = H.frag, section = H.section;
  // ...
  root.MYVIEW = { render: render };
}(window));
```

`part2_data.js` defines `window.CTC` and must load first; `part16_auth.js` is
last. The order is fixed in `src/build.sh` — do not reorder it.

## Never hand-roll what `UI` already gives you

From `src/part3_ui.js`:

| Helper | Use for |
|---|---|
| `U.money(n)` | full amount — `$1,234`, minus sign is `−` (U+2212), not `-` |
| `U.moneyK(n)` | compact — `$1.2K`, `$3.40M`; respects the org's scale setting |
| `U.pct(n, dp)` | a **fraction** to a percent — `U.pct(0.35)` is `35.0%` |
| `U.signed(n)` | `+$500` / `−$500` |
| `U.esc(s)` | **every** interpolated string, without exception |
| `U.el(html)` | HTML string to a real element |
| `U.band(margin)` | margin to `{key, cls, label, glyph}` |
| `U.marginPill(m)` | the standard margin badge |
| `U.deltaChip(cur, prev, {points, inverse})` | period-on-period change |
| `U.insightCard(text, tone, kind)` | the callout card |
| `U.table(...)` | every table — see below |

Writing a second money formatter, a second margin threshold, or a second
percent helper is the most common way this codebase gets inconsistent.

### Rendering

Build an HTML string, escape every value, hand it to `el()`:

```js
var row = el('<button type="button" class="quad-row">' +
  '<span>' + esc(c.name) + '</span>' +
  '<span class="mono muted">' + moneyK(c.revenue) + '</span>' +
  U.marginPill(c.margin) + '</button>');
```

`esc()` is not decorative. Client, project and employee names are user input
that reaches the DOM as markup.

### Tables

Column descriptors, not hand-written `<tr>`s. Always supply `empty:` — a table
with no rows must say why in plain words, naming the period:

```js
U.table(rows, [
  { key: 'name', label: 'Project',
    cell: function (x) { return '<strong class="link">' + esc(x.name) + '</strong>'; } },
  { key: 'margin', label: 'Margin', cell: function (x) { return U.marginPill(x.margin); } }
], { empty: 'No billable project was active in ' + esc(d.p.label) + '.' });
```

## Colour is semantic — never decorative

`src/part1_head.html` defines one token per column in the reporting vocabulary.
Use the token that matches the figure's meaning:

| Token | Column |
|---|---|
| `--m-revenue` | Revenue |
| `--m-people` | Employee cost / Contribution after people |
| `--m-other` | Other cost |
| `--m-cost` | total cost |
| `--m-profit` | Profit |
| `--m-margin` | Margin |

Each has a `-bg` companion. `--ok` / `--warn` / `--err` carry state, and
`--s1`..`--s5` are the categorical series for charts. **Never write a hex
literal in a view file.** If no token fits, add one to `part1_head.html` in all
three theme blocks — not a one-off colour at the call site.

Margin bands drive colour and are fixed at `BANDS = { healthy: 0.35, watch: 0.20 }`
(`part3_ui.js:57`), mirroring the org config in the database. Below 0 is
"Loss making". Call `U.band()`; never re-test the thresholds inline.

## Dark mode: three states, all three required

The theming is already correct — match it rather than inventing a fourth path:

```css
:root { --thing: #4f46e5; }                                    /* light default */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --thing: #818cf8; }        /* system dark */
}
:root[data-theme="dark"] { --thing: #818cf8; }                 /* explicit toggle */
```

A token defined in only one of the three breaks either the toggle or the system
default. Add every new token to all three.

## Before you call a UI change done

`CLAUDE.md` §7 lists a real harness. Run all of it — it currently passes clean,
so any failure is yours:

- `smoke.js` — every route renders
- `respaudit.js` — no horizontal overflow at any width
- `darkresp.js` — dark theme at every width
- `contrast.js` — WCAG AA on every text pair
- `admintest.js`, `formtest.js`

Then `/build`, and confirm `public/index.html` actually changed.

## Checklist

- [ ] Edited `src/part*`, not `public/index.html`
- [ ] Used `U.*` helpers; no second formatter or threshold
- [ ] `esc()` on every interpolated value
- [ ] Tokens only, no hex literals; new tokens in all three theme blocks
- [ ] Table has an `empty:` message naming the period
- [ ] Exact column vocabulary from `CLAUDE.md` §1
- [ ] Ran the harness; ran `/build`
