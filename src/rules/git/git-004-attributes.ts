import type { Finding, Rule } from '../../types.js';
import { repoConfig } from './config.js';
import { attributeFiles, driverCommands, driverUses } from './drivers.js';
import { clip, REFS } from './references.js';
import { findRepos } from './repos.js';

// Driver commands that run while just looking at changes. GitLab's ConfigPoisoning
// research shows clean filters run during git diff even with --no-ext-diff and
// --no-textconv; textconv and diff commands run on a plain git diff.
const RUNS_ON_INSPECTION = new Set([
  'filter.clean',
  'filter.process',
  'diff.textconv',
  'diff.command',
]);

export const GIT_004: Rule = {
  id: 'GIT-004',
  title: 'gitattributes route files through a driver defined in git config',
  severity: 'high',
  status: 'stable',
  references: [REFS.configPoisoning, REFS.gitAttributes],
  run(ctx) {
    const { repos } = findRepos(ctx);
    const findings: Finding[] = [];

    for (const repo of repos) {
      const config = repoConfig(ctx, repo);
      const commands = driverCommands(config);
      if (commands.length === 0) continue;

      for (const use of driverUses(ctx, attributeFiles(ctx, repo, repos, config))) {
        const defs = commands.filter((c) => c.section === use.attr && c.subsection === use.driver);
        if (defs.length === 0) continue;

        const critical = defs.some((d) => RUNS_ON_INSPECTION.has(`${d.section}.${d.name}`));
        const where = defs.map(
          (d) => `${d.section}.${d.subsection ?? ''}.${d.name} (${d.file}:${d.line})`,
        );
        const via = use.macro === undefined ? '' : ` through the macro "${use.macro}"`;
        findings.push({
          ruleId: 'GIT-004',
          severity: critical ? 'critical' : 'high',
          file: use.file,
          line: use.line.line,
          evidence: clip(`${use.line.pattern} ${use.attr}=${use.driver}${via}`),
          message:
            `Files matching "${use.line.pattern}" use ${use.attr}=${use.driver}${via}, which runs ` +
            `${where.join(', ')}. ` +
            (critical
              ? 'Commands agents run to inspect changes, such as git diff, execute it, even with --no-ext-diff and --no-textconv.'
              : 'It runs when git merges, rebases or checks out these files.'),
          remediation:
            `Remove the driver definition from git config, or the ${use.attr}= attribute from ${use.file}, ` +
            'before running git or an agent here.',
        });
      }
    }
    return findings;
  },
};
