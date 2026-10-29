export const REFS = {
  gitSpawn:
    'https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-coding-agent-git-config-rce-20260904-cs/',
  configPoisoning: 'https://about.gitlab.com/blog/deepseek-reasonix-vulnerability-discovered',
  buriedBareRepos:
    'https://github.com/justinsteven/advisories/blob/main/2022_git_buried_bare_repos_and_fsmonitor_various_abuses.md',
  gitConfig: 'https://git-scm.com/docs/git-config',
  gitAttributes: 'https://git-scm.com/docs/gitattributes',
  githooks: 'https://git-scm.com/docs/githooks',
  gitRepositoryLayout: 'https://git-scm.com/docs/gitrepository-layout',
} as const;

/** Keeps evidence short; payloads can be long and the line number points to the rest. */
export function clip(text: string, max = 200): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
