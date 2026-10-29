import { describePlace } from '../../paths.js';
import type { Severity } from '../../severity.js';
import type { Rule } from '../../types.js';
import { repoConfig } from './config.js';
import { clip, REFS } from './references.js';
import { findRepos } from './repos.js';

export const GIT_005: Rule = {
  id: 'GIT-005',
  title: 'Git config includes another config file',
  severity: 'high',
  status: 'stable',
  references: [REFS.gitConfig],
  run(ctx) {
    return findRepos(ctx).repos.flatMap((repo) =>
      repoConfig(ctx, repo).includes.map((inc) => {
        let severity: Severity;
        let message: string;
        if (inc.where.kind === 'inside' && inc.exists) {
          severity = 'high';
          message =
            `Config is pulled in from ${inc.where.path}, a file anyone can commit to the repo. ` +
            'It was analyzed as part of this config; findings in it are reported against that file.';
        } else if (inc.where.kind === 'inside') {
          severity = 'low';
          message =
            `The included file ${inc.where.path} does not exist, so git skips it, but creating it ` +
            'later (for example by checking out a branch) would inject config.';
        } else if (inc.where.kind === 'via-symlink') {
          severity = 'high';
          message = `The include goes through ${describePlace(inc.where)}; its contents were not analyzed.`;
        } else {
          severity = 'medium';
          message = `The include points to ${describePlace(inc.where)}; its contents were not analyzed.`;
        }
        return {
          ruleId: 'GIT-005',
          severity,
          file: inc.file,
          line: inc.line,
          evidence: clip(`${inc.key} = ${inc.value}`),
          message,
          remediation: `Remove the include from ${inc.file} unless you added it yourself.`,
        };
      }),
    );
  },
};
