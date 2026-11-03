import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// Rules follow the FAIRmat taxonomy app (app/eslint.config.js).
export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Model: plain TypeScript, no UI — file handling and the Python runtime stay testable in Node
    // (same rule as the taxonomy app's api/ layer).
    files: ['src/workspace/localFiles.ts', 'src/runtime/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', '@mui/*', '@emotion/*'],
              message: 'Model code must not depend on UI libraries.',
            },
            {
              group: ['@/components/*', '@/pages/*'],
              message: 'Model code must not depend on outer layers.',
            },
          ],
        },
      ],
    },
  },
  {
    // UI rule for this app: no hand-written CSS. Style with MUI components, theme
    // tokens and `sx`; shared building blocks live in src/components/common/.
    files: ['src/components/designer/**/*.{ts,tsx}', 'src/pages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*.css', '@emotion/*'],
              message: 'No custom CSS: use MUI components, theme tokens and sx.',
            },
            {
              group: ['@mui/material/styles/styled', '@mui/system'],
              message: 'No styled(): reuse a shared component instead.',
            },
          ],
        },
      ],
    },
  },
);
