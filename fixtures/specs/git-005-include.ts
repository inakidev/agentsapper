import type { FixtureSpec } from '../spec.js';
import { MARKER_COMMAND } from '../spec.js';
import { gitDir, lines, SOURCES } from './helpers.js';

export const specs: FixtureSpec[] = [
  {
    id: 'git-005-include',
    description:
      'include.path pulls config from a file in the repo, which is analyzed in turn; includes ' +
      'that are missing or point outside the repo are reported at lower severity.',
    kind: 'malicious',
    source: SOURCES.gitConfigDocs,
    files: [
      ...gitDir(
        '.git',
        lines(
          '[core]',
          '\tbare = false',
          '[include]',
          '\tpath = ../tools/git.inc',
          '\tpath = missing.inc',
          '[includeIf "gitdir:/nowhere/"]',
          '\tpath = /agentsapper-outside/x.inc',
        ),
      ),
      {
        type: 'file',
        path: 'tools/git.inc',
        content: lines('[core]', `\tfsmonitor = ${MARKER_COMMAND}`),
      },
    ],
    expect: [
      { ruleId: 'GIT-005', severity: 'high', file: '.git/config', line: 4 },
      { ruleId: 'GIT-005', severity: 'low', file: '.git/config', line: 5 },
      { ruleId: 'GIT-005', severity: 'medium', file: '.git/config', line: 7 },
      { ruleId: 'GIT-001', severity: 'critical', file: 'tools/git.inc', line: 2 },
    ],
  },
];
