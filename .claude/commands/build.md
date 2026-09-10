---
description: Rebuild public/index.html from the src/part* files and verify the result
allowed-tools: Bash(npm run build), Bash(git status:*), Bash(git diff:*), Bash(head:*), Bash(ls:*)
---

Rebuild the shipped artefact from source:

```sh
npm run build
```

That runs `src/build.sh` from inside `src/` — the only place it works, because it
`cat`s the parts by relative path — then copies the result over
`public/index.html`. **`sh src/build.sh` on its own is not the build**: it writes
`src/app.html` and stops, so the change appears to have worked while nothing
reaches the browser.

Then confirm the artefact actually changed:

```sh
git status --short public/index.html
git diff --stat public/index.html
```

Notes before you report success:

- Part order is fixed in `build.sh`: `part2_data.js` defines `window.CTC` before
  anything uses it, and `part16_auth.js` is last because it mounts the gate.
- `build.sh` wraps the parts in a real document — doctype, `lang`, charset and
  the viewport meta. Do not "simplify" that away: without the doctype the whole
  app renders in quirks mode, and without the viewport meta a phone assumes a
  ~980px wide viewport. It shipped without both for a long time.
- `public/**` is not deny-listed any more, because a path rule blocks the
  build's own copy too. Build it; never hand-edit it.

Report which `src/part*` files changed since the last build, and confirm
`public/index.html` now differs from HEAD.
