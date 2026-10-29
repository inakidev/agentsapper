import { dirname, isAbsolute, join, parse, posix, relative, resolve, sep } from 'node:path';
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
 * How the host OS treats ".." in a path: POSIX applies it to the directory reached so
 * far, after following any symlink on the way ("physical"); Win32 path normalization
 * collapses it as text first ("lexical"). `a/b/../conf` with `a/b` a symlink to `x/y`
 * is `x/conf` on Linux and `a/conf` on Windows.
 */
export const PHYSICAL_DOTDOT = process.platform !== 'win32';

const stripDevicePrefix = (path: string) => (path.startsWith('\\\\?\\') ? path.slice(4) : path);

/** Repo-relative path (forward slashes, '' for the root) of `abs`, or undefined if outside. */
export function relInside(ctx: ScanContext, abs: string): string | undefined {
  const rel = relative(ctx.root, abs);
  if (rel === '') return '';
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined;
  return rel.split(sep).join('/');
}

/**
 * Resolves `value` the way git resolves a configured path: relative to
 * `baseDir` (repo-relative), absolute as is, and `~` meaning a home directory.
 * A path that passes through a symlink inside the repo is reported as such,
 * checked before any ".." is applied, so text and OS cannot disagree silently.
 */
export function locate(
  ctx: ScanContext,
  baseDir: string,
  value: string,
  physical = PHYSICAL_DOTDOT,
): PathPlace {
  const trimmed = stripDevicePrefix(value);
  if (trimmed.startsWith('~')) return { kind: 'outside', abs: trimmed };
  if (!physical) {
    return place(
      ctx,
      isAbsolute(trimmed) ? resolve(trimmed) : resolve(absPath(ctx, baseDir), trimmed),
    );
  }
  let current = isAbsolute(trimmed) ? sep : absPath(ctx, baseDir);
  for (const part of trimmed.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      current = dirname(current);
      continue;
    }
    current = join(current, part);
    const rel = relInside(ctx, current);
    if (rel !== undefined && rel !== '' && ctx.entry(rel)?.kind === 'symlink') {
      return { kind: 'via-symlink', link: rel };
    }
  }
  return place(ctx, current);
}

/**
 * Where a symlink's text leads, worked out from the walker's entries the way the OS
 * would resolve it (see PHYSICAL_DOTDOT), following links inside the repo hop by hop.
 * Nothing is opened. Returns undefined for loops and chains longer than the OS allows.
 */
export function resolveLinkTarget(
  ctx: ScanContext,
  fromDir: string,
  target: string,
  physical = PHYSICAL_DOTDOT,
  hops = { count: 0 },
): string | undefined {
  const text = stripDevicePrefix(target);
  if (text === '') return undefined;
  let current: string;
  let parts: string[];
  if (physical) {
    current = isAbsolute(text) ? parse(resolve(text)).root : fromDir;
    parts = text.split('/');
  } else {
    const abs = resolve(fromDir, text);
    current = parse(abs).root;
    parts = abs.slice(current.length).split(/[\\/]/);
  }
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      current = dirname(current);
      continue;
    }
    current = join(current, part);
    const rel = relInside(ctx, current);
    const entry = rel === undefined || rel === '' ? undefined : ctx.entry(rel);
    if (entry?.kind !== 'symlink') continue;
    if (++hops.count > MAX_LINK_HOPS) return undefined;
    const next = resolveLinkTarget(ctx, dirname(current), entry.linkTarget ?? '', physical, hops);
    if (next === undefined) return undefined;
    current = next;
  }
  return current;
}

/** Same hop limit as Linux's ELOOP. */
const MAX_LINK_HOPS = 40;

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
