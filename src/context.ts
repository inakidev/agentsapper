import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { foldName } from './names.js';
import type { ScanContext } from './types.js';
import type { Entry, Limits, WalkResult } from './walker.js';

// O_NOFOLLOW and O_NONBLOCK do not exist on Windows; there the walker's lstat
// is the only guard, which is enough for a static repo on disk.
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

export function createContext(root: string, walked: WalkResult, limits: Limits): ScanContext {
  const byPath = new Map<string, Entry>();
  // Spelled differently but the same file on a case-insensitive filesystem (names.ts).
  // Entries are sorted, so the first spelling wins when a case-sensitive one holds several.
  const byFolded = new Map<string, Entry>();
  const byParent = new Map<string, Entry[]>();
  for (const entry of walked.entries) {
    byPath.set(entry.path, entry);
    const folded = foldName(entry.path);
    if (!byFolded.has(folded)) byFolded.set(folded, entry);
    const slash = entry.path.lastIndexOf('/');
    const parent = slash === -1 ? '' : entry.path.slice(0, slash);
    const siblings = byParent.get(parent);
    if (siblings === undefined) byParent.set(parent, [entry]);
    else siblings.push(entry);
  }

  const lookup = (path: string): Entry | undefined =>
    byPath.get(path) ?? byFolded.get(foldName(path));

  const incomplete = [...walked.incomplete];
  const texts = new Map<string, string | undefined>();
  const memos = new Map<string, unknown>();

  const readBytes = (path: string, maxBytes: number): Uint8Array | undefined => {
    const entry = lookup(path);
    if (entry?.kind !== 'file') return undefined;
    if (entry.size > maxBytes) {
      incomplete.push(`skipped ${entry.path}: larger than ${maxBytes} bytes`);
      return undefined;
    }
    const bytes = readRegularFile(join(root, ...entry.path.split('/')), maxBytes);
    if (bytes === undefined) incomplete.push(`cannot read ${entry.path}`);
    return bytes;
  };

  const readHead = (path: string, bytes: number): Uint8Array | undefined => {
    const entry = lookup(path);
    if (entry?.kind !== 'file') return undefined;
    const head = readRegularFile(join(root, ...entry.path.split('/')), bytes, true);
    if (head === undefined) incomplete.push(`cannot read ${entry.path}`);
    return head;
  };

  const readText = (path: string): string | undefined => {
    const real = lookup(path)?.path ?? path;
    if (texts.has(real)) return texts.get(real);
    const bytes = readBytes(real, limits.maxFileBytes);
    const text = bytes === undefined ? undefined : new TextDecoder('utf-8').decode(bytes);
    texts.set(real, text);
    return text;
  };

  return {
    root,
    entries: walked.entries,
    incomplete,
    entry: lookup,
    children: (path) => byParent.get(path) ?? byParent.get(lookup(path)?.path ?? path) ?? [],
    readText,
    readBytes,
    readHead,
    memo: <T>(key: string, compute: () => T): T => {
      if (!memos.has(key)) memos.set(key, compute());
      return memos.get(key) as T;
    },
  };
}

/** The whole file, or with `head` only its first `maxBytes` bytes. */
function readRegularFile(abs: string, maxBytes: number, head = false): Uint8Array | undefined {
  let fd: number | undefined;
  try {
    fd = openSync(abs, OPEN_FLAGS);
    const stats = fstatSync(fd);
    if (!stats.isFile() || (!head && stats.size > maxBytes)) return undefined;
    const buffer = Buffer.alloc(Math.min(stats.size, maxBytes));
    let offset = 0;
    while (offset < buffer.length) {
      const read = readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (read === 0) break;
      offset += read;
    }
    return buffer.subarray(0, offset);
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
