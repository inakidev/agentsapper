import { foldName } from '../../names.js';
import type { Finding, Rule } from '../../types.js';

// Windows looks for a program started by bare name in the current directory before
// PATH, unless NoDefaultCurrentDirectoryInExePath is set, and Node's child_process
// does the same (checked on Windows 11 with Node 24). Agents and IDE extensions start
// git, node or rg with the repository as working directory, so a git.exe at the root
// of the repository runs instead of the real git. Only the root is checked: that is
// where they run, and it keeps virtualenvs and vendored tools out of the report.

const TOOLS = new Set([
  'git',
  'node',
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'bun',
  'deno',
  'python',
  'python3',
  'py',
  'pip',
  'uv',
  'uvx',
  'rg',
  'bash',
  'sh',
  'pwsh',
  'powershell',
  'gh',
  'code',
  'claude',
  'codex',
  'gemini',
  'cursor',
  'docker',
  'cargo',
  'go',
  'make',
]);

/** What Windows and Node try when a name has no extension (.com, .exe), plus cmd's .bat and .cmd. */
const RUNNABLE = new Set(['exe', 'com', 'bat', 'cmd']);

export const FS_004: Rule = {
  id: 'FS-004',
  title: 'Program at the repository root named like a tool agents run',
  severity: 'high',
  status: 'stable',
  references: [
    'https://learn.microsoft.com/en-us/windows/win32/api/processenv/nf-processenv-needcurrentdirectoryforexepathw',
    'https://cwe.mitre.org/data/definitions/427.html',
  ],
  run(ctx) {
    return ctx.children('').flatMap((entry): Finding[] => {
      if (entry.kind !== 'file' && entry.kind !== 'symlink') return [];
      const name = foldName(entry.path);
      const dot = name.lastIndexOf('.');
      const tool = name.slice(0, dot);
      if (dot <= 0 || !TOOLS.has(tool) || !RUNNABLE.has(name.slice(dot + 1))) return [];
      const git = tool === 'git';
      return [
        {
          ruleId: 'FS-004',
          severity: git ? 'critical' : 'high',
          file: entry.path,
          evidence: entry.path,
          message:
            `On Windows, a tool that starts ${tool} by name in this folder runs this file instead of the real ${tool}.` +
            (git
              ? ' Agents run git status as soon as they open a folder.'
              : ' Agents, IDE extensions and package managers start it on their own.'),
          remediation: `Delete ${entry.path} unless you put it there. Setting NoDefaultCurrentDirectoryInExePath=1 stops Windows from running programs from the current folder.`,
        },
      ];
    });
  },
};
