import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Creates a fresh, empty directory under the OS temp dir. */
export function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'agentsapper-test-'));
}

export function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
