import type { FixtureSpec } from '../spec.js';
import { MARKER_COMMAND } from '../spec.js';
import { gitDir, lines } from './helpers.js';

export const specs: FixtureSpec[] = [
  {
    id: 'benign-standard-repo',
    description: 'A typical clone: standard local config, sample hooks, text attributes.',
    kind: 'benign',
    files: [
      ...gitDir(
        '.git',
        lines(
          '[core]',
          '\trepositoryformatversion = 0',
          '\tfilemode = true',
          '\tbare = false',
          '\tlogallrefupdates = true',
          '\tfsmonitor = true',
          '[remote "origin"]',
          '\turl = https://github.com/example/project.git',
          '\tfetch = +refs/heads/*:refs/remotes/origin/*',
          '[branch "main"]',
          '\tremote = origin',
          '\tmerge = refs/heads/main',
        ),
      ),
      { type: 'file', path: '.git/hooks/pre-commit.sample', content: '#!/bin/sh\n', mode: 0o755 },
      { type: 'file', path: '.git/info/exclude', content: '# local excludes\n' },
      {
        type: 'file',
        path: '.gitattributes',
        content: lines('* text=auto eol=lf', '*.png binary', '*.c diff=cpp'),
      },
      { type: 'file', path: 'README.md', content: '# Project\n' },
    ],
    expect: [],
  },
  {
    id: 'benign-git-lfs',
    description: 'git-lfs writes its filter to the local config; the canonical commands are fine.',
    kind: 'benign',
    files: [
      ...gitDir(
        '.git',
        lines(
          '[core]',
          '\tbare = false',
          '[filter "lfs"]',
          '\tclean = git-lfs clean -- %f',
          '\tsmudge = git-lfs smudge -- %f',
          '\tprocess = git-lfs filter-process',
          '\trequired = true',
        ),
      ),
      {
        type: 'file',
        path: '.gitattributes',
        content: '*.psd filter=lfs diff=lfs merge=lfs -text\n',
      },
    ],
    expect: [],
  },
  {
    id: 'benign-submodule-checkout',
    description:
      'A checked-out submodule: a .git file pointing into .git/modules, worktree inside.',
    kind: 'benign',
    files: [
      ...gitDir(
        '.git',
        lines(
          '[core]',
          '\tbare = false',
          '[submodule "lib"]',
          '\turl = https://github.com/example/lib.git',
          '\tactive = true',
        ),
      ),
      ...gitDir('.git/modules/lib', lines('[core]', '\tbare = false', '\tworktree = ../../../lib')),
      { type: 'file', path: 'lib/.git', content: 'gitdir: ../.git/modules/lib\n' },
      { type: 'file', path: '.gitmodules', content: '[submodule "lib"]\n\tpath = lib\n' },
    ],
    expect: [],
  },
  {
    id: 'benign-fsmonitor-overridden',
    description: 'A command in core.fsmonitor that a later line resets to false never runs.',
    kind: 'benign',
    files: [
      ...gitDir(
        '.git',
        lines('[core]', `\tfsmonitor = ${MARKER_COMMAND}`, '[core]', '\tfsmonitor = false'),
      ),
    ],
    expect: [],
  },
];
