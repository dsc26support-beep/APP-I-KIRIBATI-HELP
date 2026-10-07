/*
 * I-Kiribati Help – page rendering.
 *
 * Security: all text is inserted with textContent (never innerHTML), and every link is
 * checked by safeUrl(), so content from the spreadsheet cannot inject scripts.
 */
(function (IKH) {
  'use strict';

  var t = function (k, v) { return IKH.i18n.t(k, v); };

  // ---------- tiny DOM helper ----------

  /** h('a', {href: '#/', class: 'x'}, 'text', childNode, [more]) */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  // ---------- safety helpers ----------

  function safeUrl(u) {
    u = String(u || '').trim();
    return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : '';
  }
  function telHref(phone) {
    var digits = String(phone || '').replace(/[^\d+]/g, '');
    return digits.length >= 3 ? 'tel:' + digits : '';
  }
  function mailHref(email) {
    email = String(email || '').trim();
    return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) ? 'mailto:' + email : '';
  }
  function mapHref(s) {
    var direct = safeUrl(s.mapUrl);
    if (direct) return direct;
    if (!s.location || /confirm|various|nearest|ask at|your local/i.test(s.location)) return '';
    var q = s.location + ', Kiribati';
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }
  function hostOf(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; }
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d)) return String(iso);
    try {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return String(iso).slice(0, 10); }
  }

  // ---------- shared pieces ----------

  function badge(s) {
    var v = s.verification === 'verified' ? 'verified' : (s.verification === 'outdated' ? 'outdated' : 'unverified');
    return h('span', { class: 'badge badge-' + v, text: t('badge.' + v) });
  }

  function catById(state, id) {
    for (var i = 0; i < state.data.categories.length; i++) if (state.data.categories[i].id === id) return state.data.categories[i];
    return null;
  }

  function sectionTitle(text, id) { return h('h2', { class: 'section-title', id: id || null, text: text }); }

  function fact(labelKey, value, opts) {
    opts = opts || {};
    if (!value && !opts.always) return null;
    return h('div', { class: 'fact' },
      h('dt', { text: t(labelKey) }),
      h('dd', { class: value ? null : 'muted', text: value || t('card.unknown') }));
  }

  function actionButtons(s, state) {
    var items = [];
    var tel = telHref(s.phone);
    if (tel) items.push(h('a', { class: 'btn btn-call', href: tel }, '📞 ', t('card.call') + ' ' + s.phone));
    var mail = mailHref(s.email);
    if (mail) items.push(h('a', { class: 'btn', href: mail }, '✉️ ', t('card.sendEmail')));
    var web = safeUrl(s.website);
    if (web) items.push(h('a', { class: 'btn', href: web, target: '_blank', rel: 'noopener noreferrer' }, '🌐 ', t('card.openWebsite')));
    var map = mapHref(s);
    if (map) items.push(h('a', { class: 'btn', href: map, target: '_blank', rel: 'noopener noreferrer' }, '📍 ', t('card.map')));
    items.push(h('button', { class: 'btn btn-ghost', type: 'button', onclick: function (e) { share(s, e.currentTarget); } }, '🔗 ', t('card.share')));
    return h('div', { class: 'actions' }, items);
  }

  function share(s, btn) {
    var base = (window.IKH_CONFIG && window.IKH_CONFIG.SITE_URL) || location.origin;
    var url = location.origin && location.origin !== 'null' ? location.origin + location.pathname + '#/service/' + encodeURIComponent(s.id)
      : base + '/#/service/' + encodeURIComponent(s.id);
    if (navigator.share) {
      navigator.share({ title: s.name, text: s.summary, url: url }).catch(function () {});
      return;
    }
    var done = function () { toast(t('card.copied')); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt('', url); });
    else prompt('', url);
    if (btn) btn.blur();
  }

  function listBlock(titleKey, items, ordered) {
    if (!items || !items.length) return null;
    return h('div', { class: 'list-block' },
      h('h4', { text: t(titleKey) }),
      h(ordered ? 'ol' : 'ul', null, items.map(function (x) { return h('li', { text: x }); })));
  }

  function sourceLine(s) {
    var src = safeUrl(s.sourceUrl);
    var nodes = [h('strong', { text: t('card.source') + ': ' })];
    if (src) nodes.push(h('a', { href: src, target: '_blank', rel: 'noopener noreferrer', text: s.sourceName || hostOf(src) }));
    else nodes.push(document.createTextNode(s.sourceName || t('card.unknown')));
    return h('p', { class: 'meta-line' }, nodes);
  }

  function verifiedLine(s) {
    return h('p', { class: 'meta-line' },
      h('strong', { text: t('card.lastVerified') + ': ' }),
      s.lastVerified ? formatDate(s.lastVerified) : h('span', { class: 'muted', text: t('card.notVerified') }));
  }

  function reportLink(s) {
    return h('a', { class: 'report-link', href: '#/report?id=' + encodeURIComponent(s.id) }, '⚠️ ', t('card.report'));
  }

  // ---------- service card ----------

  /**
   * The main "answer" card. Shows everything a person needs:
   * where, who, what to bring, cost, hours, contacts, source and when it was verified.
   * opts.expanded – open the steps/requirements section; opts.full – detail page layout.
   */
  function serviceCard(s, state, opts) {
    opts = opts || {};
    var cat = catById(state, s.category);
    var islands = (s.islands || []).join(', ');

    var steps = listBlock('card.steps', s.steps, true);
    var reqs = listBlock('card.requirements', s.requirements, false);
    var more = null;
    if (steps || reqs) {
      more = opts.full
        ? h('div', { class: 'more' }, steps, reqs)
        : h('details', { class: 'more', open: opts.expanded || null }, h('summary', { text: t('card.more') }), steps, reqs);
    }

    var warn = null;
    if (opts.full && s.verification === 'outdated') warn = h('p', { class: 'warn', role: 'note', text: t('warn.outdated') });
    else if (opts.full && s.verification !== 'verified') warn = h('p', { class: 'warn', role: 'note', text: t('warn.unverified') });

    var titleTag = opts.full ? 'h1' : 'h3';
    return h('article', { class: 'card service-card' + (opts.full ? ' full' : ''), 'data-id': s.id },
      h('div', { class: 'card-top' },
        h('span', { class: 'chip' }, cat ? cat.icon + ' ' + IKH.i18n.catName(cat) : s.category),
        badge(s)),
      h(titleTag, { class: 'card-title' },
        opts.full ? s.name : h('a', { href: '#/service/' + encodeURIComponent(s.id), text: s.name })),
      s.summary ? h('p', { class: 'summary', text: s.summary }) : null,
      warn,
      h('dl', { class: 'facts' },
        fact('card.location', s.location),
        fact('card.islands', islands),
        fact('card.hours', s.hours, { always: opts.full }),
        fact('card.fees', s.fees, { always: opts.full }),
        fact('card.provider', s.provider),
        opts.full ? fact('card.phone', s.phone, { always: true }) : null,
        opts.full && s.email ? fact('card.email', s.email) : null),
      actionButtons(s, state),
      more,
      h('footer', { class: 'card-foot' }, sourceLine(s), verifiedLine(s), reportLink(s))
    );
  }

  /** Compact row used for "Popular", "Recently updated" lists. */
  function serviceRow(s, state, showDate) {
    var cat = catById(state, s.category);
    return h('li', null,
      h('a', { class: 'row-link', href: '#/service/' + encodeURIComponent(s.id) },
        h('span', { class: 'row-icon', 'aria-hidden': 'true', text: cat ? cat.icon : '•' }),
        h('span', { class: 'row-text' },
          h('span', { class: 'row-title', text: s.name }),
          showDate && s.updatedAt ? h('span', { class: 'row-sub', text: formatDate(s.updatedAt) }) : null)));
  }

  function contactRow(s) {
    var tel = telHref(s.phone);
    return h('li', { class: 'contact-row' },
      h('a', { class: 'row-link', href: '#/service/' + encodeURIComponent(s.id) },
        h('span', { class: 'row-title', text: s.name })),
      tel ? h('a', { class: 'btn btn-call btn-small', href: tel, 'aria-label': t('card.call') + ' ' + s.name + ' ' + s.phone }, '📞 ', s.phone) : null);
  }

  // ---------- search form ----------

  function searchForm(state, value, filters, autofocus) {
    var input = h('input', {
      id: 'q', name: 'q', type: 'search', value: value || '', autocomplete: 'off', enterkeyhint: 'search',
      placeholder: t('search.placeholder'), maxlength: '120', autofocus: autofocus || null, 'aria-describedby': 'search-examples'
    });
    var form = h('form', { class: 'search-form', role: 'search', onsubmit: function (e) {
      e.preventDefault();
      var q = input.value.trim();
      if (!q) { input.focus(); return; }
      IKH.app.go('#/search?' + IKH.filters.toParams(q, filters || {}));
    } },
      h('label', { for: 'q', class: 'search-label', text: t('search.label') }),
      h('div', { class: 'search-row' }, input, h('button', { class: 'btn btn-primary', type: 'submit', text: t('search.button') })));
    return form;
  }

  function examples() {
    var ex = [['ex.licence', 'renew drivers licence'], ['ex.clinic', 'clinic'], ['ex.job', 'job'], ['ex.gov', 'government'],
      ['ex.mechanic', 'mechanic'], ['ex.transport', 'transport'], ['ex.scholarship', 'scholarship']];
    return h('div', { class: 'examples', id: 'search-examples' },
      h('span', { class: 'examples-label', text: t('search.examples') }),
      ex.map(function (e) {
        return h('a', { class: 'pill', href: '#/search?q=' + encodeURIComponent(e[1]), text: t(e[0]) });
      }));
  }

  function categoryGrid(state) {
    return h('ul', { class: 'cat-grid' }, state.data.categories.map(function (c) {
      return h('li', null, h('a', { class: 'cat-card' + (c.id === 'emergency' ? ' cat-emergency' : ''), href: '#/category/' + c.id },
        h('span', { class: 'cat-icon', 'aria-hidden': 'true', text: c.icon }),
        h('span', { class: 'cat-name', text: IKH.i18n.catName(c) })));
    }));
  }

  function filterBar(state, filters, onChange, showCategory) {
    var island = h('select', { id: 'f-island', 'aria-label': t('filter.island') },
      h('option', { value: '', text: t('filter.allIslands') }),
      state.data.islands.map(function (i) { return h('option', { value: i, selected: filters.island === i || null, text: i }); }));
    var cat = showCategory ? h('select', { id: 'f-cat', 'aria-label': t('filter.category') },
      h('option', { value: '', text: t('filter.allCategories') }),
      state.data.categories.map(function (c) { return h('option', { value: c.id, selected: filters.category === c.id || null, text: IKH.i18n.catName(c) }); })) : null;
    var verified = h('input', { type: 'checkbox', id: 'f-verified', checked: filters.verifiedOnly || null });

    function changed() {
      onChange({ island: island.value, category: cat ? cat.value : filters.category, verifiedOnly: verified.checked });
    }
    island.addEventListener('change', changed);
    if (cat) cat.addEventListener('change', changed);
    verified.addEventListener('change', changed);

    return h('div', { class: 'filters' },
      h('label', { class: 'filter' }, h('span', { text: t('filter.island') }), island),
      cat ? h('label', { class: 'filter' }, h('span', { text: t('filter.category') }), cat) : null,
      h('label', { class: 'filter filter-check' }, verified, h('span', { text: t('filter.verified') })),
      IKH.filters.isActive(showCategory ? filters : { island: filters.island, verifiedOnly: filters.verifiedOnly })
        ? h('button', { type: 'button', class: 'btn btn-ghost btn-small', text: t('filter.clear'), onclick: function () {
          onChange({ island: '', category: showCategory ? '' : filters.category, verifiedOnly: false });
        } }) : null);
  }

  // ---------- pages ----------

  function home(main, state) {
    var services = state.data.services;
    var popular = services.filter(function (s) { return s.popular; }).slice(0, 8);
    var recent = services.slice().sort(function (a, b) {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || a.name.localeCompare(b.name);
    }).slice(0, 6);
    var contacts = services.filter(function (s) { return s.important; }).sort(function (a, b) {
      return (telHref(b.phone) ? 1 : 0) - (telHref(a.phone) ? 1 : 0);
    }).slice(0, 8);

    append(main, [
      h('section', { class: 'hero' },
        h('h1', { class: 'hero-title', text: t('app.name') }),
        h('p', { class: 'hero-tagline', text: t('app.tagline') }),
        searchForm(state, '', {}, false),
        examples()),
      h('a', { class: 'emergency-banner', href: '#/category/emergency' }, '🆘 ', t('home.emergencyBanner')),
      h('section', { 'aria-labelledby': 'h-cats' }, sectionTitle(t('home.categories'), 'h-cats'), categoryGrid(state)),
      popular.length ? h('section', { 'aria-labelledby': 'h-pop' }, sectionTitle(t('home.popular'), 'h-pop'),
        h('ul', { class: 'rows' }, popular.map(function (s) { return serviceRow(s, state); }))) : null,
      recent.length ? h('section', { 'aria-labelledby': 'h-recent' }, sectionTitle(t('home.recent'), 'h-recent'),
        h('ul', { class: 'rows' }, recent.map(function (s) { return serviceRow(s, state, true); }))) : null,
      contacts.length ? h('section', { 'aria-labelledby': 'h-contacts' }, sectionTitle(t('home.contacts'), 'h-contacts'),
        h('ul', { class: 'rows contacts' }, contacts.map(contactRow))) : null
    ]);
  }

  function searchPage(main, state, q, filters) {
    var res = IKH.IKHSearchRun(q, filters);
    var count = res.results.length;
    var statusText = count === 0 ? t('search.none', { q: q }) : (count === 1 ? t('search.result1', { q: q }) : t('search.results', { n: count, q: q }));

    append(main, [
      h('h1', { class: 'visually-hidden', text: t('search.button') + ': ' + q }),
      h('div', { class: 'search-top' }, searchForm(state, q, filters, false)),
      filterBar(state, filters, function (f) { IKH.app.go('#/search?' + IKH.filters.toParams(q, f), true); }, true),
      h('p', { class: 'result-count', role: 'status', 'aria-live': 'polite', text: statusText }),
      state.offline ? h('p', { class: 'notice', text: t('search.offline') }) : null
    ]);

    if (!count) {
      append(main, h('div', { class: 'empty' },
        res.suggestion ? h('p', null, t('search.didYouMean') + ' ',
          h('a', { href: '#/search?' + IKH.filters.toParams(res.suggestion, filters), text: res.suggestion }), '?') : null,
        h('p', { text: t('search.noneHelp') }),
        IKH.filters.isActive(filters) ? h('p', null, h('a', { href: '#/search?q=' + encodeURIComponent(q), text: t('filter.clear') })) : null,
        categoryGrid(state),
        h('p', null, h('a', { class: 'btn', href: '#/report?type=new&q=' + encodeURIComponent(q), text: t('search.suggest') }))));
    } else {
      append(main, h('div', { class: 'results' }, res.results.map(function (r, i) {
        return serviceCard(r.service, state, { expanded: i === 0 });
      })));
      append(main, h('p', { class: 'after-results' }, h('a', { href: '#/report?type=new&q=' + encodeURIComponent(q), text: t('search.suggest') })));
    }
    return res;
  }

  function categoryPage(main, state, catId, filters) {
    var cat = catById(state, catId);
    if (!cat) return notFound(main);
    var list = IKH.filters.apply(state.data.services, { category: catId, island: filters.island, verifiedOnly: filters.verifiedOnly })
      .sort(function (a, b) { return (b.important ? 1 : 0) - (a.important ? 1 : 0) || (b.popular ? 1 : 0) - (a.popular ? 1 : 0) || a.name.localeCompare(b.name); });

    append(main, [
      h('p', { class: 'crumbs' }, h('a', { href: '#/', text: '← ' + t('nav.home') })),
      h('h1', { class: 'page-title' }, h('span', { 'aria-hidden': 'true', text: cat.icon + ' ' }), IKH.i18n.catName(cat)),
      cat.description ? h('p', { class: 'lead', text: cat.description }) : null,
      catId === 'emergency' ? h('div', { class: 'emergency-box' },
        [['192', 'Police'], ['193', 'Fire'], ['194', 'Ambulance']].map(function (n) {
          return h('a', { class: 'big-call', href: 'tel:' + n[0] }, h('span', { class: 'big-num', text: n[0] }), h('span', { text: n[1] }));
        })) : null,
      h('div', { class: 'search-top' }, searchForm(state, '', { category: catId }, false)),
      filterBar(state, filters, function (f) { IKH.app.go('#/category/' + catId + '?' + IKH.filters.toParams('', f), true); }, false),
      h('p', { class: 'result-count', role: 'status', text: t('cat.services', { n: list.length }) }),
      list.length ? h('div', { class: 'results' }, list.map(function (s) { return serviceCard(s, state); }))
        : h('p', { class: 'empty', text: t('cat.empty') })
    ]);
  }

  function servicePage(main, state, id) {
    var s = null;
    for (var i = 0; i < state.data.services.length; i++) if (state.data.services[i].id === id) s = state.data.services[i];
    if (!s) return notFound(main);
    append(main, [
      h('p', { class: 'crumbs' }, h('a', { href: '#/', onclick: function (e) {
        if (IKH.app.hasHistory()) { e.preventDefault(); history.back(); }
      }, text: '← ' + t('back') })),
      serviceCard(s, state, { full: true })
    ]);
    return s;
  }

  function reportPage(main, state, params) {
    var id = params.get('id') || '';
    var type = params.get('type') || '';
    var prefill = params.get('q') || '';
    var service = null;
    state.data.services.forEach(function (s) { if (s.id === id) service = s; });
    var isNew = type === 'new' || !service;

    var types = ['phone', 'hours', 'location', 'fees', 'steps', 'closed', 'new', 'other'];
    var typeSel = h('select', { id: 'r-type', name: 'type', required: true },
      types.map(function (x) { return h('option', { value: x, selected: (isNew && x === 'new') || null, text: t('report.type.' + x) }); }));
    var details = h('textarea', { id: 'r-details', name: 'details', rows: '5', maxlength: '1000', required: true, 'aria-describedby': 'r-details-help' });
    if (prefill) details.value = prefill;
    var contact = h('input', { id: 'r-contact', name: 'contact', type: 'text', maxlength: '120', autocomplete: 'email', 'aria-describedby': 'r-contact-help' });
    // Honeypot: hidden from people, bots fill it in.
    var trap = h('input', { name: 'website', type: 'text', tabindex: '-1', autocomplete: 'off', class: 'hp', 'aria-hidden': 'true' });
    var status = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });
    var submit = h('button', { class: 'btn btn-primary', type: 'submit', text: t('report.submit') });

    var form = h('form', { class: 'report-form', novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      var text = details.value.trim();
      if (text.length < 5) { status.textContent = t('report.tooShort'); status.className = 'form-status error'; details.focus(); return; }
      if (trap.value) { status.textContent = t('report.thanks'); return; }
      submit.disabled = true;
      status.className = 'form-status';
      status.textContent = t('report.sending');
      IKH.api.submitReport({
        serviceId: service ? service.id : '',
        serviceName: service ? service.name : '',
        type: typeSel.value,
        details: text,
        contact: contact.value.trim(),
        lang: IKH.i18n.lang()
      }).then(function (result) {
        form.reset();
        status.className = 'form-status ok';
        status.textContent = result === 'sent' ? t('report.thanks') : t('report.queued');
      }, function () {
        status.className = 'form-status error';
        status.textContent = t('report.error');
      }).then(function () { submit.disabled = false; });
    } },
      service ? h('p', { class: 'report-service' }, h('strong', { text: t('report.service') + ': ' }), service.name) : null,
      h('label', { for: 'r-type', text: t('report.type') }), typeSel,
      h('label', { for: 'r-details', text: t('report.details') }),
      h('p', { id: 'r-details-help', class: 'help', text: t('report.detailsHelp') }), details,
      h('label', { for: 'r-contact', text: t('report.contact') }),
      h('p', { id: 'r-contact-help', class: 'help', text: t('report.contactHelp') }), contact,
      trap,
      submit, status);

    append(main, [
      h('p', { class: 'crumbs' }, h('a', { href: service ? '#/service/' + encodeURIComponent(service.id) : '#/', text: '← ' + t('back') })),
      h('h1', { class: 'page-title', text: isNew && !service ? t('report.suggestTitle') : t('report.title') }),
      h('p', { class: 'lead', text: t('report.intro') }),
      form
    ]);
  }

  // Static pages (English; short and plain).
  var PAGES = {
    about: {
      title: 'About I-Kiribati Help',
      body: [
        ['p', 'I-Kiribati Help is a free, independent community information service. It helps people in Kiribati quickly find government services, health services, jobs, transport, businesses, emergency contacts and practical step-by-step instructions.'],
        ['p', 'It is NOT an official Government of Kiribati website and is not run by any ministry. We collect public information and show where it came from, and when it was last checked.'],
        ['h2', 'How we keep information correct'],
        ['ul', ['Every entry shows its official source and the date it was last verified.',
          'Entries we have not yet confirmed with the provider are clearly marked “Unverified”.',
          'Anyone can report incorrect or outdated information using the button on each entry.',
          'Always confirm important details (fees, documents, opening hours) with the provider before you travel or pay.']],
        ['h2', 'Works on any phone'],
        ['p', 'This app is designed for slow connections and small data plans. After your first visit it also works offline. You can install it on your home screen from your browser menu.']
      ]
    },
    privacy: {
      title: 'Privacy',
      body: [
        ['p', 'We collect as little as possible.'],
        ['h2', 'What we collect'],
        ['ul', ['Search words and the number of results (to learn what information is missing). Phone numbers and emails typed into search are removed before sending.',
          'Which pages and categories are opened, and the app language.',
          'Reports you send. Your phone or email is optional, used only to ask about your report, never published, and deleted when the report is closed.']],
        ['h2', 'What we do NOT collect'],
        ['ul', ['No accounts, no names, no location tracking.', 'No advertising or third-party trackers, and no cookies.']],
        ['h2', 'Stored on your phone'],
        ['p', 'The app saves information on your phone (browser storage) so it works offline and loads fast: the service list, your language and your chosen island. Clear your browser data to remove it.'],
        ['h2', 'Where data is kept'],
        ['p', 'Statistics and reports are stored in a Google Sheet run by the I-Kiribati Help team, using Google Apps Script. If “Do Not Track” is switched on in your browser, no statistics are sent.']
      ]
    },
    terms: {
      title: 'Terms of use',
      body: [
        ['ul', ['Information is provided free, “as is”, for general guidance. It may be incomplete or out of date.',
          'Always confirm with the official provider before making decisions, travelling or paying money.',
          'In an emergency, call Police 192, Fire 193 or Ambulance 194. Do not rely on this app for emergency response.',
          'I-Kiribati Help is independent and is not an official Government of Kiribati service.',
          'Listings are not endorsements. Businesses are listed for information only.',
          'Do not submit false, offensive or personal information about other people in reports.']]
      ]
    },
    contact: {
      title: 'Contact',
      body: [
        ['p', 'Want to correct information, add your service or business, or help as a volunteer? Send us a message.'],
        ['contact'],
        ['p', 'Government agencies and organisations can ask to verify or update their own listings.']
      ]
    }
  };

  function staticPage(main, state, name) {
    var page = PAGES[name];
    if (!page) return notFound(main);
    var nodes = [h('p', { class: 'crumbs' }, h('a', { href: '#/', text: '← ' + t('nav.home') })), h('h1', { class: 'page-title', text: page.title })];
    page.body.forEach(function (b) {
      if (b[0] === 'ul') nodes.push(h('ul', { class: 'prose-list' }, b[1].map(function (x) { return h('li', { text: x }); })));
      else if (b[0] === 'contact') {
        var mail = mailHref(window.IKH_CONFIG && window.IKH_CONFIG.CONTACT_EMAIL);
        nodes.push(h('p', { class: 'actions' },
          mail ? h('a', { class: 'btn', href: mail }, '✉️ ', window.IKH_CONFIG.CONTACT_EMAIL) : null,
          h('a', { class: 'btn btn-primary', href: '#/report?type=other', text: t('report.title') }),
          h('a', { class: 'btn', href: '#/report?type=new', text: t('report.suggestTitle') })));
      } else nodes.push(h(b[0], { text: b[1] }));
    });
    append(main, h('div', { class: 'prose' }, nodes));
  }

  function sourcesPage(main, state) {
    var map = {};
    state.data.services.forEach(function (s) {
      var key = s.sourceName || '(not specified)';
      if (!map[key]) map[key] = { name: key, url: safeUrl(s.sourceUrl), count: 0 };
      map[key].count++;
    });
    var list = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
    append(main, h('div', { class: 'prose' },
      h('p', { class: 'crumbs' }, h('a', { href: '#/', text: '← ' + t('nav.home') })),
      h('h1', { class: 'page-title', text: 'Sources' }),
      h('p', { text: 'Where our information comes from. Each entry also shows its own source and the date it was last verified.' }),
      state.data.meta && state.data.meta.notice ? h('p', { class: 'warn', text: state.data.meta.notice }) : null,
      h('ul', { class: 'prose-list' }, list.map(function (s) {
        return h('li', null, s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.name }) : s.name,
          h('span', { class: 'muted', text: ' (' + s.count + ')' }));
      })),
      state.data.meta ? h('p', { class: 'muted', text: 'Data version ' + state.data.meta.version }) : null));
  }

  function notFound(main) {
    append(main, h('div', { class: 'prose' },
      h('h1', { class: 'page-title', text: t('notFound.title') }),
      h('p', { text: t('notFound.body') }),
      h('p', null, h('a', { class: 'btn btn-primary', href: '#/', text: t('nav.home') }))));
  }

  function loading(main) {
    append(main, h('p', { class: 'loading', role: 'status', text: t('loading') }));
  }

  // ---------- toast ----------
  var toastTimer;
  function toast(text, actionText, onAction) {
    var el = document.getElementById('toast');
    if (!el) return;
    clear(el);
    append(el, h('span', { text: text }));
    if (actionText) append(el, h('button', { type: 'button', class: 'btn btn-small', text: actionText, onclick: onAction }));
    el.hidden = false;
    clearTimeout(toastTimer);
    if (!actionText) toastTimer = setTimeout(function () { el.hidden = true; }, 3000);
  }

  IKH.ui = {
    h: h, clear: clear, safeUrl: safeUrl, telHref: telHref, mailHref: mailHref,
    home: home, searchPage: searchPage, categoryPage: categoryPage, servicePage: servicePage,
    reportPage: reportPage, staticPage: staticPage, sourcesPage: sourcesPage, notFound: notFound,
    loading: loading, toast: toast, serviceCard: serviceCard, formatDate: formatDate
  };
})(window.IKH = window.IKH || {});
