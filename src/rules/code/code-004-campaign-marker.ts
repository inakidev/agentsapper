import { foldName } from '../../names.js';
import { baseName } from '../../paths.js';
import type { Finding, Rule } from '../../types.js';
import { clip } from '../util.js';
import { firstPartyFiles, numberedLines, sourceFiles } from './files.js';

// Literal markers of loaders found in hundreds of repositories (Trend Micro and
// OpenSourceMalware, 2026). Cheap to check and brittle, so the other CODE rules carry
// the general case. Markers are written in parts so this file does not match itself.

const MARKERS = new RegExp(
  [
    String.raw`global\[['"]!['"]\]\s*=`,
    String.raw`global\[['"]_V['"]\]\s*=`,
    ['_\\$_', '1e42'].join(''),
    ['rmcej', '%otb%'].join(''),
  ].join('|'),
);
/** Rewrites commit history to hide the injected loader. */
const HISTORY_REWRITER = 'temp_auto_push.bat';

const REFS = [
  'https://www.trendmicro.com/en_gb/research/26/d/void-dokkaebi-uses-fake-job-interview-lure-to-spread-malware-via-code-repositories.html',
  'https://opensourcemalware.com/blog/polinrider-dprk-compromised-hundreds-of-github-repos',
];

export const CODE_004: Rule = {
  id: 'CODE-004',
  title: 'Marker of a known repository malware campaign',
  severity: 'critical',
  status: 'stable',
  references: REFS,
  run(ctx) {
    const remediation =
      'Do not run anything from this repository; treat the machine as exposed if you already did.';
    const markers = sourceFiles(ctx).flatMap((entry): Finding[] => {
      const text = ctx.readText(entry.path) ?? '';
      if (!MARKERS.test(text)) return [];
      const hit = numberedLines(text).find(([, row]) => MARKERS.test(row));
      if (hit === undefined) return [];
      return [
        {
          ruleId: 'CODE-004',
          severity: 'critical',
          file: entry.path,
          line: hit[0],
          evidence: clip(hit[1].trim(), 200),
          message:
            'This matches the loader of a malware campaign that spreads through fake job-interview and compromised repositories.',
          remediation,
        },
      ];
    });
    const rewriters = firstPartyFiles(ctx)
      .filter((e) => foldName(baseName(e.path)) === HISTORY_REWRITER)
      .map((entry): Finding => ({
        ruleId: 'CODE-004',
        severity: 'critical',
        file: entry.path,
        evidence: entry.path,
        message:
          'This batch file name belongs to a malware campaign that injects loaders into repositories and rewrites their commit history to hide it.',
        remediation,
      }));
    return [...markers, ...rewriters];
  },
};
