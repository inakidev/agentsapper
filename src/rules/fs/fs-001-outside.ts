import type { Rule } from '../../types.js';
import { classifyLinks, FS_REFS, linkFinding } from './links.js';

export const FS_001: Rule = {
  id: 'FS-001',
  title: 'Symlink points outside the repository',
  severity: 'high',
  status: 'stable',
  references: [...FS_REFS],
  run(ctx) {
    return classifyLinks(ctx).flatMap((link) =>
      link.cls.kind === 'outside'
        ? [
            linkFinding(
              link,
              'FS-001',
              'high',
              `Resolves to ${link.cls.dest}, outside the repository. Reads and writes through it ` +
                'escape the workspace while looking local (GhostApproval).',
            ),
          ]
        : [],
    );
  },
};
