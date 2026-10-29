import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// The ban on starting processes from src/ is a security property, so we test
// that the lint config actually enforces it instead of trusting it by eye.

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

const GUARD_RULES = new Set([
  '@typescript-eslint/no-restricted-imports',
  'no-restricted-syntax',
  'no-restricted-properties',
]);

async function guardViolations(code: string, file: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(repoRoot, file) });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId !== null && GUARD_RULES.has(m.ruleId))
    .map((m) => m.ruleId ?? '');
}

const FORBIDDEN: [string, string][] = [
  ['static import', "import { spawn } from 'node:child_process';\nspawn('x');\n"],
  ['bare module name', "import cp from 'child_process';\ncp.fork('x');\n"],
  ['cluster', "import cluster from 'node:cluster';\ncluster.fork();\n"],
  ['re-export', "export { execFile } from 'child_process';\n"],
  ['dynamic import', "await import('node:child_process');\n"],
  ['computed dynamic import', "const name = 'child_' + 'process';\nawait import(name);\n"],
  [
    'createRequire',
    "import { createRequire } from 'node:module';\ncreateRequire(import.meta.url);\n",
  ],
  ['require call', "require('child_process');\n"],
  ['process.binding', "process.binding('spawn_sync');\n"],
  ['writing a file', "import { writeFileSync } from 'node:fs';\nwriteFileSync('x', 'y');\n"],
  ['creating a directory', "import { mkdirSync } from 'fs';\nmkdirSync('x');\n"],
  ['fs/promises', "import { rm } from 'node:fs/promises';\nawait rm('x');\n"],
  ['a namespace fs import', "import * as fs from 'node:fs';\nfs.unlinkSync('x');\n"],
  ['a default fs import', "import fs from 'node:fs';\nfs.renameSync('a', 'b');\n"],
  ['a dynamic fs import', "const fs = await import('node:fs');\nfs.rmSync('x');\n"],
];

describe('lint guard: no external processes and no writes from src/', () => {
  it.each(FORBIDDEN)('rejects %s under src/', async (_label, code) => {
    expect(await guardViolations(code, 'src/__lint_probe__.ts')).not.toEqual([]);
  });

  it('allows ordinary node: imports under src/', async () => {
    const code = "import { lstatSync } from 'node:fs';\nlstatSync('.');\n";

    expect(await guardViolations(code, 'src/__lint_probe__.ts')).toEqual([]);
  });

  it('does not apply outside src/ (tests may spawn the built CLI)', async () => {
    const code = "import { spawn } from 'node:child_process';\nspawn('x');\n";

    expect(await guardViolations(code, 'test/__lint_probe__.ts')).toEqual([]);
  });
});
