import type { Severity } from '../../src/severity.js';
import type { Finding, Rule } from '../../src/types.js';

/** Builds an in-memory rule that returns the given findings, for orchestration tests. */
export function fakeRule(
  id: string,
  findings: Omit<Finding, 'ruleId'>[] = [],
  severity: Severity = 'high',
): Rule {
  return {
    id,
    title: `Fake rule ${id}`,
    severity,
    status: 'experimental',
    references: [],
    run: () => findings.map((f) => ({ ...f, ruleId: id })),
  };
}

export function finding(overrides: Partial<Omit<Finding, 'ruleId'>> = {}): Omit<Finding, 'ruleId'> {
  return {
    severity: 'high',
    file: 'some/file',
    evidence: 'evidence',
    message: 'why it is dangerous',
    remediation: 'what to do',
    ...overrides,
  };
}
