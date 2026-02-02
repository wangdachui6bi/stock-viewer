const tseslint = require('@typescript-eslint/eslint-plugin');
const parser = require('@typescript-eslint/parser');
const vue = require('eslint-plugin-vue');
const globals = require('globals');

module.exports = [
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      parser: require('vue-eslint-parser'),
      parserOptions: {
        parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      vue,
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...vue.configs['flat/essential'].rules,
      '@typescript-eslint/no-explicit-any': 'off',

      // 禁止幽灵依赖 - 禁止直接从dayjs导入
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['dayjs'],
              message: '禁止直接导入dayjs包！请使用 import { dayjs } from "element-plus" 来导入dayjs。',
            },
          ],
        },
      ],
    },
  },
];
