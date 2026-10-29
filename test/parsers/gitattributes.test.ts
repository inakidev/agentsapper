import { describe, expect, it } from 'vitest';
import { parseGitAttributes } from '../../src/parsers/gitattributes.js';

const TOP = { allowMacros: true };
const NESTED = { allowMacros: false };

describe('parseGitAttributes', () => {
  it('parses a pattern followed by attributes in every state', () => {
    const { lines, errors } = parseGitAttributes('*.txt filter=pwn diff -text !eol\n', TOP);

    expect(errors).toEqual([]);
    expect(lines).toEqual([
      {
        line: 1,
        pattern: '*.txt',
        attrs: [
          { name: 'filter', state: 'value', value: 'pwn' },
          { name: 'diff', state: 'set' },
          { name: 'text', state: 'unset' },
          { name: 'eol', state: 'unspecified' },
        ],
      },
    ]);
  });

  it('skips blank lines and comments, and tolerates leading whitespace and CRLF', () => {
    const { lines } = parseGitAttributes('# comment\n\n   \t*.c diff=cpp\r\n', TOP);

    expect(lines.map((l) => [l.line, l.pattern, l.attrs[0]?.value])).toEqual([[3, '*.c', 'cpp']]);
  });

  it('keeps everything after the first "=" as the value', () => {
    const { lines } = parseGitAttributes('* a=b=c\n', TOP);

    expect(lines[0]?.attrs).toEqual([{ name: 'a', state: 'value', value: 'b=c' }]);
  });

  it('accepts a pattern with no attributes', () => {
    expect(parseGitAttributes('*.c\n', TOP).lines[0]?.attrs).toEqual([]);
  });

  it('unquotes C-style quoted patterns', () => {
    const { lines } = parseGitAttributes('"a b\\t\\"c\\101.txt" filter=x\n', TOP);

    expect(lines[0]?.pattern).toBe('a b\t"cA.txt');
  });

  it('takes a pattern literally when its quotes do not unquote, as git does', () => {
    const { lines } = parseGitAttributes('"open filter=x\n', TOP);

    expect(lines[0]).toMatchObject({ pattern: '"open', attrs: [{ name: 'filter', value: 'x' }] });
  });

  it('accepts "-name=value" as unset, so the rest of the line still counts', () => {
    const { lines } = parseGitAttributes('*.c -foo=bar !baz=1 diff=evil\n', TOP);

    expect(lines[0]?.attrs).toEqual([
      { name: 'foo', state: 'unset' },
      { name: 'baz', state: 'unspecified' },
      { name: 'diff', state: 'value', value: 'evil' },
    ]);
  });

  it('parses macro definitions in top-level files', () => {
    const { lines } = parseGitAttributes('[attr]evil filter=pwn diff=pwn\n', TOP);

    expect(lines[0]).toMatchObject({ line: 1, pattern: '[attr]evil', macro: 'evil' });
    expect(lines[0]?.attrs.map((a) => a.value)).toEqual(['pwn', 'pwn']);
  });

  it('ignores macro definitions outside top-level files, as git does', () => {
    const { lines, errors } = parseGitAttributes('[attr]evil filter=pwn\n*.c evil\n', NESTED);

    expect(lines.map((l) => l.pattern)).toEqual(['*.c']);
    expect(errors.map((e) => e.line)).toEqual([1]);
  });

  it.each([
    ['a negative pattern', '!*.c filter=x\n'],
    ['an invalid attribute name', '*.c filter=x bad/name\n'],
    ['an attribute name starting with "-" after the prefix', '*.c --x\n'],
    ['an overlong line', `*.c filter=x ${'a'.repeat(2048)}\n`],
  ])('ignores the whole line for %s, as git does', (_label, text) => {
    const { lines, errors } = parseGitAttributes(`${text}*.ok diff=y\n`, TOP);

    expect(lines.map((l) => l.pattern)).toEqual(['*.ok']);
    expect(errors.map((e) => e.line)).toEqual([1]);
  });
});
