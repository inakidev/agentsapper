import type { FixtureSpec } from '../spec.js';
import { MARKER_COMMAND } from '../spec.js';
import { gitDir, lines, SOURCES } from './helpers.js';

const M = MARKER_COMMAND;

export const specs: FixtureSpec[] = [
  {
    id: 'git-002-exec-keys',
    description: 'Config keys that make git run a program, at the severity of what triggers them.',
    kind: 'malicious',
    source: SOURCES.configPoisoning,
    files: gitDir(
      '.git',
      lines(
        '[core]',
        `\tpager = ${M}`,
        `\tsshCommand = ${M}`,
        '[diff]',
        `\texternal = ${M}`,
        '[credential]',
        '\thelper = store',
        `\thelper = "!${M}"`,
        '[alias]',
        `\tst = "!${M}"`,
        '[hook "lint"]',
        `\tcommand = ${M}`,
        '\tevent = pre-commit',
        '[protocol "ext"]',
        '\tallow = always',
        '[submodule "lib"]',
        `\tupdate = "!${M}"`,
        '[gpg]',
        `\tprogram = ${M}`,
        '[log]',
        '\tshowSignature = true',
        '[pager]',
        `\tlog = ${M}`,
        '\tdiff = false',
      ),
    ),
    expect: [
      { ruleId: 'GIT-002', severity: 'high', file: '.git/config', line: 2 },
      { ruleId: 'GIT-002', severity: 'high', file: '.git/config', line: 3 },
      { ruleId: 'GIT-002', severity: 'critical', file: '.git/config', line: 5 },
      { ruleId: 'GIT-002', severity: 'low', file: '.git/config', line: 7 },
      { ruleId: 'GIT-002', severity: 'high', file: '.git/config', line: 8 },
      { ruleId: 'GIT-002', severity: 'medium', file: '.git/config', line: 10 },
      { ruleId: 'GIT-002', severity: 'high', file: '.git/config', line: 12 },
      { ruleId: 'GIT-002', severity: 'high', file: '.git/config', line: 15 },
      { ruleId: 'GIT-002', severity: 'high', file: '.git/config', line: 17 },
      { ruleId: 'GIT-002', severity: 'critical', file: '.git/config', line: 19 },
      { ruleId: 'GIT-002', severity: 'high', file: '.git/config', line: 23 },
    ],
  },
];
