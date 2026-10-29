// Reads the YAML frontmatter block (between leading `---` lines) of agent,
// skill and command files as indented `key: value` lines. That is enough to
// find keys like `hooks:` and the commands nested under them, without a YAML
// parser.

export interface FrontmatterLine {
  readonly key: string;
  readonly value: string;
  readonly indent: number;
  /** 1-based line in the whole file. */
  readonly line: number;
}

export function frontmatterLines(text: string): FrontmatterLine[] {
  const rows = text.replace(/^\u{feff}/u, '').split('\n');
  if (rows[0]?.trim() !== '---') return [];
  const out: FrontmatterLine[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = (rows[i] ?? '').replace(/\r$/, '');
    if (row.trim() === '---') return out;
    const match = /^(\s*)(?:-\s+)?([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(row);
    if (match === null) continue;
    const value = (match[3] ?? '').replace(/^(["'])(.*)\1$/, '$2');
    out.push({ key: match[2] ?? '', value, indent: (match[1] ?? '').length, line: i + 1 });
  }
  return []; // no closing delimiter: not frontmatter
}
