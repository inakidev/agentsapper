import type { Severity } from '../src/severity.js';

/**
 * Program name used wherever a fixture needs git to "run" something. It does not
 * exist, so even if git did execute a fixture, it would only fail. The phase-6
 * exploitability harness (Docker only) provides it as a script that writes a
 * marker file inside its own temp dir.
 */
export const MARKER_COMMAND = './.agentsapper-marker';

/**
 * Paths are POSIX-style and relative to the materialized repo root (or to the
 * sibling "outside" dir for `outside` entries). Contents and symlink targets may
 * use the placeholders {{ROOT}} and {{OUTSIDE}}, replaced with absolute paths.
 */
export type FixtureEntry =
  | {
      readonly type: 'file';
      readonly path: string;
      readonly content: string;
      readonly mode?: number;
    }
  | { readonly type: 'dir'; readonly path: string }
  | {
      readonly type: 'symlink';
      readonly path: string;
      readonly target: string;
      readonly targetType: 'file' | 'dir';
    };

export interface ExpectedFinding {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly file: string;
  readonly line?: number;
}

export interface FixtureSpec {
  /** Matches the spec file name, e.g. `git-001-fsmonitor`. */
  readonly id: string;
  readonly description: string;
  readonly kind: 'malicious' | 'benign';
  /** Link to the research the fixture reproduces. Required for malicious fixtures. */
  readonly source?: string;
  readonly files: readonly FixtureEntry[];
  /** Entries placed next to the repo, for things that must live outside it. */
  readonly outside?: readonly FixtureEntry[];
  /** The exact set of findings a full scan must produce. */
  readonly expect: readonly ExpectedFinding[];
  /** Platforms whose filesystem semantics the fixture depends on; skipped elsewhere. */
  readonly onlyOn?: readonly NodeJS.Platform[];
}
