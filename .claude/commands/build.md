---
description: Rebuild public/index.html from the src/part* files and verify the result
allowed-tools: Bash(sh build.sh), Bash(cp:*), Bash(rm:*), Bash(cmp:*), Bash(wc:*), Bash(ls:*), Bash(git status:*)
---

Rebuild the shipped artefact from source. `src/build.sh` does **not** write
`public/index.html` — it writes `src/app.html`, and the copy is a separate step
that is easy to forget. Forgetting it means the change silently does nothing.

Run exactly this, from the repo root:

```sh
cd src && sh build.sh; cp app.html ../public/index.html && rm -f app.html test-page.html
```

Then confirm the artefact actually changed:

```sh
git status --short public/index.html
```

Notes before you report success:

- The `python3` block at the end of `build.sh` **fails on Windows** with a
  `cp1252` decode error on the em-dashes in the source. That is expected and
  harmless here: `app.html` is already written by the time it runs, and
  `test-page.html` is only a local preview. Do not report the build as broken
  because of it.
- `sh build.sh` must run from inside `src/` — it `cat`s the parts by relative
  path and produces a truncated file from anywhere else.
- Part order is fixed and matters: `part2_data.js` defines `window.CTC` before
  anything uses it, and `part16_auth.js` is last because it mounts the gate.
- `public/**` is deny-listed for the Edit and Write tools on purpose. Build and
  copy it; never hand-edit it.

Report which `src/part*` files changed since the last build, and confirm
`public/index.html` now differs from HEAD.
