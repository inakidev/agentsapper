import type { Finding, Rule } from '../../types.js';
import { REFS } from './references.js';
import { findRepos } from './repos.js';

export const GIT_008: Rule = {
  id: 'GIT-008',
  title: 'Embedded git repository',
  severity: 'high',
  status: 'stable',
  references: [REFS.buriedBareRepos, REFS.gitConfig],
  run(ctx) {
    return findRepos(ctx).repos.flatMap((repo): Finding[] => {
      if (repo.kind === 'nested') {
        return [
          {
            ruleId: 'GIT-008',
            severity: 'high',
            file: repo.marker,
            evidence: `${repo.marker} (git directory at ${repo.gitDir})`,
            message:
              `${repo.workTree ?? ''} is a separate git repository. Any git command run inside it, ` +
              "by you, an agent or an IDE, uses its config and hooks instead of the outer repo's.",
            remediation: `Inspect or delete ${repo.marker} before working inside that directory.`,
          },
        ];
      }
      if (repo.kind === 'bare') {
        return [
          {
            ruleId: 'GIT-008',
            severity: 'high',
            file: repo.marker,
            evidence: `${repo.marker}/ has HEAD, objects/ and refs/`,
            message:
              'This directory is a bare git repository stored as ordinary files, so it survives a ' +
              'plain clone. git commands run inside it use its config, including execution sinks.',
            remediation:
              `Delete ${repo.marker} unless the project needs it, and set safe.bareRepository=explicit ` +
              'in your global git config.',
          },
        ];
      }
      return [];
    });
  },
};
