/**
 * I-Kiribati Help – one-time setup and maintenance jobs.
 */

/** Creates the sheets with the right columns. Safe to run more than once. */
function setup() {
  var ss = getSpreadsheet_();
  ensureSheet_(ss, CONFIG.SHEETS.SERVICES, CONFIG.SERVICE_COLUMNS, true);
  ensureSheet_(ss, CONFIG.SHEETS.REPORTS, CONFIG.REPORT_COLUMNS, true);
  ensureSheet_(ss, CONFIG.SHEETS.SEARCH_LOG, CONFIG.SEARCH_LOG_COLUMNS, false);
  ensureSheet_(ss, CONFIG.SHEETS.ADMIN_LOG, CONFIG.ADMIN_LOG_COLUMNS, false);
  if (!PropertiesService.getScriptProperties().getProperty(DATA_VERSION_PROPERTY)) bumpDataVersion_();
  return 'Setup complete.';
}

function ensureSheet_(ss, name, headers, plainText) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var current = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  // Add any missing columns at the end (never deletes or reorders existing data).
  var missing = headers.filter(function (h) { return current.indexOf(h) === -1; });
  if (!current.length || (current.length === 1 && !current[0])) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else if (missing.length) {
    sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  // Keep values as plain text so "192" stays "192" and dates stay as typed.
  if (plainText) sh.getRange(1, 1, sh.getMaxRows(), sh.getLastColumn()).setNumberFormat('@');
  return sh;
}

/**
 * Copy the starter data from the website into the Services sheet.
 * Run once after setup(), e.g. importSeedData('https://YOUR-SITE.pages.dev/data/fallback-data.json')
 * from the editor (or call importSeedDataFromSite below after editing the URL).
 * Only adds services whose ID is not already in the sheet.
 */
function importSeedData(url) {
  if (!url || !/^https:\/\//.test(url)) throw new Error('Give the full https:// address of fallback-data.json');
  var json = JSON.parse(UrlFetchApp.fetch(url).getContentText());
  return importServices_(json.services || []);
}

function importSeedDataFromSite() {
  return importSeedData('https://ikiribatihelp.pages.dev/data/fallback-data.json');
}

function importServices_(services) {
  return withLock_(function () {
    var sheet = getSheet_(CONFIG.SHEETS.SERVICES);
    var existing = {};
    readServices_(true).forEach(function (s) { existing[s.id] = true; });
    var rows = [];
    var skipped = [];
    services.forEach(function (raw) {
      var input = {};
      for (var k in raw) input[k] = raw[k];
      input.status = raw.status || 'published';
      var check = validateService_(input);
      if (!check.ok) { skipped.push((raw.id || raw.name) + ': ' + check.errors.join(' ')); return; }
      if (existing[check.value.id]) return;
      // Keep the original "updatedAt" date from the file.
      if (raw.updatedAt) check.value.updatedAt = String(raw.updatedAt).slice(0, 10);
      existing[check.value.id] = true;
      rows.push(serviceToRow_(check.value));
    });
    if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    bumpDataVersion_();
    var msg = 'Imported ' + rows.length + ' services.' + (skipped.length ? ' Skipped: ' + skipped.join(' | ') : '');
    Logger.log(msg);
    return msg;
  });
}

/**
 * Privacy clean-up. Add a daily time-driven trigger for this function
 * (Triggers → Add trigger → cleanupOldData → Time-driven → Day timer).
 * Deletes old search log rows and erases contact details of closed reports.
 */
function cleanupOldData() {
  withLock_(function () {
    var log = getSheet_(CONFIG.SHEETS.SEARCH_LOG);
    var cutoff = Date.now() - CONFIG.SEARCH_LOG_KEEP_DAYS * 86400000;
    var last = log.getLastRow();
    if (last >= 2) {
      var times = log.getRange(2, 1, last - 1, 1).getValues();
      var oldCount = 0;
      for (var i = 0; i < times.length; i++) {
        var t = new Date(times[i][0]).getTime();
        if (t && t < cutoff) oldCount++; else break; // rows are in time order
      }
      if (oldCount) log.deleteRows(2, oldCount);
    }

    var rep = getSheet_(CONFIG.SHEETS.REPORTS);
    var contactCol = columnIndex_(rep, 'contact');
    readRows_(rep).forEach(function (r) {
      if (r.status !== 'open' && r.contact) rep.getRange(r._row, contactCol).setValue('');
    });
  });
}
