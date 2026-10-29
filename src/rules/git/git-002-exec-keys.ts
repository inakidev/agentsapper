import { configKey, parseGitBool } from '../../parsers/gitconfig.js';
import type { Severity } from '../../severity.js';
import type { Finding, Rule } from '../../types.js';
import { evidenceOf, liveBool, liveEntries, repoConfig, type SourcedEntry } from './config.js';
import { clip, REFS } from './references.js';
import { findRepos } from './repos.js';

// Keys whose value git executes, checked against git-config(1) for git 2.56.
// Handled elsewhere: core.fsmonitor (GIT-001), filter/diff/merge drivers
// (GIT-003), include paths (GIT-005), core.worktree (GIT-007). Not listed
// because git ignores them in repository config: uploadpack.packObjectsHook,
// safe.*, trace2.*.

interface Sink {
  readonly matches: (e: SourcedEntry) => boolean;
  readonly severity: Severity;
  /** What makes git run it, finishing the sentence "git runs this program on ...". */
  readonly trigger: string;
}

const key = (name: string) => (e: SourcedEntry) => configKey(e) === name;
const sub =
  (section: string, ...names: string[]) =>
  (e: SourcedEntry) =>
    e.section === section && e.subsection !== undefined && names.includes(e.name);
const bang = (e: SourcedEntry) => e.value?.trimStart().startsWith('!') === true;

const SINKS: readonly Sink[] = [
  {
    matches: key('diff.external'),
    severity: 'critical',
    trigger: 'git diff, which agents run to inspect changes',
  },
  {
    matches: key('core.pager'),
    severity: 'high',
    trigger: 'any command whose output goes to a terminal, such as git log or git diff',
  },
  {
    matches: (e) =>
      e.section === 'pager' && e.subsection === undefined && parseGitBool(e.value) === undefined,
    severity: 'high',
    trigger: 'that subcommand, when its output goes to a terminal',
  },
  {
    matches: key('core.editor'),
    severity: 'high',
    trigger: 'git commit, git tag and other commands that open an editor',
  },
  { matches: key('sequence.editor'), severity: 'high', trigger: 'git rebase -i' },
  { matches: key('core.sshcommand'), severity: 'high', trigger: 'fetch, push and clone over SSH' },
  { matches: key('core.gitproxy'), severity: 'high', trigger: 'fetch over the git:// protocol' },
  {
    matches: key('core.askpass'),
    severity: 'high',
    trigger: 'any command that has to ask for a password',
  },
  {
    matches: key('core.hookspath'),
    severity: 'high',
    trigger: 'every hook event, taking hooks from that directory instead of .git/hooks',
  },
  {
    matches: key('core.alternaterefscommand'),
    severity: 'high',
    trigger: 'fetch and push in repositories with alternates',
  },
  {
    matches: (e) => e.section === 'credential' && e.name === 'helper',
    severity: 'high',
    trigger: 'fetch, push and clone over HTTPS',
  },
  {
    matches: (e) =>
      e.section === 'gpg' &&
      e.name === 'program' &&
      (e.subsection === undefined || ['openpgp', 'x509', 'ssh'].includes(e.subsection)),
    severity: 'high',
    trigger: 'signing and verifying commits and tags',
  },
  { matches: key('gpg.ssh.defaultkeycommand'), severity: 'high', trigger: 'signing with SSH keys' },
  {
    matches: sub('hook', 'command'),
    severity: 'high',
    trigger: 'the hook events named in hook.<name>.event',
  },
  {
    matches: key('interactive.difffilter'),
    severity: 'high',
    trigger: 'git add -p and other interactive commands',
  },
  {
    matches: sub('remote', 'uploadpack', 'receivepack'),
    severity: 'high',
    trigger: 'fetch and push to that remote',
  },
  {
    matches: (e) =>
      (configKey(e) === 'protocol.ext.allow' || configKey(e) === 'protocol.allow') &&
      ['always', 'user'].includes(e.value?.toLowerCase() ?? ''),
    severity: 'high',
    trigger: 'fetch and clone from ext:: URLs, which name a command to run',
  },
  {
    matches: (e) => sub('submodule', 'update')(e) && bang(e),
    severity: 'high',
    trigger: 'git submodule update',
  },
  {
    matches: key('gc.recentobjectshook'),
    severity: 'high',
    trigger: 'git gc and automatic maintenance',
  },
  { matches: key('imap.tunnel'), severity: 'medium', trigger: 'git imap-send' },
  {
    matches: (e) =>
      e.section === 'alias' && (e.subsection === undefined || e.name === 'command') && bang(e),
    severity: 'medium',
    trigger: 'only when you run that alias (aliases cannot replace built-in commands)',
  },
  { matches: sub('difftool', 'cmd', 'path'), severity: 'medium', trigger: 'git difftool' },
  { matches: sub('mergetool', 'cmd', 'path'), severity: 'medium', trigger: 'git mergetool' },
  {
    matches: sub('trailer', 'cmd', 'command'),
    severity: 'medium',
    trigger: 'git commit --trailer and git interpret-trailers',
  },
  {
    matches: (e) => e.section === 'sendemail' && ['tocmd', 'cccmd', 'headercmd'].includes(e.name),
    severity: 'medium',
    trigger: 'git send-email',
  },
  { matches: sub('man', 'cmd', 'path'), severity: 'low', trigger: 'git help' },
  {
    matches: sub('browser', 'cmd', 'path'),
    severity: 'low',
    trigger: 'git help --web and git instaweb',
  },
  { matches: key('instaweb.httpd'), severity: 'low', trigger: 'git instaweb' },
  { matches: sub('guitool', 'cmd'), severity: 'low', trigger: 'the Tools menu in git gui' },
];

// Helpers git looks up on PATH as git-credential-<name>. Still code, but not from the repo.
const KNOWN_CREDENTIAL_HELPERS = new Set([
  'cache',
  'store',
  'manager',
  'manager-core',
  'osxkeychain',
  'wincred',
  'libsecret',
  'gnome-keyring',
]);

export const GIT_002: Rule = {
  id: 'GIT-002',
  title: 'Git config names a program to execute',
  severity: 'high',
  status: 'stable',
  references: [REFS.gitConfig, REFS.configPoisoning, REFS.gitSpawn],
  run(ctx) {
    const findings: Finding[] = [];
    for (const repo of findRepos(ctx).repos) {
      const config = repoConfig(ctx, repo);
      const showsSignatures = liveBool(config, 'log.showsignature');

      for (const entry of liveEntries(config)) {
        if (entry.value === null || entry.value.trim() === '') continue;
        const sink = SINKS.find((s) => s.matches(entry));
        if (sink === undefined) continue;

        let severity = sink.severity;
        let message = `git runs this program on ${sink.trigger}.`;
        if (
          entry.section === 'credential' &&
          KNOWN_CREDENTIAL_HELPERS.has(entry.value.trim().split(/\s/)[0] ?? '')
        ) {
          severity = 'low';
          message =
            'A standard credential helper from your PATH; it runs when git needs credentials.';
        } else if (entry.section === 'gpg' && showsSignatures) {
          severity = 'critical';
          message = `${message} log.showSignature is on, so plain git log and git show run it too.`;
        }

        findings.push({
          ruleId: 'GIT-002',
          severity,
          file: entry.file,
          line: entry.line,
          evidence: clip(evidenceOf(entry)),
          message,
          remediation: `Remove ${configKey(entry)} from ${entry.file} before running git or an agent here, unless you set it yourself.`,
        });
      }
    }
    return findings;
  },
};
