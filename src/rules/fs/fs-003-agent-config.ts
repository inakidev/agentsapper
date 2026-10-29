import type { Rule } from '../../types.js';
import { classifyLinks, FS_REFS, linkFinding } from './links.js';

// Medium, not high: links that leave the repo are reported more severely by FS-001
// or FS-002, so what remains here points inside the repository. The benign-corpus
// evaluation showed projects sharing skills and commands between agent config dirs
// this way (cline/cline: 9 links), so this is a review signal, not an alarm.
export const FS_003: Rule = {
  id: 'FS-003',
  title: 'Symlink in an agent or IDE config location',
  severity: 'medium',
  status: 'stable',
  references: [...FS_REFS],
  run(ctx) {
    return classifyLinks(ctx).flatMap((link) =>
      link.inAgentConfig && (link.cls.kind === 'inside' || link.cls.kind === 'loop')
        ? [
            linkFinding(
              link,
              'FS-003',
              'medium',
              `Agents and IDEs load config, rules or instructions from here, but the content lives at ${
                link.cls.kind === 'inside'
                  ? link.cls.dest || 'the repository root'
                  : 'a symlink loop'
              }. Review the target: it is what the agent will actually read, and edits go through to it.`,
            ),
          ]
        : [],
    );
  },
};
