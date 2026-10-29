import type { FixtureSpec } from '../spec.js';
import { MARKER_COMMAND } from '../spec.js';
import { gitDir, lines, SOURCES } from './helpers.js';

const M = MARKER_COMMAND;

export const specs: FixtureSpec[] = [
  {
    id: 'git-003-004-filter-clean',
    description:
      'ConfigPoisoning: .gitattributes routes a file through a clean filter defined in ' +
      '.git/config; git diff runs it even with --no-ext-diff --no-textconv.',
    kind: 'malicious',
    source: SOURCES.configPoisoning,
    files: [
      ...gitDir('.git', lines('[core]', '\tbare = false', '[filter "pwn"]', `\tclean = ${M}`)),
      { type: 'file', path: '.gitattributes', content: 'secret.bin filter=pwn\n' },
      { type: 'file', path: 'secret.bin', content: 'data\n' },
    ],
    expect: [
      { ruleId: 'GIT-003', severity: 'high', file: '.git/config', line: 4 },
      { ruleId: 'GIT-004', severity: 'critical', file: '.gitattributes', line: 1 },
    ],
  },
  {
    id: 'git-004-macro-and-nested',
    description:
      'A macro defined in .git/info/attributes and used from a nested .gitattributes still ' +
      'reaches the textconv driver; a macro defined in a nested file is ignored, as git does.',
    kind: 'malicious',
    source: SOURCES.configPoisoning,
    files: [
      ...gitDir(
        '.git',
        lines('[diff "evil"]', `\ttextconv = ${M}`, '[filter "pwn2"]', `\tclean = ${M}`),
      ),
      { type: 'file', path: '.git/info/attributes', content: '[attr]innocent diff=evil\n' },
      { type: 'file', path: 'docs/.gitattributes', content: '*.md innocent\n' },
      { type: 'file', path: 'docs/guide.md', content: '# Guide\n' },
      { type: 'file', path: 'src/main.c', content: 'int main(void) { return 0; }\n' },
      {
        type: 'file',
        path: 'src/.gitattributes',
        content: lines('[attr]sneaky filter=pwn2', '*.c sneaky'),
      },
    ],
    expect: [
      { ruleId: 'GIT-003', severity: 'high', file: '.git/config', line: 2 },
      { ruleId: 'GIT-003', severity: 'high', file: '.git/config', line: 4 },
      { ruleId: 'GIT-004', severity: 'critical', file: 'docs/.gitattributes', line: 1 },
    ],
  },
  {
    id: 'git-004-merge-driver',
    description: 'A merge driver only runs on merge, rebase or cherry-pick, so it stays high.',
    kind: 'malicious',
    source: SOURCES.configPoisoning,
    files: [
      ...gitDir('.git', lines('[merge "m"]', `\tdriver = ${M} %O %A %B`)),
      { type: 'file', path: '.gitattributes', content: '*.lock merge=m\n' },
    ],
    expect: [
      { ruleId: 'GIT-003', severity: 'high', file: '.git/config', line: 2 },
      { ruleId: 'GIT-004', severity: 'high', file: '.gitattributes', line: 1 },
    ],
  },
];
