// Lint config: catches typos, undefined variables and unused code. Run: npx eslint .
export default [
  {
    files: ['js/**/*.js', 'admin/**/*.js', 'sw.js'],
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: 'script',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly', history: 'readonly',
        localStorage: 'readonly', sessionStorage: 'readonly', fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        AbortController: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', Blob: 'readonly', Event: 'readonly',
        prompt: 'readonly', self: 'readonly', caches: 'readonly', globalThis: 'readonly', Promise: 'readonly', console: 'readonly'
      }
    },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }], 'no-redeclare': 'error', eqeqeq: ['error', 'smart'] }
  },
  {
    files: ['apps-script/**/*.gs'],
    languageOptions: { ecmaVersion: 2018, sourceType: 'script' },
    rules: { 'no-redeclare': 'error', eqeqeq: ['error', 'smart'] }
  },
  { ignores: ['node_modules/**', 'apps-script/SearchCore.gs'] }
];
