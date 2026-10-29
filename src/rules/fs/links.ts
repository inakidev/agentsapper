import { homedir } from 'node:os';
import { absPath, baseName, parentOf, relInside, resolveLinkTarget } from '../../paths.js';
import type { Finding, ScanContext } from '../../types.js';
import type { Entry } from '../../walker.js';
import { clip } from '../util.js';

// Each symlink gets one finding, from the most severe rule that applies:
// FS-002 (sensitive target) over FS-001 (outside the repo) over FS-003 (agent config location).

export const FS_REFS = [
  'https://adversa.ai/blog/top-ai-coding-agent-security-resources-august-2026/',
  'https://cwe.mitre.org/data/definitions/61.html',
] as const;

export function linkFinding(
  link: LinkInfo,
  ruleId: string,
  severity: Finding['severity'],
  message: string,
): Finding {
  // FS-003 is about the location itself, so its message already says this.
  const where =
    link.inAgentConfig && ruleId !== 'FS-003'
      ? ' It sits where agents and IDEs load config or instructions, so they read it without asking.'
      : '';
  return {
    ruleId,
    severity,
    file: link.entry.path,
    evidence: clip(`${link.entry.path} -> ${link.target}`),
    message: message + where,
    remediation: `Delete the symlink ${link.entry.path} or replace it with a regular file before opening the repo with an agent.`,
  };
}

// Symlinks are resolved as paths only: each hop's target is computed from the
// link text the walker recorded, never by asking the OS to follow it.

export type LinkClass =
  | { readonly kind: 'sensitive'; readonly dest: string }
  | { readonly kind: 'outside'; readonly dest: string }
  /** Ends inside the repo (possibly at a missing path). */
  | { readonly kind: 'inside'; readonly dest: string }
  | { readonly kind: 'loop' };

export interface LinkInfo {
  readonly entry: Entry;
  readonly target: string;
  readonly cls: LinkClass;
  /** Inside an agent or IDE config dir, or standing in for an instruction file. */
  readonly inAgentConfig: boolean;
}

/** Directories agents and IDEs load config, rules, commands or tasks from. */
export const AGENT_CONFIG_DIRS = new Set([
  '.claude',
  '.cursor',
  '.vscode',
  '.gemini',
  '.codex',
  '.github',
  '.devcontainer',
  '.idea',
  '.windsurf',
  '.continue',
]);

/** Files agents read as instructions or config wherever they appear. */
export const AGENT_CONFIG_FILES = new Set([
  'CLAUDE.md',
  'CLAUDE.local.md',
  'AGENTS.md',
  'GEMINI.md',
  '.cursorrules',
  '.windsurfrules',
  '.clinerules',
  '.mcp.json',
]);

// Below a home directory: credentials, shell startup files and agent configs.
const HOME_SENSITIVE = [
  '.ssh',
  '.aws',
  '.azure',
  '.config',
  '.gnupg',
  '.kube',
  '.docker',
  '.npmrc',
  '.netrc',
  '.git-credentials',
  '.gitconfig',
  '.pypirc',
  '.bash_history',
  '.zsh_history',
  '.bashrc',
  '.zshrc',
  '.profile',
  '.claude',
  '.claude.json',
  '.codex',
  '.gemini',
  '.cursor',
  'library/keychains',
  'appdata',
];

const SYSTEM_SENSITIVE = [
  /^\/etc(\/|$)/,
  /^\/private\/etc(\/|$)/,
  /^\/root(\/|$)/,
  /^\/proc(\/|$)/,
  /^\/(var\/)?run\/docker\.sock$/,
  /^\/windows\/system32(\/|$)/,
];

const GENERIC_HOME = /^\/(home|users)\/[^/]+(\/(.*))?$/;

function normalize(abs: string): string {
  return abs
    .replaceAll('\\', '/')
    .replace(/^\/\/\?\//, '')
    .replace(/^[a-z]:/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

// Windows keeps the user's temp dir under AppData; links there are merely "outside".
const HOME_EXEMPT = ['appdata/local/temp'];

function underHome(rest: string | undefined): boolean {
  if (rest === undefined || rest === '') return true;
  const matches = (p: string) => rest === p || rest.startsWith(`${p}/`);
  return !HOME_EXEMPT.some(matches) && HOME_SENSITIVE.some(matches);
}

export function isSensitive(abs: string): boolean {
  const path = normalize(abs);
  if (SYSTEM_SENSITIVE.some((re) => re.test(path))) return true;
  const generic = GENERIC_HOME.exec(path);
  if (generic !== null) return underHome(generic[3]);
  const home = normalize(homedir());
  if (path === home || path.startsWith(`${home}/`)) return underHome(path.slice(home.length + 1));
  return false;
}

/** Classifies where a link really leads, resolved hop by hop as the OS would (paths.ts). */
function classify(ctx: ScanContext, linkPath: string, text: string): LinkClass {
  const abs = resolveLinkTarget(ctx, absPath(ctx, parentOf(linkPath)), text);
  if (abs === undefined) return { kind: 'loop' };
  const rel = relInside(ctx, abs);
  // Inside the repo is never "sensitive", even when the repo itself lives under a home dir.
  if (rel !== undefined) return { kind: 'inside', dest: rel };
  return isSensitive(abs) ? { kind: 'sensitive', dest: abs } : { kind: 'outside', dest: abs };
}

function inAgentConfig(path: string): boolean {
  return (
    path.split('/').some((segment) => AGENT_CONFIG_DIRS.has(segment)) ||
    AGENT_CONFIG_FILES.has(baseName(path))
  );
}

export function classifyLinks(ctx: ScanContext): LinkInfo[] {
  return ctx.memo('fs:links', () =>
    ctx.entries.flatMap((entry) => {
      // A .git symlink is a git dir pointer; GIT-007 reports it with that context.
      if (entry.kind !== 'symlink' || baseName(entry.path) === '.git') return [];
      const text = entry.linkTarget ?? '';
      if (text === '') return [];
      return [
        {
          entry,
          target: text,
          cls: classify(ctx, entry.path, text),
          inAgentConfig: inAgentConfig(entry.path),
        },
      ];
    }),
  );
}
