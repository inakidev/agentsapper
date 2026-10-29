import { afterEach, describe, expect, it } from 'vitest';
import { materialize, type MaterializedFixture } from '../fixtures/materialize.js';
import type { FixtureEntry } from '../fixtures/spec.js';
import { createContext } from '../src/context.js';
import { locate } from '../src/paths.js';
import { DEFAULT_LIMITS, walk } from '../src/walker.js';

let fixture: MaterializedFixture | undefined;

function context(files: FixtureEntry[]) {
  fixture = materialize({ id: 'paths', description: '', kind: 'benign', files, expect: [] });
  return createContext(fixture.root, walk(fixture.root), DEFAULT_LIMITS);
}

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});

describe('locate', () => {
  it('resolves relative paths against the base directory', () => {
    const ctx = context([{ type: 'dir', path: '.git' }]);

    expect(locate(ctx, '.git', '../tools/x')).toEqual({ kind: 'inside', path: 'tools/x' });
    expect(locate(ctx, '', 'a/../b')).toEqual({ kind: 'inside', path: 'b' });
    expect(locate(ctx, '.git', '..')).toEqual({ kind: 'inside', path: '' });
  });

  it('treats paths that leave the root, absolute paths elsewhere and ~ as outside', () => {
    const ctx = context([]);

    expect(locate(ctx, '', '../x').kind).toBe('outside');
    expect(locate(ctx, '', '/agentsapper-nowhere/x').kind).toBe('outside');
    expect(locate(ctx, '', '~/.gitconfig').kind).toBe('outside');
    expect(locate(ctx, '', '~other/x').kind).toBe('outside');
  });

  it('does not treat a name that starts with two dots as leaving the root', () => {
    const ctx = context([]);

    expect(locate(ctx, '', '..hidden')).toEqual({ kind: 'inside', path: '..hidden' });
  });

  it('flags paths that go through a symlink, whose real destination is unknown', () => {
    const ctx = context([
      { type: 'dir', path: 'real' },
      { type: 'symlink', path: 'link', target: 'real', targetType: 'dir' },
    ]);

    expect(locate(ctx, '', 'link/config')).toEqual({ kind: 'via-symlink', link: 'link' });
    expect(locate(ctx, '', 'link')).toEqual({ kind: 'via-symlink', link: 'link' });
  });
});
