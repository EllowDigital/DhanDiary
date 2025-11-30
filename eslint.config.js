const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const prettier = require('eslint-config-prettier');

module.exports = [
  // -------------------------------------------------------
  // Base JS Recommended Rules
  // -------------------------------------------------------
  js.configs.recommended,

  // -------------------------------------------------------
  // 1. MAIN PROJECT FILES (TS/JS/TSX/JSX)
  // -------------------------------------------------------
  {
    files: ['**/*.{js,jsx,ts,tsx}'],

    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },

      globals: {
        // React Native globals
        __DEV__: true,
        console: true,
        fetch: true,
        setTimeout: true,
        clearTimeout: true,
        setInterval: true,
        clearInterval: true,
        process: true,
        module: true,
        require: true,

        // Jest globals
        jest: true,
        describe: true,
        it: true,
        expect: true,
        beforeAll: true,
        afterAll: true,
        beforeEach: true,
        afterEach: true,
      },
    },

    plugins: {
      '@typescript-eslint': tseslint,
    },

    rules: {
      ...tseslint.configs.recommended.rules,

      // Relax TS rules for React Native
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-require-imports': 'off',

      'no-empty': 'off',

      // Disable prettier reporting (optional, safe for RN)
      'prettier/prettier': 'off',
    },
  },

  // -------------------------------------------------------
  // 2. CONFIG / BUILD / SCRIPT FILES
  // (avoid TS project parser)
  // -------------------------------------------------------
  {
    files: [
      'babel.config.js',
      'metro.config.js',
      'jest.config.js',
      'jest.setup.js',
      'tailwind.config.js',
      'postcss.config.js',
      '*.config.js',
      'scripts/*.js', // 👈 Required for migrate.js & other scripts
    ],

    languageOptions: {
      parserOptions: {
        project: null, // prevent TS parser error
      },

      globals: {
        require: true,
        module: true,
        __dirname: true,
        process: true,
        console: true,
        global: true,
      },
    },

    rules: {},
  },

  // -------------------------------------------------------
  // 2b. Test files - enable jest env and avoid TS project parser for JS helpers
  // -------------------------------------------------------
  {
    files: ['__tests__/**', '**/*.test.js', '**/*.test.ts', '**/*.spec.ts', '**/*.test.tsx'],
    languageOptions: {
      parserOptions: {
        project: null,
      },
      globals: {
        jest: true,
        describe: true,
        it: true,
        test: true,
        expect: true,
        beforeAll: true,
        afterAll: true,
        beforeEach: true,
        afterEach: true,
        global: true,
      },
    },
  },

  // -------------------------------------------------------
  // 3. Prettier Config (must be last)
  // -------------------------------------------------------
  prettier,
];
