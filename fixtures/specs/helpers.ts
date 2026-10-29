import { createHash } from 'node:crypto';
import type { FixtureEntry } from '../spec.js';

export const SOURCES = {
  gitSpawn:
    'https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-coding-agent-git-config-rce-20260904-cs/',
  configPoisoning: 'https://about.gitlab.com/blog/deepseek-reasonix-vulnerability-discovered',
  buriedBareRepos:
    'https://github.com/justinsteven/advisories/blob/main/2022_git_buried_bare_repos_and_fsmonitor_various_abuses.md',
  ghostApproval: 'https://adversa.ai/blog/top-ai-coding-agent-security-resources-august-2026/',
  gitConfigDocs: 'https://git-scm.com/docs/git-config',
  githooksDocs: 'https://git-scm.com/docs/githooks',
} as const;

/** The minimum git considers a repository: HEAD, objects/ and refs/, plus a config. */
export function gitDir(path: string, config: string): FixtureEntry[] {
  return [
    { type: 'file', path: `${path}/HEAD`, content: 'ref: refs/heads/main\n' },
    { type: 'file', path: `${path}/config`, content: config },
    { type: 'dir', path: `${path}/objects` },
    { type: 'dir', path: `${path}/refs/heads` },
  ];
}

/**
 * A version 2 git index (gitformat-index) listing `entries`, base64-encoded for a
 * fixture file. Object ids are zero: only paths and modes matter to agentsapper.
 */
export function gitIndex(entries: readonly { path: string; mode: number }[]): string {
  const parts = [Buffer.from('DIRC'), u32(2), u32(entries.length)];
  for (const { path, mode } of [...entries].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const name = Buffer.from(path);
    const fixed = Buffer.alloc(62); // stat data, mode at 24, 20-byte id, flags at 60
    fixed.writeUInt32BE(mode, 24);
    fixed.writeUInt16BE(Math.min(name.length, 0xfff), 60);
    const size = (62 + name.length + 8) & ~7;
    parts.push(fixed, name, Buffer.alloc(size - 62 - name.length));
  }
  const body = Buffer.concat(parts);
  return Buffer.concat([body, createHash('sha1').update(body).digest()]).toString('base64');
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

/** Joins lines with LF and a trailing newline, so line numbers are easy to read off. */
export function lines(...text: string[]): string {
  return `${text.join('\n')}\n`;
}
