import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Deliberately one rule. A hook called after an early return renders fine while
// loading and throws the moment data arrives, which took every deal page down
// on 2026-09-12 and passed typecheck, tests and review.
export default [
  { ignores: ['.next/**', 'node_modules/**', 'public/**'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error' },
  },
];
