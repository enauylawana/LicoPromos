import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-server/**', 'node_modules/**', '.runtime/**', '.wwebjs_cache/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: { ...reactHooks.configs.recommended.rules, ...reactRefresh.configs.vite.rules },
  },
  {
    files: ['extension/*.js'],
    languageOptions: {
      globals: {
        chrome: 'readonly', document: 'readonly', window: 'readonly', fetch: 'readonly',
        URL: 'readonly', MutationObserver: 'readonly', getComputedStyle: 'readonly',
        HTMLAnchorElement: 'readonly', HTMLInputElement: 'readonly', HTMLTextAreaElement: 'readonly',
        setTimeout: 'readonly', console: 'readonly',
      },
    },
  },
  {
    files: ['scripts/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly', console: 'readonly', fetch: 'readonly',
        AbortSignal: 'readonly', setTimeout: 'readonly', URL: 'readonly',
      },
    },
  },
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } },
);
