import type { FixtureSpec } from '../spec.js';
import { MARKER_COMMAND } from '../spec.js';
import { gitDir, lines, SOURCES } from './helpers.js';

const script = `#!/bin/sh\n${MARKER_COMMAND}\n`;

export const specs: FixtureSpec[] = [
  {
    id: 'git-006-hooks',
    description:
      'Live hooks in .git/hooks and in a core.hooksPath directory inside the repo. Samples and ' +
      'files that are not hook names are ignored; a hook without exec bit or shebang is medium.',
    kind: 'malicious',
    source: SOURCES.githooksDocs,
    files: [
      ...gitDir('.git', lines('[core]', '\thooksPath = .githooks')),
      { type: 'file', path: '.git/hooks/pre-commit', content: script, mode: 0o755 },
      { type: 'file', path: '.git/hooks/commit-msg', content: `${MARKER_COMMAND}\n`, mode: 0o644 },
      { type: 'file', path: '.git/hooks/post-checkout.sample', content: script, mode: 0o755 },
      { type: 'file', path: '.git/hooks/not-a-hook', content: script, mode: 0o755 },
      { type: 'file', path: '.githooks/pre-push', content: script, mode: 0o755 },
    ],
    expect: [
      { ruleId: 'GIT-002', severity: 'high', file: '.git/config', line: 2 },
      { ruleId: 'GIT-006', severity: 'high', file: '.git/hooks/pre-commit' },
      { ruleId: 'GIT-006', severity: 'medium', file: '.git/hooks/commit-msg' },
      { ruleId: 'GIT-006', severity: 'high', file: '.githooks/pre-push' },
    ],
  },
];
