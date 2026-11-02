import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const NETWORK_MESSAGE = 'Only src/lib/net.ts may make network requests (VLO_SPEC section 10).';

const NETWORK_APIS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'WebTransport',
  'RTCPeerConnection',
  'sendBeacon',
];

const networkRules = {
  'no-restricted-globals': [
    'error',
    ...NETWORK_APIS.filter((name) => name !== 'sendBeacon').map((name) => ({
      name,
      message: NETWORK_MESSAGE,
    })),
  ],
  // Property-only entries catch window.fetch, globalThis.WebSocket, window.navigator.sendBeacon and the like.
  'no-restricted-properties': [
    'error',
    ...NETWORK_APIS.map((property) => ({ property, message: NETWORK_MESSAGE })),
  ],
};

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'playwright-report', 'test-results', 'node_modules'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['src/features/x.ts', 'src/lib/net.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
    },
  },
  {
    files: ['src/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: { globals: globals.browser },
    rules: networkRules,
  },
  {
    files: ['src/lib/net.ts'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}', 'tests/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
