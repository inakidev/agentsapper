// Parser for gitattributes files, mirroring git's attr.c. Where git ignores a
// whole line (invalid attribute name, negative pattern, overlong line, macro
// outside a top-level file), so do we: such lines cannot take effect.

export type AttrState = 'set' | 'unset' | 'unspecified' | 'value';

export interface AttrAssignment {
  readonly name: string;
  readonly state: AttrState;
  readonly value?: string;
}

export interface AttrLine {
  /** 1-based. */
  readonly line: number;
  readonly pattern: string;
  /** Set when the line defines a macro (`[attr]name ...`). */
  readonly macro?: string;
  readonly attrs: readonly AttrAssignment[];
}

export interface ParsedAttributes {
  readonly lines: readonly AttrLine[];
  readonly errors: readonly { readonly line: number; readonly message: string }[];
}

export interface AttributesOptions {
  /** Macros may only be defined in top-level files ($GIT_DIR/info/attributes, root .gitattributes). */
  readonly allowMacros: boolean;
}

/** git ignores attribute lines longer than this (attr.c, ATTR_MAX_LINE_LENGTH). */
const MAX_LINE_LENGTH = 2048;
const MACRO_PREFIX = '[attr]';
const ATTR_NAME = /^[A-Za-z0-9_.][A-Za-z0-9_.-]*$/;
const BLANK = /[ \t\r\n]+/;

const C_ESCAPES: Record<string, string> = {
  a: '\x07',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '\\': '\\',
  '"': '"',
};

export function parseGitAttributes(text: string, options: AttributesOptions): ParsedAttributes {
  const lines: AttrLine[] = [];
  const errors: { line: number; message: string }[] = [];

  text.split('\n').forEach((raw, index) => {
    const line = index + 1;
    const parsed = parseLine(raw, line, options);
    if (typeof parsed === 'string') errors.push({ line, message: parsed });
    else if (parsed !== undefined) lines.push(parsed);
  });

  return { lines, errors };
}

/** The parsed line, undefined for blank lines and comments, or why git ignores it. */
function parseLine(
  raw: string,
  line: number,
  options: AttributesOptions,
): AttrLine | string | undefined {
  const rest = raw.replace(/^[ \t\r]+/, '');
  if (rest === '' || rest.startsWith('#')) return undefined;
  if (Buffer.byteLength(raw) >= MAX_LINE_LENGTH) return 'line too long, ignored by git';

  // A quoted pattern that fails to unquote is taken literally, as git does.
  const { pattern, tail } = unquotePattern(rest) ?? splitPlainPattern(rest);

  let macro: string | undefined;
  if (pattern.startsWith(MACRO_PREFIX)) {
    if (!options.allowMacros) return 'macro defined outside a top-level attributes file';
    macro = pattern.slice(MACRO_PREFIX.length);
    if (!ATTR_NAME.test(macro)) return `invalid macro name ${JSON.stringify(macro)}`;
  } else if (pattern.startsWith('!')) {
    return 'negative patterns are ignored by git';
  }

  const attrs: AttrAssignment[] = [];
  for (const token of tail.split(BLANK).filter((t) => t !== '')) {
    const attr = parseAttr(token);
    if (attr === undefined) return `invalid attribute ${JSON.stringify(token)}`;
    attrs.push(attr);
  }
  return { line, pattern, ...(macro === undefined ? {} : { macro }), attrs };
}

function splitPlainPattern(rest: string): { pattern: string; tail: string } {
  const end = rest.search(BLANK);
  return end === -1
    ? { pattern: rest, tail: '' }
    : { pattern: rest.slice(0, end), tail: rest.slice(end) };
}

function unquotePattern(rest: string): { pattern: string; tail: string } | undefined {
  if (!rest.startsWith('"')) return undefined;
  let pattern = '';
  for (let i = 1; i < rest.length; i++) {
    const c = rest.charAt(i);
    if (c === '"') return { pattern, tail: rest.slice(i + 1) };
    if (c !== '\\') {
      pattern += c;
      continue;
    }
    const next = rest.charAt(++i);
    const octal = /^[0-3][0-7]{2}/.exec(rest.slice(i));
    if (octal !== null) {
      pattern += String.fromCharCode(Number.parseInt(octal[0], 8));
      i += 2;
    } else if (next in C_ESCAPES) {
      pattern += C_ESCAPES[next];
    } else {
      return undefined;
    }
  }
  return undefined;
}

function parseAttr(token: string): AttrAssignment | undefined {
  const eq = token.indexOf('=');
  const head = eq === -1 ? token : token.slice(0, eq);
  // Like git, "-name=value" and "!name=value" are accepted and the value is dropped.
  if (head.startsWith('-') || head.startsWith('!')) {
    const name = head.slice(1);
    const state = head.startsWith('-') ? 'unset' : 'unspecified';
    return ATTR_NAME.test(name) ? { name, state } : undefined;
  }
  if (!ATTR_NAME.test(head)) return undefined;
  return eq === -1
    ? { name: head, state: 'set' }
    : { name: head, state: 'value', value: token.slice(eq + 1) };
}
