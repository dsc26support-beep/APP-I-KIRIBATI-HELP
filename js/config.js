/*
 * I-Kiribati Help – site settings.
 * This is the only file you need to edit when deploying.
 */
window.IKH_CONFIG = {
  // Your Google Apps Script Web App URL (ends in /exec).
  // Leave empty to run from data/fallback-data.json only (offline/demo mode).
  API_URL: '',

  // Public contact email shown on the Contact page. Leave empty to hide it.
  CONTACT_EMAIL: '',

  // Site address (used for share links). No trailing slash.
  SITE_URL: 'https://ikiribatihelp.pages.dev',

  // Anonymous usage statistics (search words and result counts only – no personal data).
  // Set to false to switch off completely.
  ANALYTICS_ENABLED: true,

  // How long cached data is considered fresh before checking for updates (minutes).
  DATA_REFRESH_MINUTES: 60,

  // Network timeout for API calls (milliseconds). Kept short for slow connections.
  API_TIMEOUT_MS: 8000,

  APP_VERSION: '1.0.0'
};
