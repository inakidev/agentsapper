import { afterEach, describe, expect, it } from 'vitest';
import { materialize, type MaterializedFixture } from '../fixtures/materialize.js';
import type { FixtureEntry } from '../fixtures/spec.js';
import { createContext } from '../src/context.js';
import { DEFAULT_LIMITS, walk, type Limits } from '../src/walker.js';

let fixture: MaterializedFixture | undefined;

function context(files: FixtureEntry[], limits: Limits = DEFAULT_LIMITS) {
  fixture = materialize({ id: 'context', description: '', kind: 'benign', files, expect: [] });
  return createContext(fixture.root, walk(fixture.root, limits), limits);
}

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});

describe('scan context', () => {
  it('reads regular files', () => {
    const ctx = context([{ type: 'file', path: 'a/b.txt', content: 'hello' }]);

    expect(ctx.readText('a/b.txt')).toBe('hello');
    expect(ctx.incomplete).toEqual([]);
  });

  it('never reads through a symlink, directory or missing path', () => {
    const ctx = context([
      { type: 'file', path: 'real/f.txt', content: 'secret' },
      { type: 'symlink', path: 'link', target: 'real', targetType: 'dir' },
    ]);

    expect(ctx.readText('link')).toBeUndefined();
    expect(ctx.readText('link/f.txt')).toBeUndefined();
    expect(ctx.readText('real')).toBeUndefined();
    expect(ctx.readText('nope')).toBeUndefined();
  });

  it('refuses files over the size limit and records that the scan is incomplete', () => {
    const ctx = context([{ type: 'file', path: 'big', content: 'x'.repeat(20) }], {
      ...DEFAULT_LIMITS,
      maxFileBytes: 10,
    });

    expect(ctx.readText('big')).toBeUndefined();
    expect(ctx.incomplete).toEqual(['skipped big: larger than 10 bytes']);
  });

  it('looks up entries and direct children', () => {
    const ctx = context([
      { type: 'file', path: 'd/one', content: '1' },
      { type: 'file', path: 'd/two', content: '2' },
      { type: 'file', path: 'd/sub/three', content: '3' },
    ]);

    expect(ctx.entry('d/one')?.kind).toBe('file');
    expect(ctx.entry('missing')).toBeUndefined();
    expect(ctx.children('d').map((e) => e.path)).toEqual(['d/one', 'd/sub', 'd/two']);
    expect(ctx.children('').map((e) => e.path)).toEqual(['d']);
  });

  it('memoizes shared computations per scan', () => {
    const ctx = context([]);
    let calls = 0;

    ctx.memo('k', () => ++calls);
    const second = ctx.memo('k', () => ++calls);

    expect(second).toBe(1);
    expect(calls).toBe(1);
  });
});
