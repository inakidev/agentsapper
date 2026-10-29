import { lstatSync, opendirSync, readlinkSync, type Stats } from 'node:fs';
import { join } from 'node:path';

export type EntryKind = 'file' | 'dir' | 'symlink' | 'other';

export interface Entry {
  /** Relative to the scan root, with forward slashes. */
  readonly path: string;
  readonly kind: EntryKind;
  readonly size: number;
  /** Permission bits from lstat. */
  readonly mode: number;
  /** Raw link text, for symlinks only. Never resolved or followed. */
  readonly linkTarget?: string;
}

export interface Limits {
  readonly maxDepth: number;
  readonly maxEntries: number;
  readonly maxFileBytes: number;
  readonly timeoutMs: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxDepth: 64,
  maxEntries: 200_000,
  maxFileBytes: 1024 * 1024,
  timeoutMs: 30_000,
};

export interface WalkResult {
  /** Sorted by path. */
  readonly entries: readonly Entry[];
  /** Why the walk did not see everything. Empty when it did. */
  readonly incomplete: readonly string[];
}

// Inside a git dir these hold only content-addressed data no rule reads, and
// they can be huge. Everything else in a git dir (config, hooks, info) is walked.
const GIT_STORAGE_DIRS = new Set(['objects', 'logs']);

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Lists the tree under `root` using lstat only: symlinks are recorded, never
 * followed, so loops and links out of the repo cannot be traversed.
 */
export function walk(
  root: string,
  limits: Limits = DEFAULT_LIMITS,
  clock: () => number = Date.now,
): WalkResult {
  const deadline = clock() + limits.timeoutMs;
  const entries: Entry[] = [];
  const incomplete: string[] = [];
  const pending = [{ abs: root, rel: '', depth: 0 }];

  const finish = (): WalkResult => ({
    entries: entries.sort((a, b) => compareStrings(a.path, b.path)),
    incomplete,
  });

  for (let dir = pending.pop(); dir !== undefined; dir = pending.pop()) {
    const names = listDir(dir.abs, limits.maxEntries - entries.length + 1);
    if (names === undefined) {
      incomplete.push(`cannot read directory ${dir.rel || '.'}`);
      continue;
    }
    const isGitDir =
      dir.rel === '.git' ||
      dir.rel.endsWith('/.git') ||
      ['HEAD', 'objects', 'refs'].every((name) => names.includes(name));

    for (const name of names) {
      if (clock() > deadline) {
        incomplete.push(`time limit of ${limits.timeoutMs} ms reached`);
        return finish();
      }
      if (entries.length >= limits.maxEntries) {
        incomplete.push(`entry limit of ${limits.maxEntries} reached`);
        return finish();
      }

      const rel = dir.rel === '' ? name : `${dir.rel}/${name}`;
      const abs = join(dir.abs, name);
      let stats: Stats;
      try {
        stats = lstatSync(abs);
      } catch {
        incomplete.push(`cannot stat ${rel}`);
        continue;
      }

      const kind = kindOf(stats);
      entries.push({
        path: rel,
        kind,
        size: stats.size,
        mode: stats.mode & 0o7777,
        ...(kind === 'symlink' ? { linkTarget: readLink(abs) } : {}),
      });

      if (kind !== 'dir' || (isGitDir && GIT_STORAGE_DIRS.has(name))) continue;
      const depth = dir.depth + 1;
      if (depth >= limits.maxDepth) {
        incomplete.push(`depth limit of ${limits.maxDepth} reached at ${rel}`);
        continue;
      }
      pending.push({ abs, rel, depth });
    }
  }
  return finish();
}

/** Reads at most `max` names, sorted, or undefined when the directory is unreadable. */
function listDir(abs: string, max: number): string[] | undefined {
  try {
    const handle = opendirSync(abs);
    const names: string[] = [];
    try {
      for (let d = handle.readSync(); d !== null && names.length < max; d = handle.readSync()) {
        names.push(d.name);
      }
    } finally {
      handle.closeSync();
    }
    return names.sort(compareStrings);
  } catch {
    return undefined;
  }
}

function kindOf(stats: Stats): EntryKind {
  if (stats.isSymbolicLink()) return 'symlink';
  if (stats.isFile()) return 'file';
  if (stats.isDirectory()) return 'dir';
  return 'other';
}

function readLink(abs: string): string {
  try {
    return readlinkSync(abs);
  } catch {
    return '';
  }
}
