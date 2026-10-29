import type { ScanResult } from '../scan.js';
import { SEVERITIES } from '../severity.js';

/** Bump when the shape changes in a way that breaks consumers. */
export const JSON_SCHEMA_VERSION = 1;

export function formatJson(result: ScanResult, version: string): string {
  const summary = Object.fromEntries(
    [...SEVERITIES]
      .reverse()
      .map((s) => [s, result.findings.filter((f) => f.severity === s).length]),
  );
  return `${JSON.stringify(
    {
      schemaVersion: JSON_SCHEMA_VERSION,
      tool: { name: 'agentsapper', version },
      root: result.root,
      complete: result.incomplete.length === 0 && result.errors.length === 0,
      summary: { ...summary, total: result.findings.length },
      findings: result.findings,
      incomplete: result.incomplete,
      errors: result.errors,
      rules: result.rules,
    },
    null,
    2,
  )}\n`;
}
