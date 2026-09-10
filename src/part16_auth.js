/* =============================================================================
   Sign in / sign out — UI ONLY.

   There is no backend yet. This gate decides what the browser shows, not what
   the browser is allowed to have. Anyone can bypass it from the console. It
   exists so the shell, the signed-out state and the sign-out path are real and
   in place; step 3 replaces checkLocally() with a call to /api/login and the
   screen itself does not change.

   Accounts below mirror the four rows seeded by c2c_seed_users_v1.0.sql, so the
   emails and roles you see here are the ones the database will hand back.
============================================================================= */
(function (root) {
  'use strict';
  var U = root.UI, el = U.el, esc = U.esc;

  /* Same four accounts as the database seed. Passwords live here only because
     nothing can verify them yet — the moment /api/login exists, they go. */
  var ACCOUNTS = [
    { email: 'owner@codetoclick.ai',   name: 'Akhil Kaushal',    role: 'owner',   pw: 'ChangeMe!Owner1',   can: 'Everything, including closing and reopening months' },
    { email: 'finance@codetoclick.ai', name: 'Finance Lead',     role: 'finance', pw: 'ChangeMe!Finance1', can: 'Enter and amend any figure, close months' },
    { email: 'manager@codetoclick.ai', name: 'Delivery Manager', role: 'manager', pw: 'ChangeMe!Manager1', can: 'Allocate people, enter revenue and cost' },
    { email: 'viewer@codetoclick.ai',  name: 'Read Only',        role: 'viewer',  pw: 'ChangeMe!Viewer1',  can: 'Read only' }
  ];

  var KEY = 'ctc.session';

  /* localStorage throws in some embedded contexts, so every touch is guarded. */
  function store() { try { return root.localStorage || null; } catch (e) { return null; } }
  function read() {
    var s = store(); if (!s) return null;
    try { var raw = s.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function write(v) {
    var s = store(); if (!s) return;
    try { v ? s.setItem(KEY, JSON.stringify(v)) : s.removeItem(KEY); } catch (e) { }
  }

  var session = read();

  function checkLocally(email, pw) {
    var e = String(email || '').trim().toLowerCase();
    for (var i = 0; i < ACCOUNTS.length; i++) {
      var a = ACCOUNTS[i];
      if (a.email === e && a.pw === pw) return { email: a.email, name: a.name, role: a.role };
    }
    return null;          /* one answer for wrong password and unknown email */
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

      /* A short wait so the pending state is real rather than theatre — the
         API call that replaces this will take about this long. */
      btn.disabled = true;
      btn.innerHTML = '<span class="si-spin" aria-hidden="true"></span>Signing in…';
      var attempt = { email: email.value, pw: pw.value };
      root.setTimeout(function () {
        var who = checkLocally(attempt.email, attempt.pw);
        btn.disabled = false;
        btn.textContent = 'Sign in';
        if (!who) { fail('That email and password do not match an account.'); return; }
        AUTH.signIn(who);
      }, 320);
    });

    /* --- demo accounts: DELETE before this app holds real data ----------- */
    var demo = el('<details class="si-demo"><summary>' +
      '<svg class="ico" viewBox="0 0 24 24"><use href="#i-chevron"></use></svg>Demo accounts</summary></details>');
    var accs = el('<div class="si-accs"></div>');
    ACCOUNTS.forEach(function (a) {
      var b = el('<button type="button" class="si-acc" title="' + esc(a.can) + '">' +
        '<b>' + esc(a.name) + '</b><span>' + esc(a.email) + '</span>' +
        '<span class="rl">' + esc(a.role) + '</span></button>');
      b.addEventListener('click', function () {
        email.value = a.email; pw.value = a.pw; clearErr(); pw.focus();
      });
      accs.appendChild(b);
    });
    demo.appendChild(accs);
    card.appendChild(demo);

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
    /* Who is signed in, or null. */
    user: function () { return session; },
    role: function () { return session ? session.role : null; },

    signIn: function (who) {
      session = who;
      write(session);
      apply();
      if (root.App && root.App.render) root.App.render();
      if (U.toast) U.toast('Signed in as ' + who.name);
      return true;
    },

    signOut: function () {
      session = null;
      write(null);
      apply();
    },

    /* Used by the test harnesses so they enter through the front door
       rather than around it. Grants nothing a console could not already do. */
    devSignIn: function (email) {
      var a = ACCOUNTS.filter(function (x) { return x.email === (email || ACCOUNTS[0].email); })[0] || ACCOUNTS[0];
      return AUTH.signIn({ email: a.email, name: a.name, role: a.role });
    },

    accounts: ACCOUNTS,
    mount: function () { mountMenu(); apply(); }
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
