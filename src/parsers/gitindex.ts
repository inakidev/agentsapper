// git's index (Documentation/gitformat-index.txt, versions 2 to 4): the paths git
// tracks and their modes. Only path and mode are read; the file is untrusted, so any
// inconsistency ends the parse.

export interface IndexEntry {
  readonly path: string;
  readonly mode: number;
}

const SIGNATURE = 0x44495243; // "DIRC"
const EXTENDED = 0x4000;
const SYMLINK = 0o120000;

export function isSymlinkMode(mode: number): boolean {
  return (mode & 0o170000) === SYMLINK;
}

/** Entries in order, or undefined when `data` is not a well-formed index. */
export function parseGitIndex(data: Uint8Array, hashBytes = 20): IndexEntry[] | undefined {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 12 || view.getUint32(0) !== SIGNATURE) return undefined;
  const version = view.getUint32(4);
  if (version < 2 || version > 4) return undefined;
  const count = view.getUint32(8);

  const decoder = new TextDecoder('utf-8');
  const fixed = 40 + hashBytes + 2; // stat data and mode, object id, flags
  const entries: IndexEntry[] = [];
  let offset = 12;
  let previous = '';
  for (let i = 0; i < count; i++) {
    if (offset + fixed > data.length) return undefined;
    const mode = view.getUint32(offset + 24);
    const flags = view.getUint16(offset + 40 + hashBytes);
    let cursor = offset + fixed;
    if (version >= 3 && (flags & EXTENDED) !== 0) cursor += 2;

    let path: string;
    if (version === 4) {
      // The path is the previous one minus `strip` bytes, plus a NUL-terminated suffix.
      let strip = 0;
      let byte: number;
      let first = true;
      do {
        byte = data[cursor++] ?? 0;
        strip = first ? byte & 127 : (strip + 1) * 128 + (byte & 127);
        first = false;
      } while ((byte & 128) !== 0 && cursor < data.length);
      const kept = Buffer.from(previous);
      if (strip > kept.length) return undefined;
      const end = data.indexOf(0, cursor);
      if (end === -1) return undefined;
      path = decoder.decode(
        Buffer.concat([kept.subarray(0, kept.length - strip), data.subarray(cursor, end)]),
      );
      cursor = end + 1;
    } else {
      const end = data.indexOf(0, cursor);
      if (end === -1) return undefined;
      path = decoder.decode(data.subarray(cursor, end));
      // Entries are NUL-padded to a multiple of 8 bytes.
      cursor = offset + ((cursor - offset + (end - cursor) + 8) & ~7);
    }
    entries.push({ path, mode });
    previous = path;
    offset = cursor;
  }
  return entries;
}
