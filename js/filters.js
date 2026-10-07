/*
 * I-Kiribati Help – search filters (island, category, verified only).
 * Filters are stored in the page address, e.g. #/search?q=clinic&island=Abaiang
 * so a filtered search can be shared or bookmarked.
 */
(function (IKH) {
  'use strict';

  var ISLAND_KEY = 'ikh:island';

  function fromParams(params) {
    return {
      category: params.get('cat') || '',
      island: params.get('island') || '',
      verifiedOnly: params.get('verified') === '1'
    };
  }

  function toParams(q, f) {
    var p = new URLSearchParams();
    if (q) p.set('q', q);
    if (f.category) p.set('cat', f.category);
    if (f.island) p.set('island', f.island);
    if (f.verifiedOnly) p.set('verified', '1');
    return p.toString();
  }

  function isActive(f) { return !!(f.category || f.island || f.verifiedOnly); }

  /** Remember the island a person chose, so it is pre-selected next time. */
  function rememberIsland(island) {
    try {
      if (island) localStorage.setItem(ISLAND_KEY, island); else localStorage.removeItem(ISLAND_KEY);
    } catch (e) { /* ignore */ }
  }
  function savedIsland() {
    try { return localStorage.getItem(ISLAND_KEY) || ''; } catch (e) { return ''; }
  }

  /** Apply filters to a plain list of services (used by category pages). */
  function apply(services, f) {
    return services.filter(function (s) {
      if (f.category && s.category !== f.category) return false;
      if (f.island) {
        var isl = s.islands || [];
        if (isl.indexOf(f.island) === -1 && isl.indexOf('All islands') === -1) return false;
      }
      if (f.verifiedOnly && s.verification !== 'verified') return false;
      return true;
    });
  }

  IKH.filters = {
    fromParams: fromParams,
    toParams: toParams,
    isActive: isActive,
    apply: apply,
    rememberIsland: rememberIsland,
    savedIsland: savedIsland
  };
})(window.IKH = window.IKH || {});
