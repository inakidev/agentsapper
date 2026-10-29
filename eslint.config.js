import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// src/ must never start an external process. Running `git status` on an
// untrusted repo is the very attack this tool detects, so we parse files
// instead. These rules make that a lint error, not just a convention.
const NO_PROCESS_MESSAGE =
  'src/ must never start external processes (see CLAUDE.md). Parse the files instead.';

const PROCESS_MODULES = ['child_process', 'node:child_process', 'cluster', 'node:cluster'];

// src/ is read-only: the scanner must never modify the repository it inspects.
const READ_ONLY_MESSAGE = 'src/ must never write to the filesystem (see CLAUDE.md: read-only).';
const FS_WRITES = [
  'appendFile',
  'appendFileSync',
  'chmod',
  'chmodSync',
  'chown',
  'chownSync',
  'copyFile',
  'copyFileSync',
  'cp',
  'cpSync',
  'createWriteStream',
  'link',
  'linkSync',
  'mkdir',
  'mkdirSync',
  'mkdtemp',
  'mkdtempSync',
  'promises',
  'rename',
  'renameSync',
  'rm',
  'rmSync',
  'rmdir',
  'rmdirSync',
  'symlink',
  'symlinkSync',
  'truncate',
  'truncateSync',
  'unlink',
  'unlinkSync',
  'utimes',
  'utimesSync',
  'write',
  'writeFile',
  'writeFileSync',
  'writeSync',
];

export default defineConfig(
  { ignores: ['dist/', 'coverage/'] },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            ...PROCESS_MODULES.map((name) => ({ name, message: NO_PROCESS_MESSAGE })),
            ...['module', 'node:module'].map((name) => ({
              name,
              importNames: ['createRequire'],
              message: NO_PROCESS_MESSAGE,
            })),
            ...['fs', 'node:fs'].map((name) => ({
              name,
              importNames: FS_WRITES,
              message: READ_ONLY_MESSAGE,
            })),
            ...['fs/promises', 'node:fs/promises'].map((name) => ({
              name,
              message: READ_ONLY_MESSAGE,
            })),
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.type!="Literal"]',
          message: 'Dynamic imports in src/ must use a string literal.',
        },
        {
          selector: 'ImportExpression[source.value=/^(node:)?(child_process|cluster)$/]',
          message: NO_PROCESS_MESSAGE,
        },
        {
          selector: 'CallExpression[callee.name="require"]',
          message: NO_PROCESS_MESSAGE,
        },
        {
          // Named imports only, so the write-function ban above cannot be sidestepped.
          selector:
            'ImportDeclaration[source.value=/^(node:)?fs$/] > :matches(ImportNamespaceSpecifier, ImportDefaultSpecifier)',
          message: `${READ_ONLY_MESSAGE} Import fs functions by name.`,
        },
        {
          selector: 'ImportExpression[source.value=/^(node:)?fs(\\/promises)?$/]',
          message: `${READ_ONLY_MESSAGE} Import fs functions by name.`,
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'binding', message: NO_PROCESS_MESSAGE },
        { object: 'process', property: '_linkedBinding', message: NO_PROCESS_MESSAGE },
        { object: 'process', property: 'dlopen', message: NO_PROCESS_MESSAGE },
      ],
    },
  },
  prettier,
);
