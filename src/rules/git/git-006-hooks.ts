import { configKey } from '../../parsers/gitconfig.js';
import { baseName, locate } from '../../paths.js';
import type { Finding, Rule, ScanContext } from '../../types.js';
import type { Entry } from '../../walker.js';
import { liveEntries, repoConfig } from './config.js';
import { REFS } from './references.js';
import { findRepos } from './repos.js';

const RECEIVE = 'pushes received by this repository';

// Hook names from githooks(5), git 2.56, with what triggers them.
const HOOKS: Readonly<Record<string, string>> = {
  'applypatch-msg': 'git am',
  'pre-applypatch': 'git am',
  'post-applypatch': 'git am',
  'pre-commit': 'git commit',
  'pre-merge-commit': 'git merge',
  'prepare-commit-msg': 'git commit',
  'commit-msg': 'git commit and git merge',
  'post-commit': 'git commit',
  'pre-rebase': 'git rebase',
  'post-checkout': 'git checkout, git switch, git clone and git worktree add',
  'post-merge': 'git merge and git pull',
  'pre-push': 'git push',
  'pre-receive': RECEIVE,
  update: RECEIVE,
  'proc-receive': RECEIVE,
  'post-receive': RECEIVE,
  'post-update': RECEIVE,
  'push-to-checkout': RECEIVE,
  'reference-transaction': 'any command that updates refs, including fetch, commit and checkout',
  'pre-auto-gc': 'git gc --auto',
  'post-rewrite': 'git commit --amend and git rebase',
  'sendemail-validate': 'git send-email',
  'fsmonitor-watchman': 'git status and other index refreshes, when core.fsmonitor points to it',
  'p4-changelist': 'git p4 submit',
  'p4-prepare-changelist': 'git p4 submit',
  'p4-post-changelist': 'git p4 submit',
  'p4-pre-submit': 'git p4 submit',
  'post-index-change': 'any command that writes the index',
};

export const GIT_006: Rule = {
  id: 'GIT-006',
  title: 'Live git hook',
  severity: 'high',
  status: 'stable',
  references: [REFS.githooks, REFS.buriedBareRepos],
  run(ctx) {
    const findings: Finding[] = [];
    const seen = new Set<string>();
    const report = (dir: string) => {
      for (const entry of ctx.children(dir)) {
        const name = baseName(entry.path);
        const trigger = HOOKS[name];
        if (trigger === undefined || seen.has(entry.path)) continue;
        seen.add(entry.path);
        const finding = hookFinding(ctx, entry, name, trigger);
        if (finding !== undefined) findings.push(finding);
      }
    };

    for (const repo of findRepos(ctx).repos) {
      report(`${repo.gitDir}/hooks`);
      for (const entry of liveEntries(repoConfig(ctx, repo))) {
        if (configKey(entry) !== 'core.hookspath' || !entry.value) continue;
        // Relative hook paths are taken from where hooks run: the working tree, or the git dir if bare.
        const where = locate(ctx, repo.workTree ?? repo.gitDir, entry.value);
        if (where.kind === 'inside' && ctx.entry(where.path)?.kind === 'dir') report(where.path);
      }
    }
    return findings;
  },
};

function hookFinding(
  ctx: ScanContext,
  entry: Entry,
  name: string,
  trigger: string,
): Finding | undefined {
  const base = {
    ruleId: 'GIT-006',
    file: entry.path,
    remediation: `Delete ${entry.path} before running git here, unless you installed it.`,
  };
  if (entry.kind === 'symlink') {
    return {
      ...base,
      severity: 'high',
      evidence: `${name} -> ${entry.linkTarget ?? ''}`,
      message: `This ${name} hook is a symlink; git runs whatever it points to on ${trigger}.`,
    };
  }
  if (entry.kind !== 'file') return undefined;

  const firstLine = (ctx.readText(entry.path) ?? '').split('\n')[0] ?? '';
  // Git for Windows runs hooks with a shebang regardless of permissions.
  const live = (entry.mode & 0o111) !== 0 || firstLine.startsWith('#!');
  return {
    ...base,
    severity: live ? 'high' : 'medium',
    evidence: firstLine.slice(0, 120),
    message: live
      ? `git runs this ${name} hook on ${trigger}.`
      : `This ${name} hook has no exec bit or shebang, so git probably skips it, but a chmod makes it run on ${trigger}.`,
  };
}
