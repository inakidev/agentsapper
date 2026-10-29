import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createContext } from '../src/context.js';
import { locate, relInside, resolveLinkTarget } from '../src/paths.js';
import { DEFAULT_LIMITS, walk, type Entry } from '../src/walker.js';

// Link resolution is pure path arithmetic over the walker's entries, so it can be
// tested on any OS with a synthetic tree, in both the POSIX ("physical") and the
// Win32 ("lexical") treatment of "..".

const root = resolve('/virtual/repo');
const dir = (path: string): Entry => ({ path, kind: 'dir', size: 0, mode: 0o755 });
const link = (path: string, linkTarget: string): Entry => ({
  path,
  kind: 'symlink',
  size: 0,
  mode: 0o777,
  linkTarget,
});

const ctx = createContext(
  root,
  {
    entries: [
      dir('a'),
      dir('a/conf'),
      link('a/b', '../x/y'),
      dir('x'),
      dir('x/conf'),
      dir('x/y'),
      link('chain1', 'chain2'),
      link('chain2', 'x'),
      link('loop1', 'loop2'),
      link('loop2', 'loop1'),
    ],
    incomplete: [],
  },
  DEFAULT_LIMITS,
);

describe('resolveLinkTarget', () => {
  it('applies ".." after following an intermediate symlink, as POSIX does', () => {
    expect(resolveLinkTarget(ctx, root, 'a/b/../conf', true)).toBe(join(root, 'x', 'conf'));
  });

  it('collapses ".." first, as Win32 path normalization does', () => {
    expect(resolveLinkTarget(ctx, root, 'a/b/../conf', false)).toBe(join(root, 'a', 'conf'));
  });

  it('follows chains of links inside the repo in both modes', () => {
    expect(resolveLinkTarget(ctx, root, 'chain1/conf', true)).toBe(join(root, 'x', 'conf'));
    expect(resolveLinkTarget(ctx, root, 'chain1/conf', false)).toBe(join(root, 'x', 'conf'));
  });

  it('gives up on loops', () => {
    expect(resolveLinkTarget(ctx, root, 'loop1', true)).toBeUndefined();
    expect(resolveLinkTarget(ctx, root, 'loop1', false)).toBeUndefined();
  });

  it('leaves the repo when ".." climbs past the root', () => {
    expect(resolveLinkTarget(ctx, root, '../outside', true)).toBe(join(root, '..', 'outside'));
  });
});

describe('locate with ".." after a symlink', () => {
  it('reports the symlink instead of guessing, on POSIX', () => {
    expect(locate(ctx, '', 'a/b/../conf', true)).toEqual({ kind: 'via-symlink', link: 'a/b' });
  });

  it('matches Win32 normalization on Windows', () => {
    expect(locate(ctx, '', 'a/b/../conf', false)).toEqual({ kind: 'inside', path: 'a/conf' });
  });
});

describe('resolveLinkTarget against the real filesystem', () => {
  // The OS follows each link and reads the marker file it lands next to; the resolver,
  // in this platform's mode, must land in the same place. Needs real symlinks: POSIX,
  // or Windows with Developer Mode or admin rights (GitHub's Windows runners). Junctions
  // would not do, because they store an absolute, already normalized target.
  it('lands where the OS does', (t) => {
    const base = mkdtempSync(join(tmpdir(), 'agentsapper-links-'));
    const at = (path: string) => join(base, ...path.split('/'));
    try {
      for (const dir of ['a/conf', 'x/y', 'x/conf']) mkdirSync(at(dir), { recursive: true });
      writeFileSync(at('a/conf/which'), 'a/conf');
      writeFileSync(at('x/conf/which'), 'x/conf');
      const links: readonly (readonly [string, string])[] = [
        ['a/b', '../x/y'],
        ['top', 'a/b/../conf'],
        ['a/nested', 'b/../conf'],
        ['twice', 'a/b/../../a/b/../conf'],
        ['chain', 'top'],
      ];
      try {
        for (const [path, target] of links) symlinkSync(target, at(path), 'dir');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EPERM')
          t.skip('real symlinks are unavailable');
        throw error;
      }

      const ctx = createContext(base, walk(base), DEFAULT_LIMITS);
      for (const [path] of links.slice(1)) {
        const ours = resolveLinkTarget(ctx, dirname(at(path)), ctx.entry(path)?.linkTarget ?? '');
        const osLanding = readFileSync(join(at(path), 'which'), 'utf8');
        expect(ours === undefined ? undefined : relInside(ctx, ours), path).toBe(osLanding);
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
