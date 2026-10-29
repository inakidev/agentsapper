import type { Severity } from './severity.js';
import type { Entry } from './walker.js';

export type RuleStatus = 'stable' | 'experimental';

/** Everything a rule may look at. Rules must not touch the filesystem on their own. */
export interface ScanContext {
  /** Absolute path of the repository being scanned. */
  readonly root: string;
  /** Every entry the walker saw, sorted by path. Symlinks are listed, never followed. */
  readonly entries: readonly Entry[];
  /** Reasons the scan may have missed something. Non-empty means incomplete. */
  readonly incomplete: readonly string[];
  /**
   * The entry at `path`. Without an exact match, the entry a case-insensitive
   * filesystem would open for it (names.ts); its `path` is the real spelling.
   */
  entry(path: string): Entry | undefined;
  /** Direct children of a directory (`''` is the root), sorted by path. Matched like `entry`. */
  children(path: string): readonly Entry[];
  /**
   * Contents of a regular file as UTF-8, or undefined for anything else
   * (missing, directory, symlink, too large). Never reads through a symlink.
   * Matched like `entry`.
   */
  readText(path: string): string | undefined;
  /** Like `readText` for binary files, with their own size cap. */
  readBytes(path: string, maxBytes: number): Uint8Array | undefined;
  /** Caches a computation shared by several rules for the lifetime of one scan. */
  memo<T>(key: string, compute: () => T): T;
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
