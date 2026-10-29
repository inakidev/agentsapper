import { isObject, isString } from '../../parsers/jsonc.js';
import type { Finding, Rule, ScanContext } from '../../types.js';
import { clip } from '../util.js';
import {
  at,
  filesMatching,
  firesAutomatically,
  hookCommands,
  lineOf,
  readJsonc,
  readToml,
} from './common.js';

// Hook and command files of agents other than Claude Code, verified against:
// Cursor https://cursor.com/docs/agent/hooks (.cursor/hooks.json, run in trusted workspaces)
//   and https://cursor.com/docs/cloud-agent/setup (.cursor/environment.json, cloud VM)
// Gemini CLI https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md
//   and docs/cli/custom-commands.md (.gemini/commands/*.toml, !{...} shell injection)
// Codex https://learn.chatgpt.com/docs/hooks (.codex/hooks.json, [hooks] in .codex/config.toml)
// Copilot https://docs.github.com/en/copilot/reference/hooks-reference (.github/hooks/*.json,
//   inline hooks in .github/copilot/settings.json; CLI and cloud agent)

const HOOK_FILES: readonly { pattern: RegExp; tool: string }[] = [
  { pattern: /(^|\/)\.cursor\/hooks\.json$/, tool: 'Cursor' },
  { pattern: /(^|\/)\.gemini\/settings\.json$/, tool: 'Gemini CLI' },
  { pattern: /(^|\/)\.codex\/hooks\.json$/, tool: 'Codex' },
  { pattern: /(^|\/)\.github\/hooks\/[^/]+\.json$/, tool: 'GitHub Copilot' },
  { pattern: /(^|\/)\.github\/copilot\/settings(\.local)?\.json$/, tool: 'GitHub Copilot' },
];

const CURSOR_ENV = /(^|\/)\.cursor\/environment\.json$/;
const GEMINI_COMMANDS = /(^|\/)\.gemini\/commands\/.+\.toml$/;
const CODEX_CONFIG = /(^|\/)\.codex\/config\.toml$/;

function hookFinding(
  file: string,
  tool: string,
  event: string,
  command: string,
  kind: string,
  line: number | undefined,
): Finding {
  const auto = firesAutomatically(event);
  return {
    ruleId: 'AGENT-003',
    severity: auto ? 'critical' : 'high',
    file,
    ...(line === undefined ? {} : { line }),
    evidence: clip(`${event}: ${command}`),
    message:
      kind === 'http'
        ? `A ${tool} ${event} hook sends hook payloads to this URL.`
        : auto
          ? `${tool} runs this command on ${event}, as soon as a session starts or the workspace opens.`
          : `${tool} runs this command on every ${event} event, outside its approval prompts.`,
    remediation: `Remove the ${event} hook from ${file} before opening this repo with ${tool}.`,
  };
}

function cursorEnvironment(ctx: ScanContext, file: string): Finding[] {
  const json = readJsonc(ctx, file);
  if (json === undefined || !isObject(json.value)) return [];
  const commands: { key: (string | number)[]; command: string }[] = [];
  for (const key of ['install', 'start']) {
    const value = at(json, key);
    if (isString(value) && value.trim() !== '') commands.push({ key: [key], command: value });
  }
  const terminals = at(json, 'terminals');
  if (Array.isArray(terminals)) {
    terminals.forEach((t, i) => {
      if (isObject(t) && isString(t.command))
        commands.push({ key: ['terminals', i, 'command'], command: t.command });
    });
  }
  return commands.map(({ key, command }) => {
    const line = lineOf(json, ...key);
    return {
      ruleId: 'AGENT-003',
      severity: 'medium',
      file,
      ...(line === undefined ? {} : { line }),
      evidence: clip(`${key.join('.')}: ${command}`),
      message:
        'Cursor cloud agents run this command in their VM, which holds your repository access and any configured secrets.',
      remediation: `Review ${file} before enabling Cursor cloud agents on this repo.`,
    };
  });
}

function geminiCommands(ctx: ScanContext, file: string): Finding[] {
  const prompt = readToml(ctx, file)?.entries.find((e) => e.path.join('.') === 'prompt');
  if (prompt === undefined || !isString(prompt.value) || !prompt.value.includes('!{')) return [];
  const shell = /!\{([^}]*)\}/.exec(prompt.value)?.[1] ?? '';
  return [
    {
      ruleId: 'AGENT-003',
      severity: 'medium',
      file,
      line: prompt.line,
      evidence: clip(`!{${shell}}`),
      message:
        'This Gemini CLI custom command runs a shell command when invoked (Gemini asks for confirmation first).',
      remediation: `Read ${file} before running that command in Gemini CLI.`,
    },
  ];
}

function codexConfigHooks(ctx: ScanContext, file: string): Finding[] {
  const toml = readToml(ctx, file);
  if (toml === undefined) return [];
  return toml.entries.flatMap((entry) => {
    const [root, event] = entry.path;
    const field = entry.path[entry.path.length - 1];
    if (
      root !== 'hooks' ||
      typeof event !== 'string' ||
      field !== 'command' ||
      !isString(entry.value)
    )
      return [];
    return [hookFinding(file, 'Codex', event, entry.value, 'command', entry.line)];
  });
}

export const AGENT_003: Rule = {
  id: 'AGENT-003',
  title: 'Cursor, Gemini CLI, Codex or Copilot config runs commands',
  severity: 'high',
  status: 'stable',
  references: [
    'https://cursor.com/docs/agent/hooks',
    'https://cursor.com/docs/cloud-agent/setup',
    'https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md',
    'https://learn.chatgpt.com/docs/hooks',
    'https://docs.github.com/en/copilot/reference/hooks-reference',
  ],
  run(ctx) {
    return [
      ...HOOK_FILES.flatMap(({ pattern, tool }) =>
        filesMatching(ctx, pattern).flatMap((file) => {
          const json = readJsonc(ctx, file);
          if (json === undefined) return [];
          return hookCommands(json, 'hooks').map((h) =>
            hookFinding(file, tool, h.event, h.command, h.kind, h.line),
          );
        }),
      ),
      ...filesMatching(ctx, CODEX_CONFIG).flatMap((file) => codexConfigHooks(ctx, file)),
      ...filesMatching(ctx, CURSOR_ENV).flatMap((file) => cursorEnvironment(ctx, file)),
      ...filesMatching(ctx, GEMINI_COMMANDS).flatMap((file) => geminiCommands(ctx, file)),
    ];
  },
};
