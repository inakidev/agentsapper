import { describe, expect, it } from 'vitest';
import { gitIndex } from '../../fixtures/specs/helpers.js';
import { isSymlinkMode, parseGitIndex } from '../../src/parsers/gitindex.js';

/** A version 4 entry: stat data with the mode, a zero object id, flags, then the path. */
function v4Entry(mode: number, strip: number, suffix: string): Buffer {
  const fixed = Buffer.alloc(62);
  fixed.writeUInt32BE(mode, 24);
  return Buffer.concat([fixed, Buffer.from([strip]), Buffer.from(`${suffix}\0`)]);
}

describe('parseGitIndex', () => {
  it('reads paths and modes from a version 2 index', () => {
    const index = Buffer.from(
      gitIndex([
        { path: '.claude', mode: 0o120000 },
        { path: 'src/a-much-longer-name.ts', mode: 0o100644 },
      ]),
      'base64',
    );

    expect(parseGitIndex(index)).toEqual([
      { path: '.claude', mode: 0o120000 },
      { path: 'src/a-much-longer-name.ts', mode: 0o100644 },
    ]);
  });

  it('expands the prefix-compressed paths of version 4', () => {
    const header = Buffer.from([...Buffer.from('DIRC'), 0, 0, 0, 4, 0, 0, 0, 2]);
    const index = Buffer.concat([
      header,
      v4Entry(0o100644, 0, 'docs/a.md'),
      v4Entry(0o120000, 4, 'b'),
    ]);

    expect(parseGitIndex(index)).toEqual([
      { path: 'docs/a.md', mode: 0o100644 },
      { path: 'docs/b', mode: 0o120000 },
    ]);
  });

  it('rejects anything that is not a well-formed index', () => {
    const index = Buffer.from(gitIndex([{ path: 'a', mode: 0o100644 }]), 'base64');

    expect(parseGitIndex(Buffer.from('not an index'))).toBeUndefined();
    expect(parseGitIndex(index.subarray(0, 40))).toBeUndefined();
  });

  it('tells symlinks from files', () => {
    expect(isSymlinkMode(0o120000)).toBe(true);
    expect(isSymlinkMode(0o100755)).toBe(false);
  });
});
