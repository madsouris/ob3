import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const NODE_GLOBALS = {
  process: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '.agents/**',
      '.npm-cache/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // ADR-04: frontmatter must be written with the `yaml` Document API so
      // comments, key order and unknown keys survive.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'js-yaml',
              message: 'Use the `yaml` package Document API instead (ADR-04).',
            },
          ],
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: NODE_GLOBALS },
  },
  {
    files: ['tests/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
