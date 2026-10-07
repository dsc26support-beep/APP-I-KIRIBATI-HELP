/**
 * I-Kiribati Help – backend settings.
 * Edit the values here; you should not need to change the other files.
 */
var CONFIG = {
  // Leave empty if this script is attached to the spreadsheet (Extensions → Apps Script).
  // Otherwise set Script Property SPREADSHEET_ID (Project Settings → Script Properties).
  SPREADSHEET_ID_PROPERTY: 'SPREADSHEET_ID',

  SHEETS: {
    SERVICES: 'Services',
    REPORTS: 'Reports',
    SEARCH_LOG: 'SearchLog',
    ADMIN_LOG: 'AdminLog'
  },

  // Columns of the Services sheet, in order. "notes" and "verifiedBy" are internal (never public).
  SERVICE_COLUMNS: [
    'id', 'status', 'name', 'category', 'subcategory', 'islands', 'location', 'summary',
    'steps', 'requirements', 'fees', 'hours', 'phone', 'email', 'website', 'mapUrl',
    'provider', 'sourceName', 'sourceUrl', 'lastVerified', 'verification', 'updatedAt',
    'keywords', 'popular', 'important', 'name_gil', 'summary_gil', 'verifiedBy', 'notes'
  ],
  INTERNAL_COLUMNS: ['status', 'verifiedBy', 'notes'],
  LIST_COLUMNS: { islands: ',', keywords: ',', steps: '\n', requirements: '\n' },
  BOOLEAN_COLUMNS: ['popular', 'important'],

  REPORT_COLUMNS: [
    'reportId', 'receivedAt', 'status', 'serviceId', 'serviceName', 'type', 'details',
    'contact', 'lang', 'clientTime', 'resolvedAt', 'adminNote'
  ],
  SEARCH_LOG_COLUMNS: ['time', 'type', 'query', 'results', 'serviceId', 'category', 'island', 'lang'],
  ADMIN_LOG_COLUMNS: ['time', 'action', 'target', 'detail'],

  STATUSES: ['published', 'draft', 'archived'],
  VERIFICATION: ['verified', 'unverified', 'outdated'],
  REPORT_TYPES: ['phone', 'hours', 'location', 'fees', 'steps', 'closed', 'new', 'other'],

  CATEGORIES: [
    { id: 'government', icon: '🏛', name: 'Government', name_gil: 'Tautaeka', description: 'Licences, passports, certificates, tax and public services' },
    { id: 'health', icon: '🏥', name: 'Health', name_gil: 'Marurung', description: 'Hospitals, clinics, pharmacies and health programmes' },
    { id: 'jobs', icon: '💼', name: 'Jobs', name_gil: 'Mwakuri', description: "Job seeking, labour mobility and workers' rights" },
    { id: 'education', icon: '🎓', name: 'Education', name_gil: 'Reirei', description: 'Schools, training and scholarships' },
    { id: 'transport', icon: '🚤', name: 'Transport', name_gil: 'Mwananga', description: 'Flights, shipping, buses and road transport' },
    { id: 'business', icon: '🏪', name: 'Business & Services', name_gil: 'Bitineti', description: 'Banks, utilities, trades and local businesses' },
    { id: 'prices', icon: '💰', name: 'Prices', name_gil: 'Boo', description: 'Where to check costs and fees' },
    { id: 'emergency', icon: '🆘', name: 'Emergency', name_gil: 'Emergency', description: 'Police, fire, ambulance and disaster information' },
    { id: 'community', icon: '📢', name: 'Community', name_gil: 'Community', description: 'Churches, groups, notices and support services' }
  ],

  ISLANDS: [
    'South Tarawa', 'North Tarawa', 'Abaiang', 'Abemama', 'Aranuka', 'Arorae', 'Banaba', 'Beru',
    'Butaritari', 'Kanton', 'Kiritimati', 'Kuria', 'Maiana', 'Makin', 'Marakei', 'Nikunau',
    'Nonouti', 'Onotoa', 'Tabiteuea North', 'Tabiteuea South', 'Tabuaeran', 'Tamana', 'Teraina'
  ],

  DATA_NOTICE: "Entries marked 'unverified' have not been checked with the provider. Confirm details with the official source before relying on them.",

  // Public data is cached for this long (seconds). Admin saves clear the cache immediately.
  CACHE_SECONDS: 600,

  // Admin security
  ADMIN_SESSION_SECONDS: 4 * 60 * 60,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_SECONDS: 15 * 60,
  MIN_PASSWORD_LENGTH: 12,

  // Abuse protection: maximum requests per minute (whole site).
  RATE_LIMITS: { report: 30, track: 600, search: 300, login: 20 },

  // Size limits
  MAX_BODY_BYTES: 20000,
  MAX_EVENTS_PER_BATCH: 25,
  MAX_REPORT_DETAILS: 1000,

  // Reports: contact details are erased this many days after a report is closed.
  // Search log rows older than this many days are deleted by cleanupOldData().
  SEARCH_LOG_KEEP_DAYS: 180,

  TIMEZONE: 'Pacific/Tarawa'
};
