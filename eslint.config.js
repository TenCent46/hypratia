import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      'dist',
      'src-tauri/target',
      'node_modules',
      'eslint.config.js',
      'public/pdf.worker.min.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tauri-apps/*'],
              message:
                'Only services/storage/*, services/export/*, services/dialog/*, services/secrets/*, services/attachments/*, services/shortcut/*, services/llm/*, services/menu/*, and services/window/* may import @tauri-apps/*. Wrap the platform call in a service.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/services/storage/**',
      'src/services/export/**',
      'src/services/dialog/**',
      'src/services/secrets/**',
      'src/services/attachments/**',
      'src/services/shortcut/**',
      'src/services/llm/**',
      'src/services/menu/**',
      'src/services/window/**',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
];
