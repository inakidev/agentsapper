import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { FixtureEntry, FixtureSpec } from './spec.js';

// Fixtures only ever exist inside a fresh OS temp dir, never in the working tree.
// Layout: <tmp>/agentsapper-fixture-XXXX/{repo,outside}. Tests scan `repo`.

export interface MaterializedFixture {
  readonly root: string;
  readonly outside: string;
  cleanup(): void;
}

const SAFE_SEGMENT = /^(?!\.{1,2}$)[^/\\:]+$/;

function assertSafePath(path: string): void {
  if (!path.split('/').every((segment) => SAFE_SEGMENT.test(segment))) {
    throw new Error(`unsafe fixture path: ${JSON.stringify(path)}`);
  }
}

export function materialize(spec: FixtureSpec): MaterializedFixture {
  const entries = [...spec.files, ...(spec.outside ?? [])];
  entries.forEach((entry) => assertSafePath(entry.path));

  const base = mkdtempSync(join(tmpdir(), 'agentsapper-fixture-'));
  const root = join(base, 'repo');
  const outside = join(base, 'outside');
  const cleanup = () => rmSync(base, { recursive: true, force: true });

  // Forward slashes work on every platform and survive git config escaping.
  const fill = (text: string) =>
    text
      .replaceAll('{{ROOT}}', root.replaceAll('\\', '/'))
      .replaceAll('{{OUTSIDE}}', outside.replaceAll('\\', '/'));

  try {
    mkdirSync(root);
    mkdirSync(outside);
    spec.files.forEach((entry) => write(root, entry, fill));
    (spec.outside ?? []).forEach((entry) => write(outside, entry, fill));
  } catch (error) {
    cleanup();
    throw error;
  }
  return { root, outside, cleanup };
}

function write(base: string, entry: FixtureEntry, fill: (text: string) => string): void {
  const path = join(base, ...entry.path.split('/'));
  mkdirSync(dirname(path), { recursive: true });
  switch (entry.type) {
    case 'dir':
      mkdirSync(path, { recursive: true });
      break;
    case 'file':
      writeFileSync(
        path,
        entry.encoding === 'base64' ? Buffer.from(entry.content, 'base64') : fill(entry.content),
      );
      if (entry.mode !== undefined) chmodSync(path, entry.mode);
      break;
    case 'symlink':
      createSymlink(fill(entry.target), path, entry.targetType);
      break;
  }
}

function createSymlink(
  target: string,
  path: string,
  targetType: 'file' | 'dir' | 'junction',
): void {
  if (targetType === 'junction') {
    symlinkSync(resolve(dirname(path), target), path, 'junction');
    return;
  }
  try {
    symlinkSync(target, path, targetType);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform !== 'win32' || (code !== 'EPERM' && code !== 'EACCES')) throw error;
    // Without Developer Mode, Windows only allows junctions (directory links).
    if (targetType === 'dir') {
      symlinkSync(resolve(dirname(path), target), path, 'junction');
      return;
    }
    throw new Error(`symlinks are not supported here (enable Windows Developer Mode): ${path}`, {
      cause: error,
    });
  }
}
