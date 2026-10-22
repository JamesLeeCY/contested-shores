import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'localStorage', 'requestAnimationFrame', 'performance'];

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // e2e tests poke at the page's debug handle.
    files: ['tests/e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // Simulation must be deterministic and DOM-free (spec §10.3).
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use src/sim/rng.ts' },
        { object: 'Date', property: 'now', message: 'Simulation must not read wall-clock time' },
        { object: 'performance', property: 'now', message: 'Simulation must not read wall-clock time' },
      ],
      'no-restricted-globals': ['error', ...DOM_GLOBALS.map((name) => ({ name, message: 'No DOM in src/sim' }))],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/render/**', '**/ui/**', 'pixi.js'], message: 'sim must not import render/ui' }] },
      ],
    },
  },
);
