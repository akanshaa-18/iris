import eslint from '@eslint/js';

export default [
  eslint.configs.recommended,
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
      sourceType: 'module'
    },
    rules: {
      'no-unused-vars': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
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
]; 
