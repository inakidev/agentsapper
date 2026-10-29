// A TOML subset sufficient for agent config files (Codex .codex/config.toml):
// tables, arrays of tables, dotted and quoted keys, strings (basic, literal and
// multi-line), arrays, inline tables, booleans and numbers. Every leaf value is
// reported with its full key path and line, so rules can match paths directly.

export interface TomlEntry {
  /** Full path, with array-of-table indices as numbers, e.g. ['hooks', 'PreToolUse', 0, 'command']. */
  readonly path: readonly (string | number)[];
  readonly value: unknown;
  readonly line: number;
}

export interface ParsedToml {
  readonly entries: readonly TomlEntry[];
  readonly errors: readonly { readonly line: number; readonly message: string }[];
}

class TomlError extends Error {}

export function parseToml(text: string): ParsedToml {
  const entries: TomlEntry[] = [];
  const errors: { line: number; message: string }[] = [];
  const arrayCounts = new Map<string, number>();
  let table: (string | number)[] = [];
  let pos = 0;
  let line = 1;

  const peek = (n = 0) => text.charAt(pos + n);
  const advance = () => {
    const c = text.charAt(pos++);
    if (c === '\n') line++;
    return c;
  };
  const skipSpaces = () => {
    while (peek() === ' ' || peek() === '\t') pos++;
  };
  const skipComment = () => {
    if (peek() === '#') while (pos < text.length && peek() !== '\n') pos++;
  };
  /** Whitespace, newlines and comments, as allowed inside arrays and between statements. */
  const skipAll = () => {
    for (;;) {
      skipSpaces();
      skipComment();
      if (peek() === '\n' || peek() === '\r') advance();
      else return;
    }
  };
  const expectLineEnd = () => {
    skipSpaces();
    skipComment();
    if (peek() === '\r') pos++;
    if (pos < text.length && peek() !== '\n') throw new TomlError('expected end of line');
  };

  const parseKeyPart = (): string => {
    const c = peek();
    if (c === '"' || c === "'") return parseString();
    const bare = /^[A-Za-z0-9_-]+/.exec(text.slice(pos));
    if (bare === null) throw new TomlError('expected a key');
    pos += bare[0].length;
    return bare[0];
  };
  const parseKey = (): string[] => {
    const parts = [parseKeyPart()];
    for (;;) {
      skipSpaces();
      if (peek() !== '.') return parts;
      pos++;
      skipSpaces();
      parts.push(parseKeyPart());
    }
  };

  const parseString = (): string => {
    const quote = peek();
    const multi = text.startsWith(quote.repeat(3), pos);
    pos += multi ? 3 : 1;
    if (multi && peek() === '\n') advance();
    let out = '';
    for (;;) {
      if (pos >= text.length) throw new TomlError('unterminated string');
      if (multi ? text.startsWith(quote.repeat(3), pos) : peek() === quote) {
        pos += multi ? 3 : 1;
        return out;
      }
      const c = advance();
      if (c === '\n' && !multi) throw new TomlError('newline in string');
      if (c !== '\\' || quote === "'") {
        out += c;
        continue;
      }
      const e = advance();
      const simple: Record<string, string> = {
        b: '\b',
        t: '\t',
        n: '\n',
        f: '\f',
        r: '\r',
        '"': '"',
        '\\': '\\',
      };
      if (e in simple) out += simple[e];
      else if (e === 'u' || e === 'U') {
        const len = e === 'u' ? 4 : 8;
        out += String.fromCodePoint(Number.parseInt(text.slice(pos, pos + len), 16));
        pos += len;
      } else if (multi && /\s/.test(e)) {
        // Line-ending backslash: trim the newline and following whitespace.
        while (/\s/.test(peek())) advance();
      } else throw new TomlError('invalid escape');
    }
  };

  const parseValue = (): unknown => {
    const c = peek();
    if (c === '"' || c === "'") return parseString();
    if (c === '[') {
      pos++;
      const arr: unknown[] = [];
      for (;;) {
        skipAll();
        if (peek() === ']') {
          pos++;
          return arr;
        }
        arr.push(parseValue());
        skipAll();
        if (peek() === ',') pos++;
        else if (peek() !== ']') throw new TomlError('expected "," or "]"');
      }
    }
    if (c === '{') {
      pos++;
      const obj: Record<string, unknown> = {};
      for (;;) {
        skipSpaces();
        if (peek() === '}') {
          pos++;
          return obj;
        }
        const key = parseKey();
        skipSpaces();
        if (peek() !== '=') throw new TomlError('expected "="');
        pos++;
        skipSpaces();
        setPath(obj, key, parseValue());
        skipSpaces();
        if (peek() === ',') pos++;
        else if (peek() !== '}') throw new TomlError('expected "," or "}"');
      }
    }
    const raw = /^[^\s,\]}#]+/.exec(text.slice(pos));
    if (raw === null) throw new TomlError('expected a value');
    pos += raw[0].length;
    if (raw[0] === 'true' || raw[0] === 'false') return raw[0] === 'true';
    const num = Number(raw[0].replaceAll('_', ''));
    return Number.isNaN(num) ? raw[0] : num;
  };

  const emit = (path: (string | number)[], value: unknown, at: number) => {
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) entries.push({ path, value, line: at });
      Object.entries(value).forEach(([k, v]) =>
        emit([...path, Array.isArray(value) ? Number(k) : k], v, at),
      );
      return;
    }
    entries.push({ path, value, line: at });
  };

  while (pos < text.length) {
    try {
      skipAll();
      if (pos >= text.length) break;
      const at = line;
      if (peek() === '[') {
        const isArray = peek(1) === '[';
        pos += isArray ? 2 : 1;
        skipSpaces();
        const key = parseKey();
        if (!text.startsWith(isArray ? ']]' : ']', pos)) throw new TomlError('expected "]"');
        pos += isArray ? 2 : 1;
        if (isArray) {
          const id = JSON.stringify(key);
          const index = arrayCounts.get(id) ?? 0;
          arrayCounts.set(id, index + 1);
          table = [...key, index];
        } else {
          table = key;
        }
      } else {
        const key = parseKey();
        skipSpaces();
        if (peek() !== '=') throw new TomlError('expected "="');
        pos++;
        skipSpaces();
        emit([...table, ...key], parseValue(), at);
      }
      expectLineEnd();
    } catch (error) {
      if (!(error instanceof TomlError)) throw error;
      errors.push({ line, message: error.message });
      while (pos < text.length && peek() !== '\n') pos++;
    }
  }
  return { entries, errors };
}

function setPath(obj: Record<string, unknown>, key: string[], value: unknown): void {
  let node = obj;
  key.slice(0, -1).forEach((part) => {
    const next = node[part];
    node = (typeof next === 'object' && next !== null ? next : (node[part] = {})) as Record<
      string,
      unknown
    >;
  });
  node[key[key.length - 1] ?? ''] = value;
}
