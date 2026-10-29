import { describe, expect, it } from 'vitest';
import { frontmatterLines } from '../../src/parsers/frontmatter.js';
import { parseJsonc, pointer } from '../../src/parsers/jsonc.js';
import { parseToml } from '../../src/parsers/toml.js';

describe('parseJsonc', () => {
  it('parses JSON with comments and trailing commas, recording value lines', () => {
    const result = parseJsonc(
      ['{', '  // a comment', '  "a": [1, "two",],', '  /* block */ "b": {"c": true,},', '}'].join(
        '\n',
      ),
    );

    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ a: [1, 'two'], b: { c: true } });
    expect(result.lines.get('/a/1')).toBe(3);
    expect(result.lines.get('/b/c')).toBe(4);
  });

  it('escapes pointer segments as RFC 6901 says', () => {
    const result = parseJsonc('{"a/b": {"~x": 1}}');

    expect(pointer('a/b', '~x')).toBe('/a~1b/~0x');
    expect(result.lines.get(pointer('a/b', '~x'))).toBe(1);
  });

  it('decodes string escapes', () => {
    expect(parseJsonc('"a\\n\\u0041\\\\"').value).toBe('a\nA\\');
  });

  it('reports the line of a syntax error instead of throwing', () => {
    const result = parseJsonc('{\n  "a": 1\n  "b": 2\n}');

    expect(result.value).toBeUndefined();
    expect(result.error?.line).toBe(3);
  });
});

describe('parseToml', () => {
  const paths = (text: string) =>
    parseToml(text).entries.map((e) => `${e.path.join('.')}=${JSON.stringify(e.value)}@${e.line}`);

  it('parses tables, dotted and quoted keys, and scalar values', () => {
    expect(
      paths(
        [
          'approval_policy = "never" # comment',
          '[mcp_servers.docs]',
          "command = 'npx'",
          'startup_timeout_sec = 10',
          '[mcp_servers."my.server"]',
          'enabled = true',
        ].join('\n'),
      ),
    ).toEqual([
      'approval_policy="never"@1',
      'mcp_servers.docs.command="npx"@3',
      'mcp_servers.docs.startup_timeout_sec=10@4',
      'mcp_servers.my.server.enabled=true@6',
    ]);
  });

  it('numbers arrays of tables and flattens inline tables', () => {
    expect(
      paths(
        [
          '[[hooks.SessionStart]]',
          'command = "a"',
          '[[hooks.SessionStart]]',
          'command = "b"',
          'mcp_servers.x = { command = "c", env = { K = "v" } }',
        ].join('\n'),
      ),
    ).toEqual([
      'hooks.SessionStart.0.command="a"@2',
      'hooks.SessionStart.1.command="b"@4',
      'hooks.SessionStart.1.mcp_servers.x.command="c"@5',
      'hooks.SessionStart.1.mcp_servers.x.env.K="v"@5',
    ]);
  });

  it('handles multi-line arrays and strings', () => {
    const { entries } = parseToml('args = [\n  "-y", # c\n  "pkg",\n]\ns = """\nline1\nline2"""\n');

    expect(entries.find((e) => e.path.join('.') === 'args')?.value).toEqual(['-y', 'pkg']);
    expect(entries.find((e) => e.path.join('.') === 's')?.value).toBe('line1\nline2');
  });

  it('records errors and keeps going', () => {
    const { entries, errors } = parseToml('bad line\nok = 1\n');

    expect(errors.map((e) => e.line)).toEqual([1]);
    expect(entries.map((e) => e.path.join('.'))).toEqual(['ok']);
  });
});

describe('frontmatterLines', () => {
  it('reads indented key/value lines with file line numbers', () => {
    const text = [
      '---',
      'name: reviewer',
      'hooks:',
      '  PreToolUse:',
      '    - command: "./x"',
      '---',
      'body',
    ].join('\n');

    expect(frontmatterLines(text)).toEqual([
      { key: 'name', value: 'reviewer', indent: 0, line: 2 },
      { key: 'hooks', value: '', indent: 0, line: 3 },
      { key: 'PreToolUse', value: '', indent: 2, line: 4 },
      { key: 'command', value: './x', indent: 4, line: 5 },
    ]);
  });

  it('returns nothing without a complete frontmatter block', () => {
    expect(frontmatterLines('# Title\nhooks: x\n')).toEqual([]);
    expect(frontmatterLines('---\nhooks: x\n')).toEqual([]);
  });
});
