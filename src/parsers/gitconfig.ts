// Parser for git's config file format, mirroring git's own config.c so that
// what we see is what git sees. Notable cases: a variable may follow its section
// header on the same line, values may continue across lines with a trailing
// backslash, and the deprecated [section.subsection] form is lowercased.
// Unlike git, which aborts at the first error, this parser records the error,
// skips to the next line and keeps going, so one bad line cannot hide the rest.

export interface ConfigEntry {
  /** Lowercased. */
  readonly section: string;
  /** Case preserved when quoted; lowercased in the deprecated dotted form. */
  readonly subsection?: string;
  /** Lowercased. */
  readonly name: string;
  /** Decoded value, or null when written without "=" (which git reads as true). */
  readonly value: string | null;
  /** 1-based line the variable starts on. */
  readonly line: number;
}

export interface ConfigError {
  readonly line: number;
  readonly message: string;
}

export interface ParsedConfig {
  readonly entries: readonly ConfigEntry[];
  readonly errors: readonly ConfigError[];
}

/** The key as git spells it: `section.subsection.name`, or `section.name`. */
export function configKey(entry: Pick<ConfigEntry, 'section' | 'subsection' | 'name'>): string {
  const sub = entry.subsection === undefined ? '' : `.${entry.subsection}`;
  return `${entry.section}${sub}.${entry.name}`;
}

/** Git's boolean reading (true/yes/on, false/no/off, empty, integers), or undefined. */
export function parseGitBool(value: string | null): boolean | undefined {
  if (value === null) return true;
  const lower = value.toLowerCase();
  if (lower === '' || lower === 'false' || lower === 'no' || lower === 'off') return false;
  if (lower === 'true' || lower === 'yes' || lower === 'on') return true;
  const int = /^([+-]?)(0x[0-9a-f]+|0[0-7]*|[1-9][0-9]*)[kmg]?$/.exec(lower);
  return int === null
    ? undefined
    : Number.parseInt(int[2] ?? '', int[2]?.startsWith('0x') ? 16 : 10) !== 0;
}

class ParseError extends Error {}

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
const isAlpha = (c: string) => /^[A-Za-z]$/.test(c);
const isKeyChar = (c: string) => /^[A-Za-z0-9-]$/.test(c);

class Reader {
  private pos = 0;
  line = 1;
  eof = false;
  last = '';

  constructor(private readonly text: string) {}

  /** Next character, with CRLF folded to LF and end of input reported as LF. */
  next(): string {
    if (this.pos >= this.text.length) {
      this.eof = true;
      return (this.last = '\n');
    }
    let c = this.text.charAt(this.pos++);
    if (c === '\r' && this.text.charAt(this.pos) === '\n') {
      this.pos++;
      c = '\n';
    }
    if (c === '\n') this.line++;
    return (this.last = c);
  }

  skipLine(): void {
    while (this.last !== '\n') this.next();
  }
}

export function parseGitConfig(text: string): ParsedConfig {
  const reader = new Reader(text.startsWith('\u{feff}') ? text.slice(1) : text);
  const entries: ConfigEntry[] = [];
  const errors: ConfigError[] = [];
  let section: { section: string; subsection?: string } | undefined;
  let comment = false;

  for (;;) {
    const line = reader.line;
    const c = reader.next();
    if (c === '\n') {
      if (reader.eof) break;
      comment = false;
      continue;
    }
    if (comment || isSpace(c)) continue;
    if (c === '#' || c === ';') {
      comment = true;
      continue;
    }

    try {
      if (c === '[') {
        section = undefined;
        section = parseHeader(reader);
      } else if (!isAlpha(c)) {
        throw new ParseError(`unexpected character ${JSON.stringify(c)}`);
      } else if (section === undefined) {
        throw new ParseError('variable outside of any section');
      } else {
        const { name, value } = parseVariable(reader, c);
        entries.push({ ...section, name, value, line });
      }
    } catch (error) {
      if (!(error instanceof ParseError)) throw error;
      errors.push({ line, message: error.message });
      reader.skipLine();
    }
  }
  return { entries, errors };
}

function parseHeader(reader: Reader): { section: string; subsection?: string } {
  let base = '';
  let subsection: string | undefined;
  for (;;) {
    const c = reader.next();
    if (reader.eof) throw new ParseError('unterminated section header');
    if (c === ']') break;
    if (isSpace(c)) {
      subsection = parseQuotedSubsection(reader, c);
      break;
    }
    if (!isKeyChar(c) && c !== '.') throw new ParseError('invalid character in section name');
    base += c.toLowerCase();
  }
  if (base === '') throw new ParseError('empty section name');

  // Git joins everything into one dotted name; the section is what precedes the first dot.
  const full = subsection === undefined ? base : `${base}.${subsection}`;
  const dot = full.indexOf('.');
  return dot === -1
    ? { section: full }
    : { section: full.slice(0, dot), subsection: full.slice(dot + 1) };
}

function parseQuotedSubsection(reader: Reader, first: string): string {
  let c = first;
  do {
    if (c === '\n') throw new ParseError('section header cannot span lines');
    c = reader.next();
  } while (isSpace(c));
  if (c !== '"') throw new ParseError('expected a quoted subsection name');

  let subsection = '';
  for (;;) {
    c = reader.next();
    if (c === '\n') throw new ParseError('section header cannot span lines');
    if (c === '"') break;
    if (c === '\\') {
      c = reader.next();
      if (c === '\n') throw new ParseError('section header cannot span lines');
    }
    subsection += c;
  }
  if (reader.next() !== ']') throw new ParseError('expected "]" after the subsection name');
  return subsection;
}

function parseVariable(reader: Reader, first: string): { name: string; value: string | null } {
  let name = first.toLowerCase();
  let c: string;
  for (;;) {
    c = reader.next();
    if (reader.eof || !isKeyChar(c)) break;
    name += c.toLowerCase();
  }
  while (c === ' ' || c === '\t') c = reader.next();
  if (c === '\n') return { name, value: null };
  if (c !== '=') throw new ParseError(`expected "=" after ${name}`);
  return { name, value: parseValue(reader) };
}

function parseValue(reader: Reader): string {
  let quote = false;
  let comment = false;
  let value = '';
  // Length to cut back to if only whitespace follows; 0 means nothing pending (as in git).
  let trimLength = 0;

  for (;;) {
    let c = reader.next();
    if (c === '\n') {
      if (quote) throw new ParseError('unterminated quoted value');
      return trimLength === 0 ? value : value.slice(0, trimLength);
    }
    if (comment) continue;
    if (isSpace(c) && !quote) {
      if (trimLength === 0) trimLength = value.length;
      if (value.length > 0) value += c;
      continue;
    }
    if (!quote && (c === ';' || c === '#')) {
      comment = true;
      continue;
    }
    trimLength = 0;
    if (c === '\\') {
      c = reader.next();
      switch (c) {
        case '\n':
          continue;
        case 't':
          c = '\t';
          break;
        case 'b':
          c = '\b';
          break;
        case 'n':
          c = '\n';
          break;
        case '\\':
        case '"':
          break;
        default:
          throw new ParseError(`invalid escape sequence "\\${c}"`);
      }
      value += c;
      continue;
    }
    if (c === '"') {
      quote = !quote;
      continue;
    }
    value += c;
  }
}
