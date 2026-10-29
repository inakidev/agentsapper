import { baseName, isWithin, locate, parentOf, type PathPlace } from '../../paths.js';
import type { ScanContext } from '../../types.js';
import { compareStrings } from '../../walker.js';

export interface GitRepo {
  /** Repo-relative path of the git directory. */
  readonly gitDir: string;
  /** Repo-relative path of the working tree; absent for bare repos and submodule stores. */
  readonly workTree?: string;
  /**
   * root: the scanned repo's own .git. nested: a .git below the root.
   * bare: a directory that is itself a git dir. submodule: a store under .git/modules,
   * or a submodule checkout whose .git file points into one.
   */
  readonly kind: 'root' | 'nested' | 'bare' | 'submodule';
  /** The entry that makes this a repository: `.git`, `sub/.git` or the bare dir. */
  readonly marker: string;
}

/** A `.git` file or symlink that sends git somewhere this scan cannot follow. */
export interface GitDirEscape {
  readonly file: string;
  readonly line?: number;
  readonly evidence: string;
  readonly where: PathPlace;
}

export interface RepoScan {
  readonly repos: readonly GitRepo[];
  readonly escapes: readonly GitDirEscape[];
}

const GITFILE = /^gitdir: (.*?)\s*$/;
const VALID_HEAD = /^(ref: refs\/|[0-9a-f]{40}(?:[0-9a-f]{24})?\s*$)/;

export function findRepos(ctx: ScanContext): RepoScan {
  return ctx.memo('git:repos', () => discover(ctx));
}

function discover(ctx: ScanContext): RepoScan {
  const repos: GitRepo[] = [];
  const escapes: GitDirEscape[] = [];
  const gitDirs = new Set<string>();
  const add = (repo: GitRepo) => {
    repos.push(repo);
    gitDirs.add(repo.gitDir);
  };

  for (const entry of ctx.entries) {
    if (baseName(entry.path) !== '.git') continue;
    const parent = parentOf(entry.path);
    if (parent.split('/').includes('.git')) continue;
    const kind = parent === '' ? 'root' : 'nested';

    if (entry.kind === 'dir') {
      add({ gitDir: entry.path, workTree: parent, kind, marker: entry.path });
      continue;
    }

    let target: string | undefined;
    let evidence: string;
    let line: number | undefined;
    if (entry.kind === 'file') {
      const match = GITFILE.exec((ctx.readText(entry.path) ?? '').split('\n')[0] ?? '');
      target = match?.[1];
      evidence = `gitdir: ${target ?? ''}`;
      line = 1;
    } else if (entry.kind === 'symlink') {
      target = entry.linkTarget;
      evidence = `.git -> ${target ?? ''}`;
    } else {
      continue;
    }
    if (target === undefined || target === '') continue;

    const where = locate(ctx, parent, target);
    if (where.kind !== 'inside') {
      escapes.push({ file: entry.path, ...(line === undefined ? {} : { line }), evidence, where });
    } else if (ctx.entry(where.path)?.kind === 'dir') {
      const intoModules = /(^|\/)\.git\/modules\//.test(where.path);
      add({
        gitDir: where.path,
        workTree: parent,
        kind: intoModules ? 'submodule' : kind,
        marker: entry.path,
      });
    }
  }

  // Directories that are git dirs themselves: buried bare repos and submodule stores.
  for (const entry of ctx.entries) {
    if (entry.kind !== 'dir' || gitDirs.has(entry.path) || !looksLikeGitDir(ctx, entry.path))
      continue;
    if (baseName(entry.path) === '.git') continue;
    const container = [...gitDirs].find((dir) => isWithin(entry.path, dir));
    if (container === undefined) {
      add({ gitDir: entry.path, kind: 'bare', marker: entry.path });
    } else if (entry.path.startsWith(`${container}/modules/`)) {
      add({ gitDir: entry.path, kind: 'submodule', marker: entry.path });
    }
  }

  repos.sort((a, b) => compareStrings(a.gitDir, b.gitDir));
  return { repos, escapes };
}

/** Git's own test (setup.c, is_git_directory): a valid HEAD plus objects/ and refs/. */
function looksLikeGitDir(ctx: ScanContext, dir: string): boolean {
  const child = (name: string) => ctx.entry(`${dir}/${name}`)?.kind;
  if (child('HEAD') !== 'file' || child('objects') !== 'dir' || child('refs') !== 'dir') {
    return false;
  }
  return VALID_HEAD.test(ctx.readText(`${dir}/HEAD`) ?? '');
}
