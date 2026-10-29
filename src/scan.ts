import { createContext } from './context.js';
import { ALL_RULES } from './rules/index.js';
import { severityRank } from './severity.js';
import type { Finding, Rule, RuleInfo } from './types.js';
import { compareStrings, DEFAULT_LIMITS, walk, type Limits } from './walker.js';

export interface ScanOptions {
  readonly rules?: readonly Rule[];
  readonly limits?: Limits;
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
  /** Limits hit or files that could not be read. A hostile repo may pad itself to hide. */
  readonly incomplete: readonly string[];
}

export function scan(root: string, options: ScanOptions = {}): ScanResult {
  const rules = options.rules ?? ALL_RULES;
  const limits = options.limits ?? DEFAULT_LIMITS;
  const ctx = createContext(root, walk(root, limits), limits);
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
    incomplete: [...ctx.incomplete],
  };
}

// Plain code-unit comparison instead of localeCompare: output must not depend on the locale.
export function compareFindings(a: Finding, b: Finding): number {
  return (
    severityRank(b.severity) - severityRank(a.severity) ||
    compareStrings(a.file, b.file) ||
    (a.line ?? 0) - (b.line ?? 0) ||
    compareStrings(a.ruleId, b.ruleId)
  );
}
