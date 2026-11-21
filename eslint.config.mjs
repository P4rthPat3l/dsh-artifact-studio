import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', 'assets/', '.scratch/', '.dsh/', '.idea/', '.impeccable/', 'examples/', 'tests/fixtures/', 'client.js', 'client.*.js'],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    rules: {
      'no-console': 'error',
      'no-empty': 'error',
    },
  },
  {
    // The TS parser only; the rules need no type information.
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-console': 'error',
      'no-empty': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
    },
  },
  {
    files: ['scripts/**', 'tests/**'],
    rules: { 'no-console': 'off' },
  },
);
