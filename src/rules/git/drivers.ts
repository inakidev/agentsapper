import {
  parseGitAttributes,
  type AttrAssignment,
  type AttrLine,
} from '../../parsers/gitattributes.js';
import { baseName, isWithin, locate, parentOf } from '../../paths.js';
import type { ScanContext } from '../../types.js';
import { liveEntries, type RepoConfig, type SourcedEntry } from './config.js';
import { readLinked, realPath } from '../linked.js';
import type { GitRepo } from './repos.js';

export type DriverAttr = 'filter' | 'diff' | 'merge';

/** Config keys under `<attr>.<driver>.` that hold a command git runs. */
export const DRIVER_KEYS: Readonly<Record<DriverAttr, readonly string[]>> = {
  filter: ['clean', 'smudge', 'process'],
  diff: ['textconv', 'command'],
  merge: ['driver'],
};

// `git lfs install --local` writes exactly these; they run the git-lfs binary, not repo content.
const LFS_COMMANDS: Readonly<Record<string, string>> = {
  clean: 'git-lfs clean -- %f',
  smudge: 'git-lfs smudge -- %f',
  process: 'git-lfs filter-process',
};

export function isDriverAttr(name: string): name is DriverAttr {
  return name === 'filter' || name === 'diff' || name === 'merge';
}

/** Live driver commands in a repo's config, minus git-lfs's canonical filter. */
export function driverCommands(config: RepoConfig): SourcedEntry[] {
  return liveEntries(config).filter(
    (entry) =>
      isDriverAttr(entry.section) &&
      entry.subsection !== undefined &&
      DRIVER_KEYS[entry.section].includes(entry.name) &&
      entry.value !== null &&
      entry.value !== '' &&
      !(
        entry.section === 'filter' &&
        entry.subsection === 'lfs' &&
        LFS_COMMANDS[entry.name] === entry.value
      ),
  );
}

export interface AttrFile {
  readonly path: string;
  /** Top-level files may define macros. */
  readonly topLevel: boolean;
  /** git follows links for info/attributes and core.attributesFile, not for .gitattributes. */
  readonly followLinks: boolean;
}

/** Attribute files git reads for this repo, as far as they live inside the scan root. */
export function attributeFiles(
  ctx: ScanContext,
  repo: GitRepo,
  repos: readonly GitRepo[],
  config: RepoConfig,
): AttrFile[] {
  const files: AttrFile[] = [];

  const info = `${repo.gitDir}/info/attributes`;
  if (realPath(ctx, info) !== undefined)
    files.push({ path: info, topLevel: true, followLinks: true });

  for (const entry of liveEntries(config)) {
    if (entry.section !== 'core' || entry.name !== 'attributesfile' || !entry.value) continue;
    const where = locate(ctx, repo.workTree ?? repo.gitDir, entry.value);
    if (where.kind === 'inside' && realPath(ctx, where.path) !== undefined)
      files.push({ path: where.path, topLevel: true, followLinks: true });
  }

  const workTree = repo.workTree;
  if (workTree === undefined) return files;
  for (const entry of ctx.entries) {
    if (entry.kind !== 'file' || baseName(entry.path) !== '.gitattributes') continue;
    const dir = parentOf(entry.path);
    if (!isWithin(dir, workTree) || ownerOf(dir, repos) !== repo) continue;
    if (repos.some((other) => isWithin(entry.path, other.gitDir))) continue;
    files.push({ path: entry.path, topLevel: dir === workTree, followLinks: false });
  }
  return files;
}

/** The repo whose working tree most closely contains `dir`. */
function ownerOf(dir: string, repos: readonly GitRepo[]): GitRepo | undefined {
  let owner: GitRepo | undefined;
  for (const repo of repos) {
    if (repo.workTree === undefined || !isWithin(dir, repo.workTree)) continue;
    if (owner?.workTree === undefined || repo.workTree.length > owner.workTree.length) owner = repo;
  }
  return owner;
}

export interface DriverUse {
  readonly file: string;
  readonly line: AttrLine;
  readonly attr: DriverAttr;
  readonly driver: string;
  /** Macro the assignment came from, when it was not written directly. */
  readonly macro?: string;
}

const BUILTIN_MACROS: ReadonlyMap<string, readonly AttrAssignment[]> = new Map([
  [
    'binary',
    [
      { name: 'diff', state: 'unset' },
      { name: 'merge', state: 'unset' },
      { name: 'text', state: 'unset' },
    ],
  ],
]);

/** Every place an attribute file assigns filter=, diff= or merge= to a named driver. */
export function driverUses(ctx: ScanContext, files: readonly AttrFile[]): DriverUse[] {
  const parsed = files.flatMap((file) => {
    const text = file.followLinks ? readLinked(ctx, file.path) : ctx.readText(file.path);
    return text === undefined
      ? []
      : [
          {
            file: file.path,
            lines: parseGitAttributes(text, { allowMacros: file.topLevel }).lines,
          },
        ];
  });

  const macros = new Map(BUILTIN_MACROS);
  for (const { lines } of parsed) {
    for (const line of lines) if (line.macro !== undefined) macros.set(line.macro, line.attrs);
  }

  const uses: DriverUse[] = [];
  for (const { file, lines } of parsed) {
    for (const line of lines) {
      if (line.macro !== undefined) continue;
      for (const { attr, macro } of expand(line.attrs, macros, undefined, 0)) {
        if (attr.state === 'value' && isDriverAttr(attr.name) && attr.value) {
          uses.push({
            file,
            line,
            attr: attr.name,
            driver: attr.value,
            ...(macro ? { macro } : {}),
          });
        }
      }
    }
  }
  return uses;
}

function expand(
  attrs: readonly AttrAssignment[],
  macros: ReadonlyMap<string, readonly AttrAssignment[]>,
  macro: string | undefined,
  depth: number,
): { attr: AttrAssignment; macro: string | undefined }[] {
  return attrs.flatMap((attr) => {
    const body = macros.get(attr.name);
    if (body === undefined || attr.state !== 'set' || depth >= 10) return [{ attr, macro }];
    return expand(body, macros, macro ?? attr.name, depth + 1);
  });
}
