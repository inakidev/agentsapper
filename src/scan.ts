import { createContext } from './context.js';
import { ALL_RULES } from './rules/index.js';
import { realPath } from './rules/linked.js';
import { severityRank } from './severity.js';
import type { Finding, Rule, RuleInfo, ScanContext } from './types.js';
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
      findings.push(...rule.run(ctx).map((f) => explainLink(ctx, f)));
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
    // Two repos can share a file (an include, a hook dir); report each finding once.
    findings: [
      ...new Map(
        findings.map((f) => [
          JSON.stringify([f.ruleId, f.severity, f.file, f.line, f.evidence]),
          f,
        ]),
      ).values(),
    ].sort(compareFindings),
    errors,
    incomplete: [...ctx.incomplete],
  };
}

/** Findings about content reached through a symlink say where that content really lives. */
function explainLink(ctx: ScanContext, finding: Finding): Finding {
  const real = realPath(ctx, finding.file);
  if (real === undefined || real === finding.file) return finding;
  return {
    ...finding,
    message: `${finding.message} (${finding.file} leads through a symlink to ${real}; line numbers refer to that file.)`,
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
