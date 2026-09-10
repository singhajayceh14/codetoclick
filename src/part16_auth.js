/* =============================================================================
   Sign in / sign out.

   The password is checked by PostgreSQL, not here. This file only collects it,
   posts it to /api/login, and renders whatever the server says. The session
   lives in an httpOnly cookie the page cannot read, so nothing on this page —
   including anything injected into it — can copy a session out.

   On load the page asks /api/me rather than trusting anything stored locally:
   the server decides who is signed in, every time.
============================================================================= */
(function (root) {
  'use strict';
  var U = root.UI, el = U.el, esc = U.esc;

  var session = null;      /* whatever /api/me last told us, or null */
  var ready = false;       /* have we heard back yet? */

  function api(path, opts) {
    return fetch(path, Object.assign({
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin'        /* send the session cookie */
    }, opts || {}));
  }

  function whoAmI() {
    return api('/api/me')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.user ? d.user : null; })
      .catch(function () { return null; });   /* offline or no API: signed out */
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
  }

  /* ---------- the screen --------------------------------------------------- */
  function screen() {
    var wrap = el('<div class="signin" id="signin" hidden></div>');

    wrap.appendChild(el(
      '<section class="si-brand">' +
        '<div class="si-logo">' +
          '<svg class="mk" viewBox="0 0 64 64" aria-hidden="true"><use href="#mark"></use></svg>' +
          '<span><span class="w">Code<span class="to">to</span>Click</span>' +
          '<span class="ws">Profitability Intelligence</span></span>' +
        '</div>' +
        '<div class="si-pitch">' +
          '<h2>Every month, closed and accounted for.</h2>' +
          '<p>Revenue, payroll and licences resolved down to a single margin per project, ' +
             'per client and per company — with the month as the record.</p>' +
          '<ul class="si-points">' +
            '<li><svg class="ico" viewBox="0 0 24 24"><use href="#i-check"></use></svg>' +
              '<span>Allocation-driven people cost, capped at 100%</span></li>' +
            '<li><svg class="ico" viewBox="0 0 24 24"><use href="#i-check"></use></svg>' +
              '<span>Licences split across the team and carried by allocation</span></li>' +
            '<li><svg class="ico" viewBox="0 0 24 24"><use href="#i-check"></use></svg>' +
              '<span>Closed months are immutable — history stays true</span></li>' +
          '</ul>' +
        '</div>' +
        '<div class="si-foot">USD · monthly ledger</div>' +
      '</section>'));

    var panel = el('<section class="si-panel"></section>');
    var card = el('<div class="si-card"></div>');
    card.appendChild(el('<h1>Sign in</h1>'));
    card.appendChild(el('<p class="si-lede">Use your Code to Click account.</p>'));

    var form = el('<form class="si-form" novalidate></form>');

    var err = el('<div class="si-err" role="alert" hidden>' +
      '<svg class="ico" viewBox="0 0 24 24"><use href="#i-info"></use></svg><span></span></div>');
    form.appendChild(err);

    var emailWrap = el('<div></div>');
    emailWrap.appendChild(el('<label class="si-lab" for="si-email">Email</label>'));
    var email = el('<input class="si-in" id="si-email" type="email" name="email" autocomplete="username" ' +
      'placeholder="you@codetoclick.ai" required>');
    emailWrap.appendChild(email);
    form.appendChild(emailWrap);

    var pwWrap = el('<div></div>');
    pwWrap.appendChild(el('<label class="si-lab" for="si-pw">Password</label>'));
    var pwBox = el('<div class="si-pw"></div>');
    var pw = el('<input class="si-in" id="si-pw" type="password" name="password" ' +
      'autocomplete="current-password" placeholder="••••••••••" required>');
    var peek = el('<button type="button" class="si-peek" aria-label="Show password">Show</button>');
    peek.addEventListener('click', function () {
      var showing = pw.type === 'text';
      pw.type = showing ? 'password' : 'text';
      peek.textContent = showing ? 'Show' : 'Hide';
      peek.setAttribute('aria-label', (showing ? 'Show' : 'Hide') + ' password');
      pw.focus();
    });
    pwBox.appendChild(pw); pwBox.appendChild(peek);
    pwWrap.appendChild(pwBox);
    form.appendChild(pwWrap);

    var btn = el('<button class="si-btn" type="submit">Sign in</button>');
    form.appendChild(btn);
    card.appendChild(form);

    function fail(msg) {
      err.querySelector('span').textContent = msg;
      err.hidden = false;
      email.setAttribute('aria-invalid', 'true');
      pw.setAttribute('aria-invalid', 'true');
      pw.value = ''; pw.focus();
    }
    function clearErr() {
      err.hidden = true;
      email.removeAttribute('aria-invalid'); pw.removeAttribute('aria-invalid');
    }
    email.addEventListener('input', clearErr);
    pw.addEventListener('input', clearErr);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      clearErr();
      if (!email.value.trim()) { fail('Enter your email address.'); email.focus(); return; }
      if (!pw.value) { fail('Enter your password.'); return; }

      btn.disabled = true;
      btn.innerHTML = '<span class="si-spin" aria-hidden="true"></span>Signing in…';

      api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.value.trim(), password: pw.value })
      }).then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, data: d }; });
      }).then(function (out) {
        btn.disabled = false; btn.textContent = 'Sign in';
        if (!out.ok || !out.data.user) {
          fail((out.data && out.data.message) || 'That email and password do not match an account.');
          return;
        }
        session = out.data.user;
        AUTH.loadData().then(function () {
          apply();
          if (root.App && root.App.render) root.App.render();
          if (U.toast) U.toast('Signed in as ' + session.name);
        });
      }).catch(function () {
        btn.disabled = false; btn.textContent = 'Sign in';
        fail('Could not reach the server. Check your connection and try again.');
      });
    });

    panel.appendChild(card);
    wrap.appendChild(panel);

    wrap._focus = function () { (email.value ? pw : email).focus(); };
    return wrap;
  }

  /* ---------- account menu in the topbar ---------------------------------- */
  function mountMenu() {
    var btn = document.getElementById('profile-btn');
    if (!btn || btn._acctReady) return;
    btn._acctReady = true;

    var host = el('<div class="acct"></div>');
    btn.parentNode.insertBefore(host, btn);
    host.appendChild(btn);
    var pop = el('<div class="acct-pop" role="menu" hidden></div>');
    host.appendChild(pop);

    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');

    function close() { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    function fill() {
      if (!session) { pop.innerHTML = ''; return; }
      pop.innerHTML =
        '<div class="acct-who"><div class="nm">' + esc(session.name) + '</div>' +
        '<div class="em">' + esc(session.email) + '</div>' +
        '<span class="rl">' + esc(session.role) + '</span></div>';
      var out = el('<button type="button" class="acct-item danger">' +
        '<svg class="ico" viewBox="0 0 24 24"><use href="#i-x"></use></svg>Sign out</button>');
      out.addEventListener('click', function () { close(); AUTH.signOut(); });
      pop.appendChild(out);
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!session) return;
      var open = pop.hidden;
      if (open) fill();
      pop.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (e) { if (!host.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    host._close = close;
    AUTH._menu = { fill: fill, close: close, btn: btn };
  }

  /* ---------- gate --------------------------------------------------------- */
  var gate = null;
  function ensure() {
    if (!gate) { gate = screen(); document.body.appendChild(gate); }
    return gate;
  }

  function apply() {
    var app = document.querySelector('.app');
    ensure();
    if (!ready) { gate.hidden = true; if (app) app.hidden = true; return; }
    if (session) {
      gate.hidden = true;
      if (app) app.hidden = false;
      var btn = document.getElementById('profile-btn');
      if (btn) {
        btn.textContent = initials(session.name);
        btn.setAttribute('aria-label', session.name + ' — account menu');
        btn.setAttribute('data-tip', session.name + ' · ' + session.role);
      }
      if (AUTH._menu) AUTH._menu.fill();
    } else {
      gate.hidden = false;
      if (app) app.hidden = true;
      if (gate._focus) gate._focus();
    }
  }

  var AUTH = {
    /* Who is signed in, or null. Display only — the server decides access. */
    user: function () { return session; },
    role: function () { return session ? session.role : null; },

    signOut: function () {
      api('/api/logout', { method: 'POST' })
        .catch(function () { })            /* revoke server-side, best effort */
        .then(function () {
          session = null;
          if (root.CTC && root.CTC.clearAll) { root.CTC.syncState.on = false; root.CTC.clearAll(); }
          apply();
        });
    },

    /* Ask the server who we are, then show the app or the gate. */
    refresh: function () {
      return whoAmI().then(function (u) {
        session = u;
        if (!u) { ready = true; apply(); return null; }
        return AUTH.loadData().then(function () {
          ready = true; apply();
          if (root.App && root.App.render) root.App.render();
          return u;
        });
      });
    },

    /* Pull this organization's records from the database into the working copy. */
    loadData: function () {
      var C = root.CTC;
      if (!C || !C.loadFromServer) return Promise.resolve(false);
      return C.loadFromServer();
    },

    /* Test-harness entry: the suites run from a file:// page with no API, so
       they set the display state directly. Grants nothing — every endpoint
       checks the cookie server-side regardless of what this says. */
    devSignIn: function (who) {
      session = who || { email: 'owner@codetoclick.ai', name: 'Akhil Kaushal', role: 'owner' };
      ready = true; apply();
      return true;
    },

    mount: function () {
      mountMenu();
      apply();            /* nothing visible while we ask */

      /* A refused write must never leave the screen disagreeing with the
         database: say what happened, then reload from the server. */
      if (root.CTC && root.CTC.syncState) {
        root.CTC.syncState.onError = function (msg, status) {
          if (status === 401) { session = null; apply(); return; }
          if (U.toast) U.toast(msg, { kind: 'error' });
          AUTH.loadData().then(function () {
            if (root.App && root.App.render) root.App.render();
          });
        };
      }
      AUTH.refresh();
    }
  };

  root.AUTH = AUTH;
  if (root.App) root.App.auth = AUTH;

  /* This file is the last script on the page, so the shell already exists. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', AUTH.mount);
  } else {
    AUTH.mount();
  }
})(window);
