import { foldName } from '../../names.js';
import { baseName } from '../../paths.js';
import type { Rule } from '../../types.js';
import { clip } from '../util.js';
import { firstPartyFiles, numberedLines } from './files.js';

// Fake job-interview repositories append their loader to a build or lint config,
// which npm run dev, build or lint load as code: after the real export, pushed
// off-screen by hundreds of blanks, decoding a payload or reading the next stage
// from a blockchain node (OpenSourceMalware, Trend Micro and Socket, 2026).

const CONFIG =
  /^(postcss|tailwind|eslint|next|nuxt|vite|vitest|jest|babel|webpack|rollup|svelte|astro|remix|prettier|craco|metro|playwright)\.config\.(c|m)?[jt]s$|^\.eslintrc\.c?js$|^tailwind\.js$|^gatsby-(config|node)\.(c|m)?[jt]s$/;

const SIGNALS: readonly { what: string; test: (row: string) => boolean }[] = [
  { what: 'hides code past a long run of blanks', test: (row) => /[ \t]{150,}\S/.test(row) },
  { what: 'has a line over 1000 characters', test: (row) => row.length > 1000 },
  {
    what: 'decodes or builds code at load time (eval, Function, atob, base64 or char codes)',
    test: (row) =>
      /\beval\s*\(|\bFunction(\.constructor)?\s*\)?\s*\(|\batob\s*\(|Buffer\.from\([^)]*['"]base64['"]|String\.fromCharCode\s*\(/.test(
        row,
      ),
  },
  {
    what: 'reads from a blockchain node, where loaders keep their next stage',
    test: (row) => /trongrid|aptoslabs|bsc-dataseed|eth_getTransactionByHash/i.test(row),
  },
];

export const CODE_001: Rule = {
  id: 'CODE-001',
  title: 'Build or lint config hides code that runs when the project starts',
  severity: 'high',
  status: 'experimental',
  references: [
    'https://opensourcemalware.com/blog/polinrider-dprk-compromised-hundreds-of-github-repos',
    'https://www.trendmicro.com/en_gb/research/26/d/void-dokkaebi-uses-fake-job-interview-lure-to-spread-malware-via-code-repositories.html',
  ],
  run(ctx) {
    return firstPartyFiles(ctx).flatMap((entry) => {
      if (!CONFIG.test(foldName(baseName(entry.path)))) return [];
      const rows = numberedLines(ctx.readText(entry.path) ?? '');
      const hits = SIGNALS.flatMap((signal) => {
        const hit = rows.find(([, row]) => signal.test(row));
        return hit === undefined ? [] : [{ what: signal.what, line: hit[0], row: hit[1] }];
      });
      const first = hits.reduce<(typeof hits)[number] | undefined>(
        (a, b) => (a === undefined || b.line < a.line ? b : a),
        undefined,
      );
      if (first === undefined) return [];
      return [
        {
          ruleId: 'CODE-001',
          severity: hits.length > 1 ? 'critical' : 'high',
          file: entry.path,
          line: first.line,
          evidence: clip(first.row.trim(), 200),
          message: `This config runs as code on npm run dev, build or lint, and it ${hits.map((h) => h.what).join('; ')}.`,
          remediation: `Read ${entry.path} with line wrapping on before running any npm script here.`,
        },
      ];
    });
  },
};
