/*
 * I-Kiribati Help – admin page.
 * Talks to the Apps Script API. The session token is kept in sessionStorage
 * (cleared when the browser tab is closed) and sent in the request body, never in the URL.
 */
(function () {
  'use strict';

  var CONFIG = window.IKH_CONFIG || {};
  var TOKEN_KEY = 'ikh:adminToken';
  var state = { services: [], categories: [], islands: [], tab: 'reports', reportStatus: 'open' };

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    for (var k in attrs || {}) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) return c.forEach(function (x) { add(el, x); });
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function token() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  function status(msg, kind) { var el = $('admin-status'); el.textContent = msg || ''; el.className = 'form-status ' + (kind || ''); }
  function toast(msg) {
    var el = $('toast'); el.textContent = msg; el.hidden = false;
    setTimeout(function () { el.hidden = true; }, 3000);
  }

  function call(action, payload) {
    if (!/^https:\/\//.test(CONFIG.API_URL || '')) return Promise.reject(new Error('API_URL is not set in js/config.js'));
    payload = payload || {};
    if (action !== 'adminLogin') payload.token = token();
    return fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res.ok) {
        if (res.code === 'unauthorized' && action !== 'adminLogin') { setToken(''); showLogin('Session expired. Please log in again.'); }
        throw new Error(res.error || 'Request failed');
      }
      return res.data;
    });
  }

  // ---------- views ----------
  function showLogin(msg) {
    $('login-view').hidden = false;
    $('app-view').hidden = true;
    $('logout').hidden = true;
    $('login-status').textContent = msg || '';
    $('password').focus();
  }

  function showApp() {
    $('login-view').hidden = true;
    $('app-view').hidden = false;
    $('logout').hidden = false;
    loadServices().then(function () { switchTab(state.tab); });
  }

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
    status('');
    if (tab === 'reports') renderReports();
    else if (tab === 'services') renderServices();
    else renderInsights();
  }

  function loadServices() {
    return call('adminServices').then(function (d) {
      state.services = d.services; state.categories = d.categories; state.islands = d.islands;
    }).catch(function (e) { status(e.message, 'error'); });
  }

  // ---- Reports ----
  function renderReports() {
    var box = $('tab-content'); clear(box);
    var sel = h('select', { 'aria-label': 'Show', onchange: function () { state.reportStatus = sel.value; renderReports(); } },
      ['open', 'resolved', 'rejected', 'all'].map(function (s) { return h('option', { value: s, selected: s === state.reportStatus, text: s }); }));
    add(box, h('div', { class: 'toolbar' }, h('strong', { text: 'Reports:' }), sel));
    var list = h('div', { class: 'admin-list' }, h('p', { class: 'muted', text: 'Loading…' }));
    add(box, list);
    call('adminReports', { status: state.reportStatus }).then(function (d) {
      clear(list);
      if (!d.reports.length) return add(list, h('p', { class: 'muted', text: 'No reports here.' }));
      d.reports.forEach(function (r) {
        var svc = state.services.filter(function (s) { return s.id === r.serviceId; })[0];
        var note = h('input', { type: 'text', placeholder: 'Note (optional)', maxlength: '500', value: r.adminNote || '' });
        add(list, h('div', { class: 'admin-item' },
          h('h3', { text: (r.serviceName || 'New suggestion / general') + ' – ' + r.type }),
          h('p', { class: 'meta', text: r.reportId + ' · ' + String(r.receivedAt).slice(0, 16).replace('T', ' ') + ' · ' + r.status + (r.contact ? ' · contact: ' + r.contact : '') }),
          h('p', { class: 'details', text: r.details }),
          r.status === 'open' ? h('div', { class: 'actions' },
            note,
            svc ? h('button', { class: 'btn btn-small', type: 'button', text: 'Edit service', onclick: function () { switchTab('services'); editService(svc); } }) : null,
            h('button', { class: 'btn btn-small btn-primary', type: 'button', text: 'Resolved', onclick: function () { updateReport(r, 'resolved', note.value); } }),
            h('button', { class: 'btn btn-small', type: 'button', text: 'Reject', onclick: function () { updateReport(r, 'rejected', note.value); } }))
            : h('div', { class: 'actions' }, h('button', { class: 'btn btn-small', type: 'button', text: 'Reopen', onclick: function () { updateReport(r, 'open', ''); } }))));
      });
    }).catch(function (e) { clear(list); status(e.message, 'error'); });
  }

  function updateReport(r, newStatus, note) {
    call('adminUpdateReport', { reportId: r.reportId, status: newStatus, adminNote: note })
      .then(function () { toast('Report ' + newStatus); renderReports(); })
      .catch(function (e) { status(e.message, 'error'); });
  }

  // ---- Services ----
  function renderServices() {
    var box = $('tab-content'); clear(box);
    var search = h('input', { type: 'search', placeholder: 'Filter by name, ID or category', 'aria-label': 'Filter services' });
    var onlyIssues = h('select', { 'aria-label': 'Show' },
      h('option', { value: '', text: 'All' }), h('option', { value: 'unverified', text: 'Unverified' }),
      h('option', { value: 'outdated', text: 'Outdated' }), h('option', { value: 'draft', text: 'Drafts' }));
    var list = h('div', { class: 'admin-list' });
    function draw() {
      clear(list);
      var q = search.value.trim().toLowerCase();
      var f = onlyIssues.value;
      var items = state.services.filter(function (s) {
        if (f === 'draft' && s.status !== 'draft') return false;
        if ((f === 'unverified' || f === 'outdated') && s.verification !== f) return false;
        return !q || (s.name + ' ' + s.id + ' ' + s.category).toLowerCase().indexOf(q) !== -1;
      });
      add(list, h('p', { class: 'muted', text: items.length + ' services' }));
      items.forEach(function (s) {
        add(list, h('div', { class: 'admin-item' },
          h('h3', { text: s.name }),
          h('p', { class: 'meta', text: s.id + ' · ' + s.category + ' · ' + s.status + ' · ' + s.verification + (s.lastVerified ? ' (' + s.lastVerified + ')' : '') }),
          h('div', { class: 'actions' },
            h('button', { class: 'btn btn-small', type: 'button', text: 'Edit', onclick: function () { editService(s); } }),
            h('button', { class: 'btn btn-small btn-primary', type: 'button', text: 'Mark verified today', onclick: function () { verify(s); } }),
            h('a', { class: 'btn btn-small btn-ghost', href: '../#/service/' + encodeURIComponent(s.id), target: '_blank', rel: 'noopener', text: 'View' }))));
      });
    }
    search.addEventListener('input', draw);
    onlyIssues.addEventListener('change', draw);
    add(box, h('div', { class: 'toolbar' }, search, onlyIssues,
      h('button', { class: 'btn btn-primary', type: 'button', text: '+ New service', onclick: function () { editService(null); } }),
      h('button', { class: 'btn', type: 'button', text: 'Publish changes', title: 'Make phones download the latest data', onclick: publish })));
    add(box, list);
    draw();
  }

  function verify(s) {
    var who = window.prompt('Verified by (your name and how you checked, e.g. "Tebwa – phoned office"):', '');
    if (who === null) return;
    call('adminVerifyService', { id: s.id, verifiedBy: who }).then(function () {
      toast('Marked verified'); return loadServices();
    }).then(renderServices).catch(function (e) { status(e.message, 'error'); });
  }

  function publish() {
    call('adminPublish').then(function (d) { toast('Published version ' + d.version); })
      .catch(function (e) { status(e.message, 'error'); });
  }

  function field(label, input, hint) {
    return [h('label', { for: input.id, text: label }), hint ? h('p', { class: 'hint', text: hint }) : null, input];
  }

  function editService(s) {
    var isNew = !s;
    s = s || { status: 'draft', verification: 'unverified', islands: [], keywords: [], steps: [], requirements: [] };
    var box = $('tab-content'); clear(box);
    var inputs = {};
    function text(name, opts) {
      opts = opts || {};
      var el = h(opts.multi ? 'textarea' : 'input', { id: 'e-' + name, name: name, maxlength: opts.max || 300, rows: opts.multi ? 4 : null, type: opts.multi ? null : (opts.type || 'text'), readonly: opts.readonly || null });
      var v = s[name];
      el.value = Array.isArray(v) ? v.join(opts.multi ? '\n' : ', ') : (v === null || v === undefined ? '' : String(v));
      inputs[name] = el;
      return el;
    }
    function select(name, options) {
      var el = h('select', { id: 'e-' + name, name: name }, options.map(function (o) {
        return h('option', { value: o[0], selected: String(s[name]) === o[0], text: o[1] });
      }));
      inputs[name] = el;
      return el;
    }
    function check(name, label) {
      var el = h('input', { type: 'checkbox', id: 'e-' + name, checked: !!s[name] });
      inputs[name] = el;
      return h('label', { for: 'e-' + name }, el, label);
    }

    var msg = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });
    var form = h('form', { class: 'edit-form', onsubmit: function (e) {
      e.preventDefault();
      var out = {};
      Object.keys(inputs).forEach(function (k) { out[k] = inputs[k].type === 'checkbox' ? inputs[k].checked : inputs[k].value; });
      msg.textContent = 'Saving…'; msg.className = 'form-status';
      call('adminSaveService', { service: out, isNew: isNew }).then(function () {
        toast('Saved'); return loadServices();
      }).then(renderServices).catch(function (err) { msg.textContent = err.message; msg.className = 'form-status error'; });
    } },
      h('h2', { text: isNew ? 'New service' : 'Edit: ' + s.name }),
      field('Name *', text('name', { max: 150 }), 'Short and clear, e.g. "Renew a driver\'s licence".'),
      field('ID', text('id', { max: 80, readonly: !isNew }), isNew ? 'Leave empty to create from the name. Cannot be changed later.' : 'Cannot be changed.'),
      h('div', { class: 'row2' },
        h('div', null, field('Category *', select('category', state.categories.map(function (c) { return [c.id, c.name]; })))),
        h('div', null, field('Sub-category', text('subcategory')))),
      h('div', { class: 'row2' },
        h('div', null, field('Status', select('status', [['draft', 'Draft (hidden)'], ['published', 'Published'], ['archived', 'Archived (hidden)']]))),
        h('div', null, field('Verification', select('verification', [['unverified', 'Unverified'], ['verified', 'Verified'], ['outdated', 'May be outdated']])))),
      field('Summary *', text('summary', { multi: true, max: 600 }), 'One or two plain sentences.'),
      field('Steps', text('steps', { multi: true, max: 5000 }), 'One step per line.'),
      field('What to bring (requirements)', text('requirements', { multi: true, max: 5000 }), 'One item per line.'),
      field('Islands', text('islands', { max: 1000 }), 'Comma separated, e.g. South Tarawa, Abaiang – or "All islands". Allowed: ' + state.islands.join(', ')),
      field('Location', text('location')),
      h('div', { class: 'row2' }, h('div', null, field('Cost / fees', text('fees'))), h('div', null, field('Opening hours', text('hours')))),
      h('div', { class: 'row2' }, h('div', null, field('Phone', text('phone', { max: 60, type: 'tel' }))), h('div', null, field('Email', text('email', { max: 120, type: 'email' })))),
      field('Website', text('website', { max: 500, type: 'url' })),
      field('Map link', text('mapUrl', { max: 500, type: 'url' }), 'Optional. Google Maps link. If empty, the location text is used.'),
      field('Provided by', text('provider')),
      h('div', { class: 'row2' }, h('div', null, field('Official source name', text('sourceName'))), h('div', null, field('Official source link', text('sourceUrl', { max: 500, type: 'url' })))),
      h('div', { class: 'row2' }, h('div', null, field('Last verified (YYYY-MM-DD)', text('lastVerified', { max: 10 }))), h('div', null, field('Verified by (internal)', text('verifiedBy')))),
      field('Search keywords', text('keywords', { max: 1000 }), 'Comma separated. Add other words people might use, including Kiribati words.'),
      h('div', { class: 'row2' }, h('div', null, field('Name in Kiribati', text('name_gil'))), h('div', null, field('Summary in Kiribati', text('summary_gil', { max: 600 })))),
      field('Internal notes (never shown)', text('notes', { multi: true, max: 2000 })),
      h('div', { class: 'checks' }, check('popular', 'Popular (home page)'), check('important', 'Important contact')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-primary', type: 'submit', text: 'Save' }),
        h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: renderServices })),
      msg);
    add(box, form);
    inputs.name.focus();
  }

  // ---- Insights ----
  function renderInsights() {
    var box = $('tab-content'); clear(box);
    add(box, h('p', { class: 'muted', text: 'Loading last 30 days…' }));
    call('adminStats', { days: 30 }).then(function (d) {
      clear(box);
      function table(title, rows, note) {
        return h('div', null, h('h3', { text: title }), note ? h('p', { class: 'muted', text: note }) : null,
          rows.length ? h('table', null,
            h('thead', null, h('tr', null, h('th', { text: 'Item' }), h('th', { class: 'num', text: 'Count' }))),
            h('tbody', null, rows.map(function (r) { return h('tr', null, h('td', { text: r.key }), h('td', { class: 'num', text: r.count })); })))
            : h('p', { class: 'muted', text: 'No data yet.' }));
      }
      add(box, h('p', null, h('strong', { text: d.searches + ' searches' }), ' in the last ' + d.days + ' days.'));
      add(box, h('div', { class: 'stats' },
        table('Searches with NO results', d.zeroResults, 'Add services or keywords for these first.'),
        table('Top searches', d.topQueries),
        table('Most viewed services', d.topServices),
        table('Most viewed categories', d.topCategories)));
    }).catch(function (e) { clear(box); status(e.message, 'error'); });
  }

  // ---------- start ----------
  document.addEventListener('DOMContentLoaded', function () {
    $('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = $('password').value;
      $('login-status').textContent = 'Checking…';
      call('adminLogin', { password: pw }).then(function (d) {
        $('password').value = '';
        setToken(d.token);
        showApp();
      }).catch(function (err) { $('login-status').textContent = err.message; $('login-status').className = 'form-status error'; });
    });
    $('logout').addEventListener('click', function () {
      call('adminLogout').catch(function () {}).then(function () { setToken(''); showLogin('Logged out.'); });
    });
    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.dataset.tab); });
    });
    if (token()) showApp(); else showLogin();
  });
})();
