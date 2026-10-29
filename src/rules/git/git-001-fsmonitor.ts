import { configKey, parseGitBool } from '../../parsers/gitconfig.js';
import type { Rule } from '../../types.js';
import { evidenceOf, liveEntries, repoConfig } from './config.js';
import { clip } from '../util.js';
import { REFS } from './references.js';
import { findRepos } from './repos.js';

export const GIT_001: Rule = {
  id: 'GIT-001',
  title: 'core.fsmonitor runs a command',
  severity: 'critical',
  status: 'stable',
  references: [REFS.gitSpawn, REFS.buriedBareRepos, REFS.gitConfig],
  run(ctx) {
    return findRepos(ctx).repos.flatMap((repo) =>
      liveEntries(repoConfig(ctx, repo))
        // A boolean selects git's built-in daemon (or turns it off); anything else is a command.
        .filter((e) => configKey(e) === 'core.fsmonitor' && parseGitBool(e.value) === undefined)
        .map((e) => ({
          ruleId: 'GIT-001',
          severity: 'critical' as const,
          file: e.file,
          line: e.line,
          evidence: clip(evidenceOf(e)),
          message:
            'git runs this command every time it refreshes the index, which git status and git ' +
            'diff do. Coding agents run those as soon as they open a repository, often before ' +
            'any approval prompt (GitSpawn).',
          remediation:
            `Do not run git or an agent here until you remove core.fsmonitor from ${e.file} ` +
            '(or set it to false).' +
            (/(^|\/)\.git\//.test(e.file)
              ? ' A clone never carries this file; it came with an archive, a synced folder or a copied directory.'
              : ' This file is part of the repository content, so a plain clone delivers it.'),
        })),
    );
  },
};
