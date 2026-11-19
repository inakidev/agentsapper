import type { Finding, Rule } from '../../types.js';
import { clip } from '../util.js';
import { numberedLines, sourceFiles } from './files.js';

// Backend loaders in fake job-interview repositories fetch code on npm start and run
// it with a Function built around require, so the payload gets Node's full API
// (NVISO 2025, Microsoft 2026). eval of something fetched is the weaker variant.

/** The Function constructor, called directly or through Function.constructor, with require as its first parameter. */
const REQUIRE_FUNCTION = /\bFunction(\.constructor)?\s*\)?\s*\(\s*['"`]require['"`]/;
const DYNAMIC = /\beval\s*\(|\bnew\s+Function\s*\(/;
const NETWORK =
  /\baxios\b|\bfetch\s*\(|\bhttps?\.(get|request)\s*\(|require\(\s*['"](node-fetch|got|request|undici)['"]\s*\)/;

export const CODE_002: Rule = {
  id: 'CODE-002',
  title: 'Source file runs code it builds or fetches at run time',
  severity: 'high',
  status: 'experimental',
  references: [
    'https://blog.nviso.eu/2025/11/13/contagious-interview-actors-now-utilize-json-storage-services-for-malware-delivery/',
    'https://www.microsoft.com/en-us/security/blog/2026/02/24/c2-developer-targeting-campaign/',
  ],
  run(ctx) {
    return sourceFiles(ctx).flatMap((entry): Finding[] => {
      const text = ctx.readText(entry.path);
      // Whole-text checks first: most files match nothing and need no line split.
      if (text === undefined) return [];
      if (!REQUIRE_FUNCTION.test(text) && !(DYNAMIC.test(text) && NETWORK.test(text))) return [];
      const rows = numberedLines(text);
      const strong = rows.find(([, row]) => REQUIRE_FUNCTION.test(row));
      const weak =
        strong ?? (NETWORK.test(text) ? rows.find(([, row]) => DYNAMIC.test(row)) : undefined);
      if (weak === undefined) return [];
      const [line, row] = weak;
      return [
        {
          ruleId: 'CODE-002',
          severity: strong === undefined ? 'medium' : 'high',
          file: entry.path,
          line,
          evidence: clip(row.trim(), 200),
          message:
            strong === undefined
              ? 'This file makes network requests and evaluates code it builds at run time; loaders fetch their payload and run it this way.'
              : 'This builds a function with access to require from a string, which gives code fetched or decoded at run time all of Node: a pattern of loaders in fake job-interview repositories.',
          remediation: `Read ${entry.path} and find out where the evaluated code comes from before running the project.`,
        },
      ];
    });
  },
};
