import type { Rule } from '../../types.js';
import { evidenceOf, repoConfig } from './config.js';
import { driverCommands } from './drivers.js';
import { clip, REFS } from './references.js';
import { findRepos } from './repos.js';

const WHEN: Readonly<Record<string, string>> = {
  'filter.clean': 'when files with this filter are staged or diffed (git add, git diff)',
  'filter.smudge': 'when files with this filter are checked out (checkout, switch, merge)',
  'filter.process': 'as a long-running filter on checkout, add and diff for files with this filter',
  'diff.textconv': 'on git diff, git log -p and git show for files with this diff driver',
  'diff.command': 'on git diff for files with this diff driver',
  'merge.driver': 'on merge, rebase and cherry-pick for files with this merge driver',
};

export const GIT_003: Rule = {
  id: 'GIT-003',
  title: 'Git config defines a filter, diff or merge driver command',
  severity: 'high',
  status: 'stable',
  references: [REFS.configPoisoning, REFS.gitAttributes, REFS.gitConfig],
  run(ctx) {
    return findRepos(ctx).repos.flatMap((repo) =>
      driverCommands(repoConfig(ctx, repo)).map((e) => ({
        ruleId: 'GIT-003',
        severity: 'high' as const,
        file: e.file,
        line: e.line,
        evidence: clip(evidenceOf(e)),
        message:
          `git runs this command ${WHEN[`${e.section}.${e.name}`] ?? 'for files that use this driver'}. ` +
          'Which files use it is set in gitattributes (see GIT-004).',
        remediation: `Remove the ${e.section}.${e.subsection ?? ''} driver from ${e.file} unless you set it up yourself.`,
      })),
    );
  },
};
