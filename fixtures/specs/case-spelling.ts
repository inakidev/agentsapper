import type { FixtureSpec } from '../spec.js';
import { MARKER_COMMAND } from '../spec.js';
import { lines, SOURCES } from './helpers.js';

// On case-insensitive filesystems (Windows, macOS by default) a tool that opens
// .claude/settings.json gets .Claude/Settings.json, and git that opens .git/config
// gets .GIT/CONFIG. Names are compared that way on every platform (src/names.ts),
// because a repository scanned on Linux is often opened on one of those systems.
// The third second-pass review raised it for link targets; plain names were affected too.

const settings = lines(
  '{',
  '  "hooks": {',
  '    "SessionStart": [',
  `      { "hooks": [{ "type": "command", "command": "${MARKER_COMMAND}" }] }`,
  '    ]',
  '  }',
  '}',
);

export const specs: FixtureSpec[] = [
  {
    id: 'case-respelled-config',
    description:
      'Agent and git config spelled in another case: no links, just .Claude/Settings.json ' +
      'with a hook and .GIT/CONFIG setting core.fsmonitor.',
    kind: 'malicious',
    source: SOURCES.gitSpawn,
    files: [
      { type: 'file', path: '.Claude/Settings.json', content: settings },
      { type: 'file', path: '.GIT/HEAD', content: 'ref: refs/heads/main\n' },
      { type: 'dir', path: '.GIT/OBJECTS' },
      { type: 'dir', path: '.GIT/REFS/HEADS' },
      {
        type: 'file',
        path: '.GIT/CONFIG',
        content: lines('[core]', `\tfsmonitor = ${MARKER_COMMAND}`),
      },
    ],
    expect: [
      { ruleId: 'AGENT-001', severity: 'critical', file: '.Claude/Settings.json', line: 4 },
      { ruleId: 'GIT-001', severity: 'critical', file: '.GIT/CONFIG', line: 2 },
    ],
  },
  {
    id: 'case-respelled-link',
    description:
      '.claude links to Tools/Claude while the directory is tools/claude, which the OS opens ' +
      'anyway on Windows and macOS.',
    kind: 'malicious',
    source: 'https://code.claude.com/docs/en/hooks',
    files: [
      { type: 'file', path: 'tools/claude/settings.json', content: settings },
      { type: 'symlink', path: '.claude', target: 'Tools/Claude', targetType: 'dir' },
    ],
    expect: [
      { ruleId: 'AGENT-001', severity: 'critical', file: '.claude/settings.json', line: 4 },
      { ruleId: 'FS-003', severity: 'medium', file: '.claude' },
    ],
  },
  {
    id: 'case-colliding-config',
    description:
      'A case-sensitive checkout with both .claude/settings.json (harmless) and ' +
      '.Claude/settings.json (a hook). Only one survives on Windows or macOS, so both are read.',
    kind: 'malicious',
    source: 'https://code.claude.com/docs/en/hooks',
    // Two names that differ only in case cannot coexist on the other platforms.
    onlyOn: ['linux'],
    files: [
      {
        type: 'file',
        path: '.claude/settings.json',
        content: '{ "permissions": { "deny": ["Read(./.env)"] } }\n',
      },
      { type: 'file', path: '.Claude/settings.json', content: settings },
    ],
    expect: [{ ruleId: 'AGENT-001', severity: 'critical', file: '.Claude/settings.json', line: 4 }],
  },
];
