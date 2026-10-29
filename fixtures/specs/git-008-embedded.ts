import type { FixtureSpec } from '../spec.js';
import { MARKER_COMMAND } from '../spec.js';
import { gitDir, lines, SOURCES } from './helpers.js';

export const specs: FixtureSpec[] = [
  {
    id: 'git-008-embedded-bare',
    description:
      'A bare repository buried in a subdirectory, shaped like the published proof of concept: ' +
      'bare = false plus a worktree subdirectory, so git status run inside it refreshes an index ' +
      'and runs core.fsmonitor. It survives a plain clone because it is ordinary tracked files.',
    kind: 'malicious',
    source: SOURCES.buriedBareRepos,
    files: [
      ...gitDir(
        'vendor/pkg',
        lines(
          '[core]',
          '\trepositoryformatversion = 0',
          '\tfilemode = true',
          '\tbare = false',
          '\tworktree = "worktree"',
          `\tfsmonitor = ${MARKER_COMMAND}`,
        ),
      ),
      { type: 'file', path: 'vendor/pkg/worktree/.gitkeep', content: '' },
    ],
    expect: [
      { ruleId: 'GIT-008', severity: 'high', file: 'vendor/pkg' },
      { ruleId: 'GIT-001', severity: 'critical', file: 'vendor/pkg/config', line: 6 },
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
