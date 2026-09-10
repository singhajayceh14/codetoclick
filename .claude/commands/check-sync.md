---
description: Verify public/index.html really matches the current src/part* files
allowed-tools: Bash(sh build.sh), Bash(cmp:*), Bash(tr:*), Bash(rm:*), Bash(wc:*), Bash(diff:*)
---

Check whether the committed artefact is in step with source. A stale
`public/index.html` is the failure this repo is most exposed to: the app keeps
working, it just silently ships the old code.

Build to a scratch copy and compare — **ignoring line endings**, because the
committed file is CRLF throughout while a fresh build mixes CRLF (from the
parts) and LF (from the shell `echo` lines). That difference is noise, not drift:

```sh
cd src && sh build.sh
tr -d '\r' < app.html > /tmp/built.txt
tr -d '\r' < ../public/index.html > /tmp/shipped.txt
cmp /tmp/built.txt /tmp/shipped.txt && echo IN-SYNC || echo STALE
rm -f app.html /tmp/built.txt /tmp/shipped.txt
```

A raw `cmp` or `diff` without the `tr` will report a difference on an
in-sync repo. Do not conclude the artefact is stale on that evidence alone.

If it reports STALE, say which parts drifted, then run `/build`.
