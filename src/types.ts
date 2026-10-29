import type { Severity } from './severity.js';

export type RuleStatus = 'stable' | 'experimental';

/** Everything a rule may look at. Rules must not touch the filesystem on their own. */
export interface ScanContext {
  /** Absolute path of the repository being scanned. */
  readonly root: string;
}

export interface Finding {
  readonly ruleId: string;
  /** Usually the rule's base severity; some rules raise or lower it per finding. */
  readonly severity: Severity;
  /** Path relative to the scan root, with forward slashes. */
  readonly file: string;
  /** 1-based line number, when the finding maps to a line. */
  readonly line?: number;
  /** Short excerpt of what triggered the finding. */
  readonly evidence: string;
  /** Why this is dangerous. */
  readonly message: string;
  /** What the user should do about it. */
  readonly remediation: string;
}

export interface Rule {
  /** Family prefix plus number, e.g. `GIT-001`. */
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly status: RuleStatus;
  /** Links to the original research or official docs. */
  readonly references: readonly string[];
  /** Pure function: same context in, same findings out. */
  run(ctx: ScanContext): Finding[];
}

export type RuleInfo = Omit<Rule, 'run'>;
