import { isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import type { ScanContext } from './types.js';

/** Where a path points, worked out lexically. Nothing is followed or read. */
export type PathPlace =
  /** Inside the scan root; `path` is repo-relative with forward slashes ('' is the root). */
  | { readonly kind: 'inside'; readonly path: string }
  | { readonly kind: 'outside'; readonly abs: string }
  /** Goes through a symlink inside the repo, so the real destination is unknown. */
  | { readonly kind: 'via-symlink'; readonly link: string };

export function absPath(ctx: ScanContext, rel: string): string {
  return rel === '' ? ctx.root : join(ctx.root, ...rel.split('/'));
}

/** Repo-relative parent directory ('' for top-level entries). */
export function parentOf(rel: string): string {
  const dir = posix.dirname(rel);
  return dir === '.' ? '' : dir;
}

export function baseName(rel: string): string {
  return posix.basename(rel);
}

/** True when `rel` is `dir` itself or somewhere below it. */
export function isWithin(rel: string, dir: string): boolean {
  return dir === '' || rel === dir || rel.startsWith(`${dir}/`);
}

/**
 * Resolves `value` the way git resolves a configured path: relative to
 * `baseDir` (repo-relative), absolute as is, and `~` meaning a home directory.
 */
export function locate(ctx: ScanContext, baseDir: string, value: string): PathPlace {
  const trimmed = value.startsWith('\\\\?\\') ? value.slice(4) : value;
  if (trimmed.startsWith('~')) return { kind: 'outside', abs: trimmed };
  const abs = isAbsolute(trimmed) ? resolve(trimmed) : resolve(absPath(ctx, baseDir), trimmed);
  return place(ctx, abs);
}

export function place(ctx: ScanContext, abs: string): PathPlace {
  const rel = relative(ctx.root, abs);
  if (rel === '') return { kind: 'inside', path: '' };
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    return { kind: 'outside', abs };

  const parts = rel.split(sep);
  for (let i = 1; i <= parts.length; i++) {
    const prefix = parts.slice(0, i).join('/');
    if (ctx.entry(prefix)?.kind === 'symlink') return { kind: 'via-symlink', link: prefix };
  }
  return { kind: 'inside', path: parts.join('/') };
}

export function describePlace(placed: PathPlace): string {
  switch (placed.kind) {
    case 'inside':
      return placed.path === '' ? 'the repository root' : placed.path;
    case 'outside':
      return `${placed.abs}, outside the repository`;
    case 'via-symlink':
      return `a path through the symlink ${placed.link}`;
  }
}
