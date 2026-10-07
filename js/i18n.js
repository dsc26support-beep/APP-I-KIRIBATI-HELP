/*
 * I-Kiribati Help – translations.
 *
 * English (en) is the default. Kiribati (gil) strings are a FIRST DRAFT and must be
 * reviewed by a native speaker before launch (see README "Translation review").
 * Any key missing in Kiribati automatically falls back to English.
 */
(function (IKH) {
  'use strict';

  var STRINGS = {
    en: {
      'app.name': 'I-Kiribati Help',
      'app.tagline': 'Find the help you need in Kiribati.',
      'skip': 'Skip to main content',
      'nav.home': 'Home',
      'nav.emergency': 'Emergency',
      'nav.language': 'Kiribati',
      'nav.languageLabel': 'Read in Kiribati (te taetae ni Kiribati)',
      'search.label': 'What do you need help with?',
      'search.placeholder': 'e.g. renew my licence',
      'search.button': 'Search',
      'search.examples': 'Try:',
      'search.results': '{n} results for “{q}”',
      'search.result1': '1 result for “{q}”',
      'search.none': 'No results for “{q}”',
      'search.noneHelp': 'Try fewer or different words, check the spelling, or browse a category below.',
      'search.didYouMean': 'Did you mean',
      'search.suggest': 'Can’t find it? Suggest a service',
      'search.offline': 'You are offline. Showing saved information.',
      'ex.licence': 'Renew my licence',
      'ex.clinic': 'Find a clinic',
      'ex.job': 'Find a job',
      'ex.gov': 'Find a government service',
      'ex.mechanic': 'Find a mechanic',
      'ex.transport': 'Find transport',
      'ex.scholarship': 'Find a scholarship',
      'home.categories': 'Browse by category',
      'home.popular': 'Popular services',
      'home.recent': 'Recently updated',
      'home.contacts': 'Important contacts',
      'home.emergencyBanner': 'Emergency? Police 192 · Fire 193 · Ambulance 194',
      'filter.island': 'Island',
      'filter.allIslands': 'All islands',
      'filter.category': 'Category',
      'filter.allCategories': 'All categories',
      'filter.verified': 'Verified only',
      'filter.clear': 'Clear filters',
      'card.steps': 'Steps',
      'card.requirements': 'What to bring',
      'card.fees': 'Cost',
      'card.hours': 'Opening hours',
      'card.location': 'Where',
      'card.islands': 'Islands',
      'card.provider': 'Provided by',
      'card.phone': 'Phone',
      'card.email': 'Email',
      'card.website': 'Website',
      'card.source': 'Official source',
      'card.lastVerified': 'Last verified',
      'card.notVerified': 'Not yet verified',
      'card.unknown': 'Not known yet',
      'card.call': 'Call',
      'card.sendEmail': 'Email',
      'card.openWebsite': 'Website',
      'card.map': 'Map',
      'card.share': 'Share',
      'card.copied': 'Link copied',
      'card.details': 'Full details',
      'card.more': 'Steps and requirements',
      'card.report': 'Report outdated information',
      'badge.verified': 'Verified',
      'badge.unverified': 'Unverified',
      'badge.outdated': 'May be outdated',
      'warn.unverified': 'This information has not been checked with the provider yet. Please confirm before you travel or pay.',
      'warn.outdated': 'Someone reported this may be outdated. Please confirm with the provider.',
      'cat.services': '{n} services',
      'cat.empty': 'No services listed here yet.',
      'back': 'Back',
      'notFound.title': 'Page not found',
      'notFound.body': 'This page or service does not exist. Try searching instead.',
      'report.title': 'Report incorrect information',
      'report.suggestTitle': 'Suggest a service',
      'report.intro': 'Help keep this information correct. We check every report.',
      'report.service': 'Service',
      'report.type': 'What is wrong?',
      'report.type.phone': 'Phone or email is wrong',
      'report.type.hours': 'Opening hours changed',
      'report.type.location': 'Moved to a new place',
      'report.type.fees': 'Cost has changed',
      'report.type.steps': 'Steps or requirements are wrong',
      'report.type.closed': 'Service has closed',
      'report.type.new': 'New service or business',
      'report.type.other': 'Something else',
      'report.details': 'Details',
      'report.detailsHelp': 'What is the correct information? Where did you hear it?',
      'report.contact': 'Your phone or email (optional)',
      'report.contactHelp': 'Only used if we need to ask you a question. Never published.',
      'report.submit': 'Send report',
      'report.sending': 'Sending…',
      'report.thanks': 'Thank you! Your report was sent.',
      'report.queued': 'You are offline. Your report is saved and will be sent automatically when you are back online.',
      'report.error': 'Could not send. Please try again.',
      'report.tooShort': 'Please write a few words about what is wrong.',
      'footer.about': 'About',
      'footer.contact': 'Contact',
      'footer.report': 'Report incorrect information',
      'footer.privacy': 'Privacy',
      'footer.terms': 'Terms',
      'footer.sources': 'Sources',
      'footer.disclaimer': 'Independent community information service. Not an official Government of Kiribati website.',
      'update.available': 'New information is available.',
      'update.reload': 'Update',
      'install': 'Install app',
      'loading': 'Loading…',
      'dataUpdated': 'Information updated {d}'
    },

    // FIRST DRAFT – needs native-speaker review. Short, plain wording on purpose.
    gil: {
      'app.tagline': 'Kakaea te ibuobuoki ae ko kainnanoia i Kiribati.',
      'skip': 'Nako nanon te iteraniba',
      'nav.home': 'Moan iteraniba',
      'nav.language': 'English',
      'nav.languageLabel': 'Read in English',
      'search.label': 'Tera te ibuobuoki ae ko kainnanoia?',
      'search.placeholder': 'n aron: kaboua au laisenti',
      'search.button': 'Kakaea',
      'search.examples': 'Kataia:',
      'search.didYouMean': 'Bon aio ae ko kantaninga?',
      'home.categories': 'Kakaea n te kanoa',
      'home.popular': 'Ibuobuoki aika rangi ni kakaei',
      'home.contacts': 'Nambwa aika kakawaki',
      'filter.island': 'Aba',
      'filter.allIslands': 'Aba ni kabane',
      'card.steps': 'Anuana',
      'card.phone': 'Tareboon',
      'card.call': 'Weteia',
      'card.report': 'Ribootinna te rongorongo ae aki eti',
      'report.submit': 'Kanakoa',
      'report.thanks': 'Ko rabwa! E a tia n nakoraoi am ribooti.',
      'back': 'Okira',
      'loading': 'E tabe n uota…'
    }
  };

  var LANG_KEY = 'ikh:lang';
  var current = 'en';
  try { current = localStorage.getItem(LANG_KEY) || 'en'; } catch (e) { /* storage blocked */ }
  if (!STRINGS[current]) current = 'en';

  function t(key, vars) {
    var s = (STRINGS[current] && STRINGS[current][key]) || STRINGS.en[key] || key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? String(vars[k]) : m; });
    }
    return s;
  }

  function setLang(lang) {
    if (!STRINGS[lang]) return;
    current = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
    apply(document);
  }

  /** Fill every element with data-i18n="key" (text) or data-i18n-attr="placeholder:key". */
  function apply(rootEl) {
    document.documentElement.lang = current === 'gil' ? 'gil' : 'en';
    rootEl.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    rootEl.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var p = pair.split(':');
        if (p.length === 2) el.setAttribute(p[0].trim(), t(p[1].trim()));
      });
    });
  }

  /** Category name in the current language. */
  function catName(cat) {
    if (!cat) return '';
    return (current === 'gil' && cat.name_gil) ? cat.name_gil : cat.name;
  }

  IKH.i18n = {
    t: t,
    setLang: setLang,
    apply: apply,
    catName: catName,
    lang: function () { return current; },
    toggle: function () { setLang(current === 'en' ? 'gil' : 'en'); }
  };
})(window.IKH = window.IKH || {});
