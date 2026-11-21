import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { readabilityPlugins, readabilityRules, testSpacingRules } from './scripts/readability.mjs';

export default [
  {
    ignores: [
      'node_modules/**',
      'benchmarks/baseline/**',
      'docs/performance-history/**',
      'package/**',
      'coverage/**',
      'artifacts/**',
      '**/temp/**',
      '**/.tmp/**',
      'nbproject/**',
      '.package-*/**',
      '**/*.min.js',
      '**/*.map'
    ]
  },
  {
    ...js.configs.recommended,
    files: ['**/*.{js,cjs,mjs,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }]
    }
  },
  { files: ['**/*.mjs'], languageOptions: { sourceType: 'module' } },
  { files: ['test/browser/**/*.js'], languageOptions: { sourceType: 'script', globals: globals.browser } },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['**/*.{ts,cts,mts,tsx}'] })),
  {
    files: ['**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'IfStatement > ReturnStatement',
          message: 'Put conditional returns inside braces, with the return on its own line.'
        }
      ]
    }
  },
  // Public declarations and compiler fixtures retain their intentional API types and import-equals forms.
  {
    files: ['**/*.d.{ts,cts,mts}', 'test/**/*.{ts,cts,mts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': ['error', { allowAsImport: true }]
    }
  },
  // Compiler fixtures assert type acceptance/rejection without necessarily reading each binding at runtime.
  {
    files: ['test/**/*.{ts,cts,mts,tsx}', 'types/**/*.d.{ts,cts,mts}', '**/*.d.{ts,cts,mts}'],
    rules: { '@typescript-eslint/no-unused-vars': 'off', '@typescript-eslint/no-empty-object-type': 'off' }
  },
  // Boxed-value contracts, explicit receiver checks and ambient/browser fixtures are intentional.
  { files: ['test/types/browser.ts'], rules: { '@typescript-eslint/triple-slash-reference': 'off' } },
  {
    name: 'go-constant/readability',
    files: ['**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}'],
    plugins: readabilityPlugins,
    rules: readabilityRules
  },
  {
    name: 'go-constant/test-spacing',
    files: ['test/**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}'],
    rules: testSpacingRules
  },
  // This byte-identical canonical checker has an external owner; retain correctness checks.
  {
    files: ['scripts/lib/check-library-readme.cjs'],
    rules: {
      'jsdoc/lines-before-block': 'off',
      '@stylistic/padding-line-between-statements': 'off',
      'no-restricted-syntax': 'off'
    }
  }
];
