import type { Rule } from '../../types.js';
import { classifyLinks, FS_REFS, linkFinding } from './links.js';

export const FS_002: Rule = {
  id: 'FS-002',
  title: 'Symlink to a sensitive path',
  severity: 'critical',
  status: 'stable',
  references: [...FS_REFS],
  run(ctx) {
    return classifyLinks(ctx).flatMap((link) =>
      link.cls.kind === 'sensitive'
        ? [
            linkFinding(
              link,
              'FS-002',
              'critical',
              `Resolves to ${link.cls.dest}, which holds credentials or system config. An agent ` +
                'that reads or edits this path in the workspace reaches that location instead, ' +
                'and approval prompts show only the in-repo path (GhostApproval).',
            ),
          ]
        : [],
    );
  },
};
