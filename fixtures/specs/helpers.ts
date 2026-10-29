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

/** Joins lines with LF and a trailing newline, so line numbers are easy to read off. */
export function lines(...text: string[]): string {
  return `${text.join('\n')}\n`;
}
