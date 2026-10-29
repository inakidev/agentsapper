import type { FixtureSpec } from '../spec.js';
import { MARKER_COMMAND } from '../spec.js';
import { gitDir, lines, SOURCES } from './helpers.js';

export const specs: FixtureSpec[] = [
  {
    id: 'git-008-embedded-bare',
    description:
      'A bare repository buried in a subdirectory. Running git inside it uses its config, ' +
      'which survives a plain clone because the bare repo is ordinary tracked files.',
    kind: 'malicious',
    source: SOURCES.buriedBareRepos,
    files: gitDir(
      'vendor/pkg',
      lines('[core]', '\tbare = false', `\tfsmonitor = ${MARKER_COMMAND}`),
    ),
    expect: [
      { ruleId: 'GIT-008', severity: 'high', file: 'vendor/pkg' },
      { ruleId: 'GIT-001', severity: 'critical', file: 'vendor/pkg/config', line: 3 },
    ],
  },
  {
    id: 'git-008-nested-dotgit',
    description: 'A nested repository with its own .git directory, as an archive can carry.',
    kind: 'malicious',
    source: SOURCES.buriedBareRepos,
    files: gitDir('sub/.git', lines('[core]', `\tpager = ${MARKER_COMMAND}`)),
    expect: [
      { ruleId: 'GIT-008', severity: 'high', file: 'sub/.git' },
      { ruleId: 'GIT-002', severity: 'high', file: 'sub/.git/config', line: 2 },
    ],
  },
];
