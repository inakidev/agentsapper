/** Severity levels, ordered from least to most severe. */
export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;

export type Severity = (typeof SEVERITIES)[number];

export function isSeverity(value: string): value is Severity {
  return (SEVERITIES as readonly string[]).includes(value);
}

export function severityRank(severity: Severity): number {
  return SEVERITIES.indexOf(severity);
}

/** True when `severity` is equal to or more severe than `threshold`. */
export function meetsThreshold(severity: Severity, threshold: Severity): boolean {
  return severityRank(severity) >= severityRank(threshold);
}
