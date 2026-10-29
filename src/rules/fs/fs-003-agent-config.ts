import type { Rule } from '../../types.js';
import { classifyLinks, FS_REFS, linkFinding } from './links.js';

export const FS_003: Rule = {
  id: 'FS-003',
  title: 'Symlink in an agent or IDE config location',
  severity: 'high',
  status: 'stable',
  references: [...FS_REFS],
  run(ctx) {
    return classifyLinks(ctx).flatMap((link) =>
      // Links that leave the repo are already reported, more severely, by FS-001 or FS-002.
      link.inAgentConfig && (link.cls.kind === 'inside' || link.cls.kind === 'loop')
        ? [
            {
              ...linkFinding(
                link,
                'FS-003',
                'high',
                'Agents and IDEs load config, rules or instructions from here. A symlink hides ' +
                  'what they will actually read, and some agents write through it when asked to ' +
                  'edit these files.',
              ),
            },
          ]
        : [],
    );
  },
};
