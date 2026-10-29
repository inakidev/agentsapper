import { isObject } from '../../parsers/jsonc.js';
import type { Finding, Rule, ScanContext } from '../../types.js';
import { clip } from '../util.js';
import { filesMatching, lineOf, readJsonc, readToml } from './common.js';

// Experimental: these key names come from summaries of the official settings
// references, not verbatim text, and the docs do not say whether VS Code honors
// them from workspace settings.
//   VS Code https://code.visualstudio.com/docs/agents/reference/ai-settings
//   Codex   https://learn.chatgpt.com/docs/config-file/config-reference

const VSCODE_SETTINGS = /(^|\/)\.vscode\/settings\.json$/;
const CODEX_CONFIG = /(^|\/)\.codex\/config\.toml$/;

interface Check {
  readonly key: string;
  readonly matches: (value: unknown) => boolean;
  readonly severity: Finding['severity'];
  readonly why: string;
}

const VSCODE_CHECKS: readonly Check[] = [
  {
    key: 'chat.tools.global.autoApprove',
    matches: (v) => v === true,
    severity: 'high',
    why: 'approves every agent tool call without asking',
  },
  {
    key: 'chat.permissions.default',
    matches: (v) => v === 'autoApprove' || v === 'autopilot',
    severity: 'high',
    why: 'starts agent sessions with tool calls approved automatically',
  },
  {
    key: 'chat.tools.terminal.autoApprove',
    matches: (v) =>
      isObject(v) &&
      Object.values(v).some((x) => x === true || (isObject(x) && x.approve === true)),
    severity: 'medium',
    why: 'lets the agent run matching terminal commands without asking',
  },
  {
    key: 'chat.tools.terminal.ignoreDefaultAutoApproveRules',
    matches: (v) => v === true,
    severity: 'medium',
    why: 'drops the built-in rules that keep commands like rm and curl behind a prompt',
  },
];

const CODEX_CHECKS: readonly Check[] = [
  {
    key: 'approval_policy',
    matches: (v) => v === 'never',
    severity: 'high',
    why: 'never asks before running commands',
  },
  {
    key: 'sandbox_mode',
    matches: (v) => v === 'danger-full-access',
    severity: 'high',
    why: 'turns off the sandbox, giving commands full disk and network access',
  },
];

function vscode(ctx: ScanContext, file: string): Finding[] {
  const json = readJsonc(ctx, file);
  if (json === undefined || !isObject(json.value)) return [];
  const settings = json.value;
  return VSCODE_CHECKS.flatMap((check) => {
    if (!(check.key in settings) || !check.matches(settings[check.key])) return [];
    const line = lineOf(json, check.key);
    return [
      finding(
        file,
        line,
        `${check.key}: ${JSON.stringify(settings[check.key])}`,
        check,
        'VS Code Copilot agent',
      ),
    ];
  });
}

function codex(ctx: ScanContext, file: string): Finding[] {
  const toml = readToml(ctx, file);
  if (toml === undefined) return [];
  return CODEX_CHECKS.flatMap((check) => {
    const entry = toml.entries.find((e) => e.path.length === 1 && e.path[0] === check.key);
    if (entry === undefined || !check.matches(entry.value)) return [];
    return [
      finding(
        file,
        entry.line,
        `${check.key} = ${JSON.stringify(entry.value)}`,
        check,
        'Codex, in a trusted project,',
      ),
    ];
  });
}

function finding(
  file: string,
  line: number | undefined,
  evidence: string,
  check: Check,
  tool: string,
): Finding {
  return {
    ruleId: 'AGENT-004',
    severity: check.severity,
    file,
    ...(line === undefined ? {} : { line }),
    evidence: clip(evidence),
    message: `With this setting ${tool} ${check.why}. Instructions planted in the repo then run unchecked.`,
    remediation: `Remove ${check.key} from ${file}; set approval preferences in your user settings instead.`,
  };
}

export const AGENT_004: Rule = {
  id: 'AGENT-004',
  title: 'Workspace settings auto-approve agent actions',
  severity: 'high',
  status: 'experimental',
  references: [
    'https://code.visualstudio.com/docs/agents/reference/ai-settings',
    'https://learn.chatgpt.com/docs/config-file/config-reference',
  ],
  run(ctx) {
    return [
      ...filesMatching(ctx, VSCODE_SETTINGS).flatMap((file) => vscode(ctx, file)),
      ...filesMatching(ctx, CODEX_CONFIG).flatMap((file) => codex(ctx, file)),
    ];
  },
};
