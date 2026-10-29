import { configKey } from '../../parsers/gitconfig.js';
import { describePlace, locate } from '../../paths.js';
import type { Finding, Rule } from '../../types.js';
import { evidenceOf, liveEntries, repoConfig } from './config.js';
import { clip, REFS } from './references.js';
import { findRepos } from './repos.js';

export const GIT_007: Rule = {
  id: 'GIT-007',
  title: 'Git directory or working tree points outside the repository',
  severity: 'high',
  status: 'stable',
  references: [REFS.gitRepositoryLayout, REFS.gitConfig],
  run(ctx) {
    const { repos, escapes } = findRepos(ctx);
    const findings: Finding[] = escapes.map((escape) => ({
      ruleId: 'GIT-007',
      severity: 'high',
      file: escape.file,
      ...(escape.line === undefined ? {} : { line: escape.line }),
      evidence: clip(escape.evidence),
      message:
        `git takes its config, hooks and refs from ${describePlace(escape.where)}. ` +
        'Whatever is there runs when git is used here, and this scan could not inspect it.',
      remediation: `Delete ${escape.file} or check what it points to before running git or an agent here.`,
    }));

    for (const repo of repos) {
      for (const entry of liveEntries(repoConfig(ctx, repo))) {
        if (configKey(entry) !== 'core.worktree' || !entry.value) continue;
        // Relative values are taken from the git directory itself.
        const where = locate(ctx, repo.gitDir, entry.value);
        if (where.kind === 'inside') continue;
        findings.push({
          ruleId: 'GIT-007',
          severity: 'high',
          file: entry.file,
          line: entry.line,
          evidence: clip(evidenceOf(entry)),
          message:
            `git treats ${describePlace(where)} as the working tree, so git status, checkout ` +
            'and clean read and modify files there, and filters run on them.',
          remediation: `Remove core.worktree from ${entry.file} before running git here.`,
        });
      }
    }
    return findings;
  },
};
