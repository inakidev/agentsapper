import { afterEach, describe, expect, it } from 'vitest';
import { materialize, type MaterializedFixture } from '../fixtures/materialize.js';
import type { FixtureEntry } from '../fixtures/spec.js';
import { DEFAULT_LIMITS, walk, type Limits } from '../src/walker.js';

let fixture: MaterializedFixture | undefined;

function repo(files: FixtureEntry[]): string {
  fixture = materialize({ id: 'walker', description: '', kind: 'benign', files, expect: [] });
  return fixture.root;
}

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});

const paths = (root: string, limits?: Limits) => walk(root, limits).entries.map((e) => e.path);

describe('walk', () => {
  it('lists every entry with POSIX paths in a stable order', () => {
    const root = repo([
      { type: 'file', path: 'b.txt', content: 'b' },
      { type: 'file', path: 'a/z.txt', content: 'z' },
      { type: 'file', path: 'a/B.txt', content: 'B' },
      { type: 'dir', path: 'c' },
    ]);

    const result = walk(root);

    expect(result.entries.map((e) => `${e.kind} ${e.path}`)).toEqual([
      'dir a',
      'file a/B.txt',
      'file a/z.txt',
      'file b.txt',
      'dir c',
    ]);
    expect(result.incomplete).toEqual([]);
  });

  it('records file sizes', () => {
    const root = repo([{ type: 'file', path: 'f', content: '12345' }]);

    expect(walk(root).entries[0]?.size).toBe(5);
  });

  it('records symlinks without descending into them', () => {
    const root = repo([
      { type: 'file', path: 'real/secret.txt', content: 'x' },
      { type: 'symlink', path: 'link', target: 'real', targetType: 'dir' },
    ]);

    const result = walk(root);

    expect(result.entries.map((e) => `${e.kind} ${e.path}`)).toEqual([
      'symlink link',
      'dir real',
      'file real/secret.txt',
    ]);
    expect(result.entries[0]?.linkTarget).toMatch(/real[\\/]?$/);
  });

  it('terminates on a circular symlink', () => {
    const root = repo([
      { type: 'dir', path: 'a' },
      { type: 'symlink', path: 'a/loop', target: '..', targetType: 'dir' },
    ]);

    expect(paths(root)).toEqual(['a', 'a/loop']);
  });

  it('stops at the depth limit and says so', () => {
    const root = repo([{ type: 'file', path: 'a/b/c/d.txt', content: 'x' }]);

    const result = walk(root, { ...DEFAULT_LIMITS, maxDepth: 2 });

    expect(result.entries.map((e) => e.path)).toEqual(['a', 'a/b']);
    expect(result.incomplete).toEqual(['depth limit of 2 reached at a/b']);
  });

  it('stops at the entry limit and says so', () => {
    const root = repo(
      ['1', '2', '3', '4', '5'].map((n) => ({ type: 'file', path: n, content: n })),
    );

    const result = walk(root, { ...DEFAULT_LIMITS, maxEntries: 3 });

    expect(result.entries).toHaveLength(3);
    expect(result.incomplete).toEqual(['entry limit of 3 reached']);
  });

  it('stops at the time limit and says so', () => {
    const root = repo([{ type: 'file', path: 'a/b.txt', content: 'x' }]);
    let now = 0;
    const clock = () => (now += 600);

    const result = walk(root, { ...DEFAULT_LIMITS, timeoutMs: 1000 }, clock);

    expect(result.incomplete).toEqual(['time limit of 1000 ms reached']);
  });

  it('lists git internals it needs but skips object and log storage', () => {
    const root = repo([
      { type: 'file', path: '.git/HEAD', content: 'ref: refs/heads/main\n' },
      { type: 'file', path: '.git/config', content: '' },
      { type: 'file', path: '.git/hooks/pre-commit', content: '' },
      { type: 'file', path: '.git/objects/ab/cdef', content: '' },
      { type: 'file', path: '.git/logs/HEAD', content: '' },
      { type: 'dir', path: '.git/refs/heads' },
    ]);

    expect(paths(root)).toEqual([
      '.git',
      '.git/HEAD',
      '.git/config',
      '.git/hooks',
      '.git/hooks/pre-commit',
      '.git/logs',
      '.git/objects',
      '.git/refs',
      '.git/refs/heads',
    ]);
  });

  it('skips object storage of an embedded bare repo too', () => {
    const root = repo([
      { type: 'file', path: 'vendor/x/HEAD', content: 'ref: refs/heads/main\n' },
      { type: 'file', path: 'vendor/x/config', content: '' },
      { type: 'file', path: 'vendor/x/objects/ab/cdef', content: '' },
      { type: 'dir', path: 'vendor/x/refs' },
    ]);

    expect(paths(root)).not.toContain('vendor/x/objects/ab');
    expect(paths(root)).toContain('vendor/x/config');
  });

  it('does not skip a plain directory that merely has an "objects" folder', () => {
    const root = repo([
      { type: 'file', path: 'game/HEAD', content: 'not a ref' },
      { type: 'file', path: 'game/objects/CLAUDE.md', content: 'x' },
    ]);

    expect(paths(root)).toContain('game/objects/CLAUDE.md');
  });

  it('reports a root it cannot read', () => {
    const root = repo([]);

    const result = walk(`${root}-missing`);

    expect(result.entries).toEqual([]);
    expect(result.incomplete).toEqual(['cannot read directory .']);
  });
});
