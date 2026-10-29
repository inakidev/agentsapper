import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { materialize } from '../fixtures/materialize.js';
import type { FixtureSpec } from '../fixtures/spec.js';

function spec(overrides: Partial<FixtureSpec>): FixtureSpec {
  return { id: 'test', description: 'test', kind: 'benign', files: [], expect: [], ...overrides };
}

describe('materialize', () => {
  it('writes files and dirs into a fresh temp dir and removes them on cleanup', () => {
    const fixture = materialize(
      spec({
        files: [
          { type: 'dir', path: 'empty' },
          { type: 'file', path: 'a/b/c.txt', content: 'hello' },
        ],
      }),
    );

    try {
      expect(fixture.root.startsWith(tmpdir())).toBe(true);
      expect(readFileSync(join(fixture.root, 'a', 'b', 'c.txt'), 'utf8')).toBe('hello');
      expect(lstatSync(join(fixture.root, 'empty')).isDirectory()).toBe(true);
    } finally {
      fixture.cleanup();
    }
    expect(existsSync(fixture.root)).toBe(false);
  });

  it('replaces the ROOT and OUTSIDE placeholders', () => {
    const fixture = materialize(
      spec({
        files: [{ type: 'file', path: 'x', content: 'r={{ROOT}} o={{OUTSIDE}}' }],
        outside: [{ type: 'file', path: 'y', content: 'outside' }],
      }),
    );

    try {
      const posix = (path: string) => path.split(sep).join('/');
      expect(readFileSync(join(fixture.root, 'x'), 'utf8')).toBe(
        `r=${posix(fixture.root)} o=${posix(fixture.outside)}`,
      );
      expect(readFileSync(join(fixture.outside, 'y'), 'utf8')).toBe('outside');
      expect(fixture.outside.startsWith(join(fixture.root, '..') + sep)).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it('creates symlinks without touching their targets', (ctx) => {
    let fixture;
    try {
      fixture = materialize(
        spec({ files: [{ type: 'symlink', path: 'link', target: 'missing', targetType: 'file' }] }),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('symlinks are not supported')) {
        ctx.skip();
      }
      throw error;
    }

    try {
      expect(lstatSync(join(fixture.root, 'link')).isSymbolicLink()).toBe(true);
      expect(readlinkSync(join(fixture.root, 'link'))).toBe('missing');
    } finally {
      fixture.cleanup();
    }
  });

  it.each(['../escape', '/abs/path', 'a/../../b', 'a\\b', '', 'a//b', './a'])(
    'rejects the unsafe entry path %j',
    (path) => {
      expect(() => materialize(spec({ files: [{ type: 'file', path, content: 'x' }] }))).toThrow(
        /unsafe fixture path/,
      );
    },
  );
});
