// JSON with comments and trailing commas (the dialect of VS Code, devcontainer
// and most agent config files). Besides the value, it records the line each
// value starts on, keyed by JSON Pointer (RFC 6901), so findings can point at it.

export interface JsoncResult {
  /** undefined when the text does not parse. */
  readonly value: unknown;
  /** JSON Pointer (e.g. `/hooks/SessionStart/0`) to 1-based line. Root is `''`. */
  readonly lines: ReadonlyMap<string, number>;
  readonly error?: { readonly line: number; readonly message: string };
}

class JsoncError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
  }
}

export function pointer(...segments: (string | number)[]): string {
  return segments.map((s) => `/${String(s).replaceAll('~', '~0').replaceAll('/', '~1')}`).join('');
}

export function parseJsonc(input: string): JsoncResult {
  const text = input.startsWith('\u{feff}') ? input.slice(1) : input;
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text.charAt(i) === '\n') lineStarts.push(i + 1);
  const lineAt = (offset: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  const lines = new Map<string, number>();
  let pos = 0;

  const fail = (message: string): never => {
    throw new JsoncError(message, pos);
  };

  const skip = () => {
    for (;;) {
      const c = text.charAt(pos);
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') pos++;
      else if (text.startsWith('//', pos)) {
        const end = text.indexOf('\n', pos);
        pos = end === -1 ? text.length : end;
      } else if (text.startsWith('/*', pos)) {
        const end = text.indexOf('*/', pos + 2);
        if (end === -1) fail('unterminated comment');
        pos = end + 2;
      } else return;
    }
  };

  const parseString = (): string => {
    pos++; // opening quote
    let out = '';
    for (;;) {
      if (pos >= text.length) fail('unterminated string');
      const c = text.charAt(pos++);
      if (c === '"') return out;
      if (c === '\n') fail('newline in string');
      if (c !== '\\') {
        out += c;
        continue;
      }
      const e = text.charAt(pos++);
      const simple: Record<string, string> = {
        '"': '"',
        '\\': '\\',
        '/': '/',
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
      };
      if (e in simple) out += simple[e];
      else if (e === 'u') {
        const hex = text.slice(pos, pos + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('invalid unicode escape');
        out += String.fromCharCode(Number.parseInt(hex, 16));
        pos += 4;
      } else fail('invalid escape');
    }
  };

  const parseValue = (path: string): unknown => {
    skip();
    lines.set(path, lineAt(pos));
    const c = text.charAt(pos);
    if (c === '{') {
      pos++;
      const obj: Record<string, unknown> = {};
      for (;;) {
        skip();
        if (text.charAt(pos) === '}') {
          pos++;
          return obj;
        }
        if (text.charAt(pos) !== '"') fail('expected a property name');
        const key = parseString();
        skip();
        if (text.charAt(pos) !== ':') fail('expected ":"');
        pos++;
        obj[key] = parseValue(`${path}${pointer(key)}`);
        skip();
        if (text.charAt(pos) === ',') pos++;
        else if (text.charAt(pos) !== '}') fail('expected "," or "}"');
      }
    }
    if (c === '[') {
      pos++;
      const arr: unknown[] = [];
      for (;;) {
        skip();
        if (text.charAt(pos) === ']') {
          pos++;
          return arr;
        }
        arr.push(parseValue(`${path}${pointer(arr.length)}`));
        skip();
        if (text.charAt(pos) === ',') pos++;
        else if (text.charAt(pos) !== ']') fail('expected "," or "]"');
      }
    }
    if (c === '"') return parseString();
    const literal = /^(true|false|null|-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?)/.exec(
      text.slice(pos),
    );
    if (literal === null) return fail('unexpected token');
    pos += literal[0].length;
    return JSON.parse(literal[0]) as unknown;
  };

  try {
    const value = parseValue('');
    skip();
    if (pos < text.length) fail('unexpected content after the value');
    return { value, lines };
  } catch (error) {
    if (!(error instanceof JsoncError)) throw error;
    return {
      value: undefined,
      lines,
      error: { line: lineAt(error.offset), message: error.message },
    };
  }
}

/** Narrowing helpers for walking parsed config. */
export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const isString = (v: unknown): v is string => typeof v === 'string';
