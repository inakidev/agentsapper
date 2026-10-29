import { ALL_RULES } from './rules/index.js';
import { severityRank } from './severity.js';
import type { Finding, Rule, RuleInfo, ScanContext } from './types.js';

export interface ScanOptions {
  readonly rules?: readonly Rule[];
}

export interface RuleError {
  readonly ruleId: string;
  readonly message: string;
}

export interface ScanResult {
  readonly root: string;
  readonly rules: readonly RuleInfo[];
  /** Sorted most severe first, then by file, line and rule id. */
  readonly findings: readonly Finding[];
  /** Rules that threw. A hostile repo may target a parser, so this is never silent. */
  readonly errors: readonly RuleError[];
}

export function scan(root: string, options: ScanOptions = {}): ScanResult {
  const rules = options.rules ?? ALL_RULES;
  const ctx: ScanContext = { root };
  const findings: Finding[] = [];
  const errors: RuleError[] = [];

  for (const rule of rules) {
    try {
      findings.push(...rule.run(ctx));
    } catch (error) {
      errors.push({
        ruleId: rule.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    root,
    rules: rules.map(({ id, title, severity, status, references }) => ({
      id,
      title,
      severity,
      status,
      references,
    })),
    findings: findings.sort(compareFindings),
    errors,
  };
}

// Plain code-unit comparison instead of localeCompare: output must not depend on the locale.
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareFindings(a: Finding, b: Finding): number {
  return (
    severityRank(b.severity) - severityRank(a.severity) ||
    compareStrings(a.file, b.file) ||
    (a.line ?? 0) - (b.line ?? 0) ||
    compareStrings(a.ruleId, b.ruleId)
  );
}
