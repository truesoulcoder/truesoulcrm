import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default [
  // 0. Global ignores
  {
    ignores: [
      // Build output
      '**/.next/**',
      '**/out/**',
      '**/build/**',
      '**/dist/**',
      // Dependencies
      '**/node_modules/**',
      // Generated files
      'src/types/supabase.ts',
      // Config files
      'next.config.js',
      'postcss.config.js',
      'tailwind.config.js',
      // Public assets
      'public/**',
    ],
  },

  // 1. ESLint's recommended rules
  js.configs.recommended,

  // 2. TypeScript-ESLint's recommended rules
  // This includes the parser and plugin for .ts/.tsx files
  ...tseslint.configs.recommended,
  // If you were using type-aware linting extensively and want the full suite:
  // ...tseslint.configs.recommendedTypeChecked, 
  // ...tseslint.configs.stylisticTypeChecked, 

  // 3. Import plugin configuration
  {
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {},
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
        },
      },
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'], // For `eslint-plugin-import` to parse TypeScript
      },
    },
    rules: {
      ...importPlugin.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,
      // Specific custom import rules will be in the main custom block to ensure they override
    },
  },

  // 4. React Hooks plugin configuration
  {
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
    },
  },


  // 5. Custom overrides, language options, settings, and specific rules (formerly section 6)
  // Next.js plugin is configured here using the fine-grained approach
  // This is the main block for your project-specific settings and rule overrides.
  // It will apply to all matched files after the preceding configs.
  {
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    plugins: {
      '@next/next': nextPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      // The TypeScript parser is set up globally by tseslint.configs.recommended.
      // We provide specific parserOptions here for type-aware linting.
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json', // Path to your tsconfig.json for type-aware rules
        tsconfigRootDir: __dirname,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
      // Note: import/resolver and import/parsers were in the import plugin block
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // Basic rules (from original)
      'no-console': 'off',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*'],
              message: 'Prefer absolute imports using the @/ alias',
            },
          ],
        },
      ],

      // Custom/override TypeScript rules (from original)
      '@typescript-eslint/no-unused-vars': [
        'off',
        { 
          argsIgnorePattern: '^_', 
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Type-aware rules (require `project` in parserOptions)
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',

      // Custom/override React Hooks rules (original was same as recommended)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Custom/override Next.js rules (from original, now in the main override block)
      '@next/next/no-html-link-for-pages': 'off',
      '@next/next/no-img-element': 'warn',
      '@next/next/no-sync-scripts': 'error',
      '@next/next/no-typos': 'error',
      '@next/next/no-unwanted-polyfillio': 'error',
      '@next/next/no-page-custom-font': 'off',
      '@next/next/no-css-tags': 'off',

      // Custom/override Import rules (from original)
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-unresolved': ['error', { commonjs: true, caseSensitive: true }],
      'import/named': 'error',
      'import/default': 'error',
      'import/namespace': 'error',
      'import/export': 'error',
      'import/no-named-as-default': 'error',
      'import/no-named-as-default-member': 'error',
      'import/no-duplicates': 'error',
      'import/no-cycle': 'warn',
      'import/no-self-import': 'error',
      'import/no-useless-path-segments': 'warn',
      'import/first': 'error',
      'import/newline-after-import': 'warn',
    },
  },
];


