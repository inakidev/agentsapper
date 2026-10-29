import type { FixtureSpec } from '../spec.js';
import { MARKER_COMMAND } from '../spec.js';
import { gitDir, lines, SOURCES } from './helpers.js';

const outsideGitDir = gitDir('gitdir', lines('[core]', `\tfsmonitor = ${MARKER_COMMAND}`));

export const specs: FixtureSpec[] = [
  {
    id: 'git-007-gitfile-outside',
    description: 'A .git file whose gitdir points outside the repo; that config is never read.',
    kind: 'malicious',
    source: SOURCES.gitConfigDocs,
    files: [{ type: 'file', path: '.git', content: 'gitdir: {{OUTSIDE}}/gitdir\n' }],
    outside: outsideGitDir,
    expect: [{ ruleId: 'GIT-007', severity: 'high', file: '.git', line: 1 }],
  },
  {
    id: 'git-007-symlink-outside',
    description: 'A .git symlink to a git dir outside the repo.',
    kind: 'malicious',
    source: SOURCES.gitConfigDocs,
    files: [{ type: 'symlink', path: '.git', target: '{{OUTSIDE}}/gitdir', targetType: 'dir' }],
    outside: outsideGitDir,
    expect: [{ ruleId: 'GIT-007', severity: 'high', file: '.git' }],
  },
  {
    id: 'git-007-worktree-outside',
    description: 'core.worktree points outside the repo, so git status and checkout act there.',
    kind: 'malicious',
    source: SOURCES.gitConfigDocs,
    files: gitDir('.git', lines('[core]', '\tbare = false', '\tworktree = {{OUTSIDE}}/home')),
    outside: [{ type: 'dir', path: 'home' }],
    expect: [{ ruleId: 'GIT-007', severity: 'high', file: '.git/config', line: 3 }],
  },
];
