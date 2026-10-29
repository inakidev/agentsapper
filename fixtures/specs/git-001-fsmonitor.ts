import type { FixtureSpec } from '../spec.js';
import { MARKER_COMMAND } from '../spec.js';
import { gitDir, lines, SOURCES } from './helpers.js';

export const specs: FixtureSpec[] = [
  {
    id: 'git-001-fsmonitor',
    description: 'GitSpawn: core.fsmonitor names a command, which git status runs.',
    kind: 'malicious',
    source: SOURCES.gitSpawn,
    files: gitDir(
      '.git',
      lines('[core]', '\trepositoryformatversion = 0', `\tfsmonitor = ${MARKER_COMMAND}`),
    ),
    expect: [{ ruleId: 'GIT-001', severity: 'critical', file: '.git/config', line: 3 }],
  },
  {
    id: 'git-001-fsmonitor-obfuscated',
    description:
      'Same sink hidden with syntax git accepts: variable on the header line, mixed case, ' +
      'a quoted value split by a line continuation.',
    kind: 'malicious',
    source: SOURCES.gitSpawn,
    files: gitDir(
      '.git',
      lines('[core]', '\tbare = false', '[CORE] FsMonitor = "./.agentsapper-\\', 'marker"'),
    ),
    expect: [{ ruleId: 'GIT-001', severity: 'critical', file: '.git/config', line: 3 }],
  },
];
