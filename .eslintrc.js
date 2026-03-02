module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  settings: {
    react: { version: 'detect' },
  },
  env: {
    es2022: true,
    node: true,
  },
  globals: {
    __DEV__: 'readonly',
  },
  rules: {
    // React 19 não precisa de import React
    'react/react-in-jsx-scope': 'off',
    // Permitir JSX em .tsx
    'react/jsx-filename-extension': [1, { extensions: ['.tsx'] }],
    // TypeScript lida com prop-types
    'react/prop-types': 'off',
    // Permitir require() dinâmico (usado no Aether BaaS)
    '@typescript-eslint/no-require-imports': 'off',
    // Warn em vez de error para any (migração gradual)
    '@typescript-eslint/no-explicit-any': 'warn',
    // Permitir vars não usados com prefixo _
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Console deve usar logger (warn para migração gradual)
    'no-console': 'warn',
    // Hooks rules
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  ignorePatterns: ['node_modules/', '.expo/', 'dist/', 'babel.config.js', 'metro.config.js', 'tailwind.config.js'],
};
