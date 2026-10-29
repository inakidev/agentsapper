import { frontmatterLines } from '../../parsers/frontmatter.js';
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
} from './common.js';

// Verified against https://code.claude.com/docs/en/settings, /hooks, /permissions,
// /mcp and /claude-directory (October 2026). Per the permissions page, hooks,
// env and helper commands in project settings are used even before the
// workspace trust prompt; permission rules and MCP approvals wait for trust.

const SETTINGS = /(^|\/)\.claude\/settings(\.local)?\.json$/;
const FRONTMATTER_FILES =
  /(^|\/)\.claude\/(agents\/.+\.md|commands\/.+\.md|skills\/.+\/SKILL\.md)$/;

/** Settings keys whose value is a command Claude Code runs. */
const COMMAND_KEYS = [
  'apiKeyHelper',
  'statusLine',
  'fileSuggestion',
  'awsAuthRefresh',
  'awsCredentialExport',
  'gcpAuthRefresh',
  'otelHeadersHelper',
];

/** Rules that allow a whole tool, or a shell entry point that runs anything. */
const WIDE_RULE =
  /^(Bash|PowerShell|WebFetch|Read|Edit|Write|MultiEdit|NotebookEdit)(\(\*\))?$|^Bash\((sh|bash|zsh|python3?|node|npx|curl|wget|eval|sudo|env|xargs|perl|ruby)( |:)?\*?\)$|^mcp__[^_]+(__\*)?$/;

/** Variables that redirect API traffic or run code in every subprocess. */
const DANGEROUS_ENV =
  /^(ANTHROPIC_BASE_URL|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY|CLAUDE_CODE_USE_(BEDROCK|VERTEX|FOUNDRY)|CLAUDE_CONFIG_DIR|HTTPS?_PROXY|ALL_PROXY|NODE_OPTIONS|NODE_TLS_REJECT_UNAUTHORIZED|LD_PRELOAD|DYLD_INSERT_LIBRARIES|BASH_ENV|ENV|PROMPT_COMMAND|PYTHONSTARTUP|PERL5OPT|GIT_SSH_COMMAND|GIT_EXTERNAL_DIFF|GIT_PAGER|GIT_EDITOR|GIT_ASKPASS|GIT_CONFIG_(GLOBAL|SYSTEM)|GIT_DIR)$/i;

export const AGENT_001: Rule = {
  id: 'AGENT-001',
  title: 'Claude Code project settings run commands or widen permissions',
  severity: 'critical',
  status: 'stable',
  references: [
    'https://code.claude.com/docs/en/settings',
    'https://code.claude.com/docs/en/hooks',
    'https://code.claude.com/docs/en/permissions',
    'https://code.claude.com/docs/en/claude-directory',
  ],
  run(ctx) {
    return [
      ...filesMatching(ctx, SETTINGS).flatMap((file) => settingsFindings(ctx, file)),
      ...filesMatching(ctx, FRONTMATTER_FILES).flatMap((file) => frontmatterFindings(ctx, file)),
    ];
  },
};

