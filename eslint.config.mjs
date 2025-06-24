// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.strict,
  {
    ignores: [
      // Dependencies
      'node_modules/',
      'npm-debug.log*',
      'yarn-debug.log*',
      'yarn-error.log*',

      // Build outputs
      'dist/',
      'build/',
      '*.min.js',
      '*.bundle.js',

      // TypeScript compiled output
      '*.js.map',
      '*.d.ts',

      // Coverage directory used by tools like istanbul
      'coverage/',
      '*.lcov',

      // Optional npm cache directory
      '.npm',

      // Optional eslint cache
      '.eslintcache',

      // Optional REPL history
      '.node_repl_history',

      // Output of 'npm pack'
      '*.tgz',
      // Stores VSCode versions used for testing VSCode extensions
      '.vscode-test',

      // OS generated files
      '.DS_Store',
      '.DS_Store?',
      '._*',
      '.Spotlight-V100',
      '.Trashes',
      'ehthumbs.db',
      'Thumbs.db',

      // IDE files
      '.vscode/',
      '.idea/',
      '*.swp',
      '*.swo',
      '*~',

      // Logs
      'logs',
      '*.log',
      
      // Bundle files
      '*.tgz',
      'ak-bundle.tgz'
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json'
      }
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/await-thenable': 'error',
      'max-len': ['error', {
        code: 80,
        tabWidth: 2,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true
      }]
    }
  }
); 
