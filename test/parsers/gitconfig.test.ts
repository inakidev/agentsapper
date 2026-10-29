import { describe, expect, it } from 'vitest';
import { configKey, parseGitBool, parseGitConfig } from '../../src/parsers/gitconfig.js';

/** Renders entries as `key=value@line`, with `key@line` for valueless booleans. */
function entries(text: string): string[] {
  return parseGitConfig(text).entries.map(
    (e) => `${configKey(e)}${e.value === null ? '' : `=${e.value}`}@${e.line}`,
  );
}

function errorLines(text: string): number[] {
  return parseGitConfig(text).errors.map((e) => e.line);
}

describe('parseGitConfig', () => {
  it('parses sections, variables and values with line numbers', () => {
    expect(entries('[core]\n\tbare = false\n\teditor = vim\n')).toEqual([
      'core.bare=false@2',
      'core.editor=vim@3',
    ]);
  });

  it('lowercases section and variable names but keeps the value as written', () => {
    expect(entries('[CoRe]\n  FsMonitor = SomeValue\n')).toEqual(['core.fsmonitor=SomeValue@2']);
  });

  it('keeps quoted subsections case-sensitive and decodes their escapes', () => {
    const parsed = parseGitConfig('[filter "Pwn"]\nclean = c\n[a "x\\"y\\\\z\\q"]\nk = v\n');

    expect(parsed.entries[0]).toMatchObject({
      section: 'filter',
      subsection: 'Pwn',
      name: 'clean',
    });
    expect(parsed.entries[1]?.subsection).toBe('x"y\\zq');
  });

  it('lowercases the deprecated [section.subsection] form', () => {
    const [entry] = parseGitConfig('[Filter.PWN]\nclean = c\n').entries;

    expect(entry).toMatchObject({ section: 'filter', subsection: 'pwn', name: 'clean' });
  });

  it('keeps dots inside quoted subsections', () => {
    expect(entries('[url "https://example.com/"]\ninsteadOf = x\n')).toEqual([
      'url.https://example.com/.insteadof=x@2',
    ]);
  });

  it('treats a variable without "=" as a valueless boolean and "=" alone as empty', () => {
    const parsed = parseGitConfig('[core]\n\tbare\n\tempty =\n');

    expect(parsed.entries.map((e) => e.value)).toEqual([null, '']);
  });

  it('allows a variable on the same line as its section header', () => {
    expect(entries('[core] fsmonitor = x\n')).toEqual(['core.fsmonitor=x@1']);
    expect(entries('[a][core] editor = y')).toEqual(['core.editor=y@1']);
  });

  it('strips comments outside quotes only', () => {
    expect(entries('# top\n; also\n[a]\nk = v # c\nq = "x # y" ; c\n')).toEqual([
      'a.k=v@4',
      'a.q=x # y@5',
    ]);
  });

  it('trims surrounding whitespace, keeps internal whitespace and quoted padding', () => {
    expect(entries('[a]\nk =   one \t two   \nq = " padded "\n')).toEqual([
      'a.k=one \t two@2',
      'a.q= padded @3',
    ]);
  });

  it('decodes value escapes', () => {
    expect(parseGitConfig('[a]\nk = 1\\t2\\n3\\b4\\\\5\\"6\n').entries[0]?.value).toBe(
      '1\t2\n3\b4\\5"6',
    );
  });

  it('joins continuation lines and reports the line the variable starts on', () => {
    expect(entries('[a]\nk = abc\\\n  def\nnext = 1\n')).toEqual(['a.k=abc  def@2', 'a.next=1@4']);
    expect(entries('[a]\nk = "split \\\nquoted"\n')).toEqual(['a.k=split quoted@2']);
  });

  it('handles CRLF line endings, a UTF-8 BOM and a missing final newline', () => {
    expect(entries('\u{feff}[core]\r\n\tx = 1\r\n\ty = 2')).toEqual(['core.x=1@2', 'core.y=2@3']);
  });

  it('keeps "=" inside values', () => {
    expect(entries('[a]\nk = b=c\n')).toEqual(['a.k=b=c@2']);
  });

  it.each([
    ['an unterminated quote', '[a]\nk = "open\nok = 1\n', 2],
    ['an unknown escape', '[a]\nk = bad\\q\nok = 1\n', 2],
    ['a variable outside any section', 'k = v\n[a]\nok = 1\n', 1],
    ['an invalid name character', '[a]\nna_me = 1\nok = 1\n', 2],
    ['a comment where "=" is expected', '[a]\nbare # c\nok = 1\n', 2],
    ['junk after a quoted subsection', '[a "s"x]\nk = 1\n[a]\nok = 1\n', 1],
    ['an unquoted space in a section header', '[core x]\nk = 1\n[a]\nok = 1\n', 1],
    ['a newline inside a subsection', '[a "s\n"]\n[a]\nok = 1\n', 1],
  ])('reports %s and keeps parsing the next lines', (_label, text, line) => {
    expect(errorLines(text)[0]).toBe(line);
    expect(entries(text)).toContain(`a.ok=1@${text.split('\n').indexOf('ok = 1') + 1}`);
  });
});

describe('parseGitBool', () => {
  it.each([
    [null, true],
    ['', false],
    ['true', true],
    ['YES', true],
    ['On', true],
    ['false', false],
    ['no', false],
    ['OFF', false],
    ['1', true],
    ['0', false],
    ['2', true],
    ['1k', true],
    ['0x10', true],
    ['-1', true],
  ])('parses %j as %j', (value, expected) => {
    expect(parseGitBool(value)).toBe(expected);
  });

  it.each(['maybe', './hook', 'true ', '1x'])('does not treat %j as a boolean', (value) => {
    expect(parseGitBool(value)).toBeUndefined();
  });
});
