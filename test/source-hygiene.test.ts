import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Code in this repo must be plain ASCII. Invisible or bidi characters are what
// INSTR-001 hunts for, and editors (or agents) can silently turn an escape
// sequence into the real character. Fixtures that need such characters must
// spell them as escapes.

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const CODE_DIRS = ['src', 'test', 'fixtures'];
const CODE_FILE = /\.(ts|js|mjs|cjs|json)$/;

function listCodeFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listCodeFiles(path);
    return entry.isFile() && CODE_FILE.test(entry.name) ? [path] : [];
  });
}

function nonAsciiLocations(file: string): string[] {
  const lines = readFileSync(file, 'utf8').split('\n');
  return lines.flatMap((line, index) =>
    /[^\t\r\x20-\x7e]/.test(line) ? [`${relative(repoRoot, file)}:${index + 1}`] : [],
  );
}

describe('source hygiene', () => {
  it('keeps code files pure printable ASCII', () => {
    const files = CODE_DIRS.flatMap((dir) => listCodeFiles(join(repoRoot, dir)));

    expect(files.length).toBeGreaterThan(0);
    expect(files.flatMap(nonAsciiLocations)).toEqual([]);
  });
});