function settingsFindings(ctx: ScanContext, file: string): Finding[] {
  const json = readJsonc(ctx, file);
  if (json === undefined || !isObject(json.value)) return [];
  const findings: Finding[] = [];
  const add = (
    severity: Finding['severity'],
    line: number | undefined,
    evidence: string,
    message: string,
    remediation: string,
  ) =>
    findings.push({
      ruleId: 'AGENT-001',
      severity,
      file,
      ...(line === undefined ? {} : { line }),
      evidence: clip(evidence),
      message,
      remediation,
    });
  const removeKey = (key: string) =>
    `Remove ${key} from ${file} before opening this repo with Claude Code.`;

  for (const hook of hookCommands(json, 'hooks')) {
    const auto = firesAutomatically(hook.event);
    add(
      auto ? 'critical' : 'high',
      hook.line,
      `hooks.${hook.event}: ${hook.command}`,
      hook.kind === 'http'
        ? `A ${hook.event} hook sends hook payloads (prompts, tool inputs, file paths) to this URL.`
        : auto
          ? `Claude Code runs this command on ${hook.event}, as soon as a session starts and before any approval prompt.`
          : `Claude Code runs this command on every ${hook.event} event, outside the tool permission prompts.`,
      removeKey(`the ${hook.event} hook`),
    );
  }

  for (const key of COMMAND_KEYS) {
    const value = at(json, key);
    const command = isString(value)
      ? value
      : isObject(value) && isString(value.command)
        ? value.command
        : undefined;
    if (command === undefined || command.trim() === '') continue;
    add(
      'high',
      lineOf(json, key),
      `${key}: ${command}`,
      `Claude Code runs this ${key} command on its own, without asking.`,
      removeKey(key),
    );
  }

  const allow = at(json, 'permissions', 'allow');
  if (Array.isArray(allow)) {
    allow.forEach((rule, i) => {
      if (!isString(rule) || !WIDE_RULE.test(rule.trim())) return;
      add(
        'high',
        lineOf(json, 'permissions', 'allow', i),
        `permissions.allow: ${rule}`,
        `Allows ${rule} without asking once you trust this folder, so instructions planted in the repo can run it silently.`,
        removeKey(`the "${rule}" allow rule`),
      );
    });
  }

  const mode = at(json, 'permissions', 'defaultMode');
  if (mode === 'bypassPermissions' || mode === 'acceptEdits' || mode === 'auto') {
    add(
      mode === 'bypassPermissions' ? 'high' : 'medium',
      lineOf(json, 'permissions', 'defaultMode'),
      `permissions.defaultMode: ${mode}`,
      mode === 'bypassPermissions'
        ? 'Turns off permission prompts. Current Claude Code ignores this from project settings, but versions before 2.1.257 honored it.'
        : `Starts sessions in ${mode} mode, which approves some actions without asking.`,
      removeKey('permissions.defaultMode'),
    );
  }

  const dirs = at(json, 'permissions', 'additionalDirectories');
  if (Array.isArray(dirs) && dirs.length > 0) {
    add(
      'medium',
      lineOf(json, 'permissions', 'additionalDirectories'),
      `permissions.additionalDirectories: ${dirs.filter(isString).join(', ')}`,
      'Gives Claude Code access to directories outside this repository once trusted.',
      removeKey('permissions.additionalDirectories'),
    );
  }

  const env = at(json, 'env');
  if (isObject(env)) {
    for (const [name, value] of Object.entries(env)) {
      if (!DANGEROUS_ENV.test(name)) continue;
      add(
        'high',
        lineOf(json, 'env', name),
        `env.${name} = ${String(value)}`,
        `Sets ${name} for Claude Code and every command it runs, which can redirect API traffic (prompts and code) or inject code into subprocesses.`,
        removeKey(`env.${name}`),
      );
    }
  }

  if (at(json, 'enableAllProjectMcpServers') === true) {
    add(
      'high',
      lineOf(json, 'enableAllProjectMcpServers'),
      'enableAllProjectMcpServers: true',
      'Approves every MCP server in .mcp.json without a prompt once the folder is trusted (see AGENT-002).',
      removeKey('enableAllProjectMcpServers'),
    );
  }
  const enabledServers = at(json, 'enabledMcpjsonServers');
  if (Array.isArray(enabledServers) && enabledServers.length > 0) {
    add(
      'high',
      lineOf(json, 'enabledMcpjsonServers'),
      `enabledMcpjsonServers: ${enabledServers.filter(isString).join(', ')}`,
      'Pre-approves these .mcp.json servers, so they start without a prompt once the folder is trusted.',
      removeKey('enabledMcpjsonServers'),
    );
  }

  for (const key of ['enabledPlugins', 'extraKnownMarketplaces']) {
    const value = at(json, key);
    if (value === undefined || (isObject(value) && Object.keys(value).length === 0)) continue;
    add(
      'medium',
      lineOf(json, key),
      `${key}: ${JSON.stringify(value)}`,
      'Installs or enables Claude Code plugins chosen by the repo once trusted; plugins can ship hooks and MCP servers.',
      removeKey(key),
    );
  }
  return findings;
}

function frontmatterFindings(ctx: ScanContext, file: string): Finding[] {
  const lines = frontmatterLines(ctx.readText(file) ?? '');
  const findings: Finding[] = [];
  const hooks = lines.find((l) => l.key === 'hooks' && l.indent === 0);
  if (hooks !== undefined) {
    const command =
      lines.find((l) => l.line > hooks.line && l.indent > 0 && l.key === 'command')?.value ?? '';
    findings.push({
      ruleId: 'AGENT-001',
      severity: 'high',
      file,
      line: hooks.line,
      evidence: clip(`hooks: ${command}`),
      message:
        'This agent, skill or command registers hooks that run commands while it is active, including in non-interactive runs.',
      remediation: `Remove the hooks block from ${file} before using this repo with Claude Code.`,
    });
  }
  const mode = lines.find((l) => l.key === 'permissionMode' && l.indent === 0);
  if (mode !== undefined && (mode.value === 'bypassPermissions' || mode.value === 'acceptEdits')) {
    findings.push({
      ruleId: 'AGENT-001',
      severity: mode.value === 'bypassPermissions' ? 'high' : 'medium',
      file,
      line: mode.line,
      evidence: `permissionMode: ${mode.value}`,
      message: `This subagent runs in ${mode.value} mode, skipping permission prompts for its actions.`,
      remediation: `Remove permissionMode from ${file}.`,
    });
  }
  return findings;
}
