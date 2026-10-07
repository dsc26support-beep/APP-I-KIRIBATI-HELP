/**
 * I-Kiribati Help – Web App entry points.
 *
 * Deploy: Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * Copy the /exec URL into js/config.js (API_URL) on the website.
 *
 * Public GET:
 *   ?action=data                    full public dataset (same shape as data/fallback-data.json)
 *   ?action=search&q=...            search (optional: cat, island, verified=1, limit)
 *   ?action=health                  simple "is it working" check
 *
 * POST body (Content-Type text/plain): {"action": "...", "payload": {...}}
 *   report                          public "report incorrect information"
 *   track                           anonymous usage statistics
 *   adminLogin / admin*             admin page actions (see Admin.gs)
 */

function doGet(e) {
  return handle_(function () {
    var p = (e && e.parameter) || {};
    var action = p.action || 'data';
    switch (action) {
      case 'data': return getPublicData_();
      case 'search': return apiSearch_(p);
      case 'health': return { status: 'ok', version: dataVersion_(), time: nowIso_() };
      default: throw ApiError_('Unknown action.', 'not_found');
    }
  });
}

function doPost(e) {
  return handle_(function () {
    var raw = e && e.postData && e.postData.contents;
    if (!raw) throw ApiError_('Empty request.', 'invalid');
    if (raw.length > CONFIG.MAX_BODY_BYTES) throw ApiError_('Request too large.', 'invalid');
    var body;
    try { body = JSON.parse(raw); } catch (err) { throw ApiError_('Request is not valid JSON.', 'invalid'); }
    var action = String(body.action || '');
    var payload = body.payload || {};

    if (action === 'report') return apiReport_(payload);
    if (action === 'track') return apiTrack_(payload);
    if (action.indexOf('admin') === 0) return handleAdmin_(action, payload);
    throw ApiError_('Unknown action.', 'not_found');
  });
}

/** Run an action and always return JSON. Internal error details are logged, not shown. */
function handle_(fn) {
  try {
    return jsonOut_(ok_(fn()));
  } catch (err) {
    if (err && err.apiCode) return jsonOut_(fail_(err.message, err.apiCode));
    console.error(err && err.stack ? err.stack : err);
    return jsonOut_(fail_('Something went wrong. Please try again later.', 'server_error'));
  }
}

/**
 * Simple trigger: when someone edits the Services sheet by hand, publish a new data
 * version so phones pick up the change (within about an hour).
 */
function onEdit(e) {
  try {
    if (e && e.range && e.range.getSheet().getName() === CONFIG.SHEETS.SERVICES) bumpDataVersion_();
  } catch (err) { /* ignore */ }
}

/** Adds an "I-Kiribati Help" menu to the spreadsheet. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('I-Kiribati Help')
    .addItem('Publish changes now', 'menuPublish')
    .addItem('Check data for problems', 'menuValidate')
    .addSeparator()
    .addItem('Set up sheets (first time only)', 'setup')
    .addToUi();
}

function menuPublish() {
  var v = bumpDataVersion_();
  SpreadsheetApp.getUi().alert('Published. Data version ' + v + '. Phones will update within about an hour.');
}

function menuValidate() {
  var problems = validateAllServices_();
  SpreadsheetApp.getUi().alert(problems.length ? problems.slice(0, 30).join('\n') : 'No problems found.');
}

/** Check every row in the Services sheet with the same rules as the admin page. */
function validateAllServices_() {
  var problems = [];
  var seen = {};
  readServices_(true).forEach(function (s) {
    var check = validateService_(s);
    if (seen[s.id]) problems.push('Row ' + s._row + ': duplicate ID ' + s.id);
    seen[s.id] = true;
    if (!check.ok) problems.push('Row ' + s._row + ' (' + s.id + '): ' + check.errors.join(' '));
  });
  return problems;
}
