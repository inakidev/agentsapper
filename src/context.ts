import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';
import type { ScanContext } from './types.js';
import type { Entry, Limits, WalkResult } from './walker.js';

// O_NOFOLLOW and O_NONBLOCK do not exist on Windows; there the walker's lstat
// is the only guard, which is enough for a static repo on disk.
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

export function createContext(root: string, walked: WalkResult, limits: Limits): ScanContext {
  const byPath = new Map<string, Entry>();
  const byParent = new Map<string, Entry[]>();
  for (const entry of walked.entries) {
    byPath.set(entry.path, entry);
    const slash = entry.path.lastIndexOf('/');
    const parent = slash === -1 ? '' : entry.path.slice(0, slash);
    const siblings = byParent.get(parent);
    if (siblings === undefined) byParent.set(parent, [entry]);
    else siblings.push(entry);
  }

  const incomplete = [...walked.incomplete];
  const texts = new Map<string, string | undefined>();
  const memos = new Map<string, unknown>();

  const readText = (path: string): string | undefined => {
    if (texts.has(path)) return texts.get(path);
    const entry = byPath.get(path);
    let text: string | undefined;
    if (entry?.kind === 'file') {
      if (entry.size > limits.maxFileBytes) {
        incomplete.push(`skipped ${path}: larger than ${limits.maxFileBytes} bytes`);
      } else {
        text = readRegularFile(join(root, ...path.split('/')), limits.maxFileBytes);
        if (text === undefined) incomplete.push(`cannot read ${path}`);
      }
    }
    texts.set(path, text);
    return text;
  };

  return {
    root,
    entries: walked.entries,
    incomplete,
    entry: (path) => byPath.get(path),
    children: (path) => byParent.get(path) ?? [],
    readText,
    memo: <T>(key: string, compute: () => T): T => {
      if (!memos.has(key)) memos.set(key, compute());
      return memos.get(key) as T;
    },
  };
}

function readRegularFile(abs: string, maxBytes: number): string | undefined {
  let fd: number | undefined;
  try {
    fd = openSync(abs, OPEN_FLAGS);
    const stats = fstatSync(fd);
    if (!stats.isFile() || stats.size > maxBytes) return undefined;
    const buffer = Buffer.alloc(stats.size);
    let offset = 0;
    while (offset < buffer.length) {
      const read = readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (read === 0) break;
      offset += read;
    }
    return new TextDecoder('utf-8').decode(buffer.subarray(0, offset));
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
