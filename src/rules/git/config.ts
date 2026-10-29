import {
  configKey,
  parseGitBool,
  parseGitConfig,
  type ConfigEntry,
} from '../../parsers/gitconfig.js';
import { locate, parentOf, type PathPlace } from '../../paths.js';
import type { ScanContext } from '../../types.js';
import { readLinked } from '../linked.js';
import type { GitRepo } from './repos.js';

export interface SourcedEntry extends ConfigEntry {
  /** Repo-relative file the entry was read from. */
  readonly file: string;
  /** True when it came through includeIf, whose condition this scan does not evaluate. */
  readonly conditional: boolean;
}

export interface IncludeRef {
  readonly file: string;
  readonly line: number;
  readonly key: string;
  readonly value: string;
  readonly where: PathPlace;
  readonly exists: boolean;
}

export interface RepoConfig {
  /** Every entry git would read for this repo, in order, with includes expanded in place. */
  readonly entries: readonly SourcedEntry[];
  readonly includes: readonly IncludeRef[];
}

/** git refuses to nest includes deeper than this (config.c, MAX_INCLUDE_DEPTH). */
const MAX_INCLUDE_DEPTH = 10;

export function repoConfig(ctx: ScanContext, repo: GitRepo): RepoConfig {
  return ctx.memo(`git:config:${repo.gitDir}`, () => {
    const entries: SourcedEntry[] = [];
    const includes: IncludeRef[] = [];

    const load = (file: string, conditional: boolean, stack: readonly string[]) => {
      const text = readLinked(ctx, file);
      if (text === undefined) return;
      for (const entry of parseGitConfig(text).entries) {
        entries.push({ ...entry, file, conditional });
        if (!isInclude(entry) || entry.value === null || entry.value === '') continue;

        const where = locate(ctx, parentOf(file), entry.value);
        const exists = where.kind === 'inside' && ctx.entry(where.path)?.kind === 'file';
        includes.push({
          file,
          line: entry.line,
          key: configKey(entry),
          value: entry.value,
          where,
          exists,
        });
        if (exists && stack.length < MAX_INCLUDE_DEPTH && !stack.includes(where.path)) {
          load(where.path, conditional || entry.section === 'includeif', [...stack, where.path]);
        }
      }
    };

    const main = `${repo.gitDir}/config`;
    load(main, false, [main]);
    // config.worktree is only read when the repo opts in, and it overrides the main config.
    const worktree = `${repo.gitDir}/config.worktree`;
    if (liveBool({ entries, includes }, 'extensions.worktreeconfig'))
      load(worktree, false, [worktree]);
    return { entries, includes };
  });
}

function isInclude(entry: ConfigEntry): boolean {
  if (entry.name !== 'path') return false;
  return (
    (entry.section === 'include' && entry.subsection === undefined) ||
    (entry.section === 'includeif' && entry.subsection !== undefined)
  );
}

/** credential.helper and credential.<url>.helper accumulate; an empty value resets the list. */
function isMultiValued(entry: ConfigEntry): boolean {
  return entry.section === 'credential' && entry.name === 'helper';
}

/**
 * The entries that may be in effect. For single-valued keys git uses the last
 * value, so an unconditional entry hides earlier ones; entries from includeIf
 * might not apply, so they never hide anything and are always kept.
 */
export function liveEntries(config: RepoConfig): SourcedEntry[] {
  const groups = new Map<string, SourcedEntry[]>();
  for (const entry of config.entries) {
    const key = configKey(entry);
    const group = groups.get(key) ?? [];
    if (isMultiValued(entry)) {
      if (!entry.conditional && entry.value === '') group.length = 0;
      else group.push(entry);
    } else if (!entry.conditional) {
      group.length = 0;
      group.push(entry);
    } else {
      group.push(entry);
    }
    groups.set(key, group);
  }
  const live = new Set([...groups.values()].flat());
  return config.entries.filter((entry) => live.has(entry));
}

/** True when any live value of `key` (lowercase, without subsection) reads as true. */
export function liveBool(config: RepoConfig, key: string): boolean {
  return liveEntries(config).some(
    (entry) => configKey(entry) === key && parseGitBool(entry.value) === true,
  );
}

/** `key = value` as evidence, with the subsection spelled as written. */
export function evidenceOf(entry: ConfigEntry): string {
  return entry.value === null ? configKey(entry) : `${configKey(entry)} = ${entry.value}`;
}
