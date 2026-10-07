/*
 * I-Kiribati Help – search engine.
 *
 * Plain JavaScript with no dependencies. The same file runs in:
 *   - the browser (window.IKHSearch)
 *   - Node.js tests (loaded with vm)
 *   - Google Apps Script (copied to apps-script/SearchCore.gs by tools/sync-gas.mjs)
 *
 * How ranking works (simple on purpose, so it is easy to tune):
 *   1. The query is normalised (lower case, no accents/punctuation) and split into words.
 *   2. Filler words ("how", "do", "i", "my") are dropped.
 *   3. Each word is expanded with synonyms ("licence" -> "license", "permit").
 *   4. Each service gets points when a word matches one of its fields.
 *      Matches in the name/keywords count more than matches in the steps.
 *      Exact > prefix ("lic" -> "licence") > small typo ("licnce" -> "licence").
 *   5. Services matching more of the query words rank higher.
 */
(function (root) {
  'use strict';

  var STOPWORDS = toSet([
    'a', 'an', 'the', 'i', 'me', 'my', 'mine', 'we', 'our', 'you', 'your', 'to', 'for', 'of', 'in',
    'on', 'at', 'by', 'with', 'and', 'or', 'is', 'are', 'am', 'be', 'it', 'its', 'do', 'does', 'did',
    'can', 'could', 'how', 'what', 'where', 'when', 'who', 'which', 'want', 'need', 'needs', 'find',
    'get', 'getting', 'please', 'help', 'some', 'any', 'there', 'about', 'from', 'this', 'that', 'go',
    'should', 'would', 'will', 'near', 'nearest', 'kiribati', 'te', 'ao', 'n', 'much', 'many',
    'service', 'services', 'information', 'info', 'office'
  ]);

  // Each group is a set of words that mean (roughly) the same thing for searching.
  // Add new words here when people search for something and get no results.
  var SYNONYM_GROUPS = [
    ['licence', 'license', 'licensing', 'licencing', 'permit', 'laisenti'],
    ['driver', 'driving', 'drive', 'drivers'],
    ['renew', 'renewal', 'renewing', 'expired', 'expire', 'extend'],
    ['clinic', 'health centre', 'health center', 'dispensary', 'hospital', 'doctor', 'nurse', 'medical', 'sick', 'aoraki'],
    ['job', 'work', 'employment', 'vacancy', 'career', 'mwakuri', 'hiring'],
    ['scholarship', 'bursary', 'sponsorship', 'study', 'university'],
    ['ship', 'boat', 'ferry', 'shipping', 'vessel', 'booti'],
    ['flight', 'plane', 'airline', 'fly', 'airport', 'aircraft'],
    ['bus', 'minibus', 'taxi'],
    ['police', 'polis', 'crime', 'theft', 'stolen'],
    ['mechanic', 'garage', 'workshop', 'repair'],
    ['electricity', 'power', 'pub', 'blackout', 'outage'],
    ['money', 'cash', 'remittance', 'transfer'],
    ['price', 'cost', 'fee', 'boo', 'charge'],
    ['emergency', 'urgent', 'danger', 'ambulance'],
    ['medicine', 'pharmacy', 'chemist', 'drug', 'tablet'],
    ['passport', 'travel document'],
    ['certificate', 'certificat', 'record'],
    ['school', 'reirei', 'enrol', 'enroll', 'enrolment', 'enrollment'],
    ['business', 'bitineti', 'company', 'shop'],
    ['abuse', 'violence', 'hurt', 'beaten']
  ];

  // Field weights: how important a match in each field is.
  var FIELD_WEIGHTS = {
    name: 10,
    keywords: 8,
    subcategory: 5,
    category: 5,
    summary: 4,
    provider: 3,
    islands: 3,
    location: 2,
    steps: 1,
    requirements: 1
  };

  // Extra points when a query word names the service's category ("health", "jobs").
  var CATEGORY_INTENT_BONUS = 6;

  var MATCH_EXACT = 1;
  var MATCH_PREFIX = 0.7;
  var MATCH_FUZZY = 0.5;
  var SYNONYM_FACTOR = 0.6;

  function toSet(list) {
    var o = Object.create(null);
    for (var i = 0; i < list.length; i++) o[list[i]] = true;
    return o;
  }

  /** Lower-case, remove accents (e.g. Kiribati macrons), apostrophes and punctuation. */
  function normalize(text) {
    if (text === null || text === undefined) return '';
    var s = String(text).toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/['’`]/g, '');           // driver's -> drivers
    s = s.replace(/[^a-z0-9]+/g, ' ');          // punctuation -> space
    return s.replace(/\s+/g, ' ').trim();
  }

  /** Very light stemming: plural "s" only. Keeps short words and "ss" words intact. */
  function stem(word) {
    if (word.length > 4 && /[^s]s$/.test(word) && !/(us|is|ss)$/.test(word)) {
      if (/ies$/.test(word)) return word.slice(0, -3) + 'y';
      return word.slice(0, -1);
    }
    return word;
  }

  function tokenize(text, keepStopwords) {
    var parts = normalize(text).split(' ');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var w = parts[i];
      if (!w) continue;
      if (!keepStopwords && STOPWORDS[w]) continue;
      out.push(stem(w));
    }
    return out;
  }

  // Map every synonym word -> list of the other words in its groups.
  var SYNONYMS = (function () {
    var map = Object.create(null);
    for (var g = 0; g < SYNONYM_GROUPS.length; g++) {
      var words = [];
      for (var i = 0; i < SYNONYM_GROUPS[g].length; i++) {
        words = words.concat(tokenize(SYNONYM_GROUPS[g][i], true));
      }
      for (var j = 0; j < words.length; j++) {
        var w = words[j];
        if (!map[w]) map[w] = [];
        for (var k = 0; k < words.length; k++) {
          if (words[k] !== w && map[w].indexOf(words[k]) === -1) map[w].push(words[k]);
        }
      }
    }
    return map;
  })();

  /**
   * Edit distance (Damerau-Levenshtein, adjacent swaps count as one edit) with an early exit
   * once it exceeds max. Uses three reusable rows, so it does not create garbage per call.
   */
  var rowA = [], rowB = [], rowC = [];
  function editDistance(a, b, max) {
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var prev2 = rowA, prev = rowB, cur = rowC, tmp;
    for (var j = 0; j <= lb; j++) prev[j] = j;
    for (var i = 1; i <= la; i++) {
      cur[0] = i;
      var rowMin = i;
      var ca = a.charCodeAt(i - 1);
      for (var k = 1; k <= lb; k++) {
        var cb = b.charCodeAt(k - 1);
        var v = prev[k - 1] + (ca === cb ? 0 : 1);
        if (prev[k] + 1 < v) v = prev[k] + 1;
        if (cur[k - 1] + 1 < v) v = cur[k - 1] + 1;
        if (i > 1 && k > 1 && ca === b.charCodeAt(k - 2) && a.charCodeAt(i - 2) === cb && prev2[k - 2] + 1 < v) {
          v = prev2[k - 2] + 1;
        }
        cur[k] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      tmp = prev2; prev2 = prev; prev = cur; cur = tmp;
    }
    return prev[lb];
  }

  function allowedTypos(word) {
    if (word.length >= 8) return 2;
    if (word.length >= 4) return 1;
    return 0;
  }

  /**
   * How well one query word matches one document word (0..1).
   * allowFuzzy is false for synonyms (they are spelled correctly already).
   * Typo matching assumes the first letter is right – this keeps search fast.
   */
  function wordMatch(q, d, allowFuzzy) {
    if (q === d) return MATCH_EXACT;
    if (q.length >= 3 && d.length > q.length && d.charCodeAt(0) === q.charCodeAt(0) && d.indexOf(q) === 0) return MATCH_PREFIX;
    if (!allowFuzzy || d.charCodeAt(0) !== q.charCodeAt(0)) return 0;
    var typos = allowedTypos(q);
    if (typos && Math.abs(q.length - d.length) <= typos && editDistance(q, d, typos) <= typos) return MATCH_FUZZY;
    return 0;
  }

  function asArray(v) {
    if (Array.isArray(v)) return v;
    if (v === null || v === undefined || v === '') return [];
    return [v];
  }

  /**
   * Build a search index from services. Do this once when data loads.
   * categories (optional) lets "health" match services in the Health category.
   *
   * The index is "inverted": for every word we store which services contain it and how
   * important the field is (name > keywords > ... > steps). A search then only compares the
   * query with each distinct word once, which keeps it fast on cheap phones.
   */
  function buildIndex(services, categories) {
    var catNames = Object.create(null);
    asArray(categories).forEach(function (c) {
      catNames[c.id] = [c.id, c.name, c.name_gil || ''].join(' ');
    });
    var docs = [];
    var vocab = Object.create(null);    // word -> how many times it appears (for "did you mean")
    var postings = Object.create(null); // word -> [docIndex, weight, docIndex, weight, ...]
    asArray(services).forEach(function (s, d) {
      var best = Object.create(null);   // word -> best field weight in this service
      Object.keys(FIELD_WEIGHTS).forEach(function (f) {
        var raw = f === 'category' ? (catNames[s.category] || s.category) : asArray(s[f]).join(' ');
        var toks = tokenize(raw, false);
        for (var i = 0; i < toks.length; i++) {
          var w = toks[i];
          vocab[w] = (vocab[w] || 0) + 1;
          if (!best[w] || FIELD_WEIGHTS[f] > best[w]) best[w] = FIELD_WEIGHTS[f];
        }
      });
      for (var word in best) {
        if (!postings[word]) postings[word] = [];
        postings[word].push(d, best[word]);
      }
      docs.push({
        service: s,
        catWords: tokenize(catNames[s.category] || s.category, true),
        phrase: normalize(s.name + ' ' + asArray(s.keywords).join(' '))
      });
    });
    return { docs: docs, vocab: vocab, postings: postings, words: Object.keys(postings) };
  }

  /** Query words plus synonyms. Each entry: { word, weight, group } (group = original query word index). */
  function expandQuery(tokens) {
    var terms = [];
    for (var i = 0; i < tokens.length; i++) {
      terms.push({ word: tokens[i], weight: 1, group: i });
      var syns = SYNONYMS[tokens[i]] || [];
      for (var j = 0; j < syns.length; j++) terms.push({ word: syns[j], weight: SYNONYM_FACTOR, group: i });
    }
    return terms;
  }

  /**
   * Search services.
   * options: { category, island, verifiedOnly, limit }
   * Returns { query, tokens, results: [{ service, score, matched }], suggestion }
   */
  function search(index, query, options) {
    options = options || {};
    var tokens = tokenize(query, false);
    if (!tokens.length) tokens = tokenize(query, true); // e.g. the user only typed "help"
    var terms = expandQuery(tokens);
    var results = [];

    if (!tokens.length) {
      for (var a = 0; a < index.docs.length; a++) {
        if (passesFilters(index.docs[a].service, options)) results.push({ service: index.docs[a].service, score: 0, matched: 0 });
      }
    }

    // 1. For each query word (and synonym), find matching index words and add points per service.
    var perDoc = Object.create(null); // docIndex -> best points for each query word
    for (var t = 0; tokens.length && t < terms.length; t++) {
      var term = terms[t];
      for (var v = 0; v < index.words.length; v++) {
        var m = wordMatch(term.word, index.words[v], term.weight === 1);
        if (!m) continue;
        var list = index.postings[index.words[v]];
        for (var p = 0; p < list.length; p += 2) {
          var pts = m * list[p + 1] * term.weight;
          var groups = perDoc[list[p]];
          if (!groups) {
            groups = perDoc[list[p]] = [];
            for (var g = 0; g < tokens.length; g++) groups.push(0);
          }
          if (pts > groups[term.group]) groups[term.group] = pts;
        }
      }
    }

    // 2. Turn points into a final score for each matching service.
    var phrase = tokens.join(' ');
    for (var key in perDoc) {
      var doc = index.docs[key];
      var s = doc.service;
      if (!passesFilters(s, options)) continue;
      var groupBest = perDoc[key];
      var score = 0, matched = 0;
      for (var b = 0; b < groupBest.length; b++) {
        if (groupBest[b] > 0) { matched++; score += groupBest[b]; }
      }
      if (!matched) continue;

      // Services matching more of the query words rank higher.
      var coverage = matched / tokens.length;
      score = score * (0.4 + 0.6 * coverage * coverage);
      // Whole phrase appears in the name/keywords: strong signal.
      if (tokens.length > 1 && doc.phrase.indexOf(phrase) !== -1) score += 8;
      for (var c = 0; c < tokens.length; c++) {
        if (doc.catWords.indexOf(tokens[c]) !== -1) { score += CATEGORY_INTENT_BONUS; break; }
      }
      if (s.popular) score += 1;
      if (s.verification === 'verified') score += 0.5;
      if (s.verification === 'outdated') score -= 2;

      results.push({ service: s, score: Math.round(score * 100) / 100, matched: matched });
    }

    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.service.name).localeCompare(String(b.service.name));
    });

    // Drop weak tail results when we have strong ones (keeps results focused).
    if (results.length && tokens.length) {
      var top = results[0].score;
      results = results.filter(function (r) { return r.score >= top * 0.2; });
    }
    if (options.limit) results = results.slice(0, options.limit);

    return {
      query: String(query || ''),
      tokens: tokens,
      results: results,
      suggestion: results.length ? null : suggest(index, tokens)
    };
  }

  function passesFilters(s, o) {
    if (o.category && s.category !== o.category) return false;
    if (o.island) {
      var isl = asArray(s.islands);
      if (isl.indexOf(o.island) === -1 && isl.indexOf('All islands') === -1) return false;
    }
    if (o.verifiedOnly && s.verification !== 'verified') return false;
    return true;
  }

  /** "Did you mean": replace each unknown word with the closest known word. */
  function suggest(index, tokens) {
    if (!tokens.length) return null;
    var changed = false;
    var out = tokens.map(function (t) {
      if (index.vocab[t] || SYNONYMS[t]) return t;
      var best = null, bestDist = 3, bestFreq = 0;
      for (var w in index.vocab) {
        if (Math.abs(w.length - t.length) > 2) continue;
        var dist = editDistance(t, w, 2);
        if (dist < bestDist || (dist === bestDist && index.vocab[w] > bestFreq)) {
          best = w; bestDist = dist; bestFreq = index.vocab[w];
        }
      }
      if (best && bestDist <= 2) { changed = true; return best; }
      return t;
    });
    return changed ? out.join(' ') : null;
  }

  var api = {
    normalize: normalize,
    tokenize: tokenize,
    editDistance: editDistance,
    buildIndex: buildIndex,
    search: search,
    synonyms: SYNONYMS
  };

  root.IKHSearch = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
