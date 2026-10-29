import { isObject, isString } from '../../parsers/jsonc.js';
import type { Finding, Rule, ScanContext } from '../../types.js';
import { clip } from '../util.js';
import { at, filesMatching, lineOf, readJsonc, readToml, runsRegistryPackage } from './common.js';

// Project MCP config files and the key holding the server map, verified against:
// Claude Code https://code.claude.com/docs/en/mcp (.mcp.json, mcpServers),
// Cursor https://cursor.com/docs/mcp (.cursor/mcp.json, mcpServers),
// VS Code https://code.visualstudio.com/docs/agents/reference/mcp-configuration (.vscode/mcp.json, servers),
// Gemini CLI https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md (.gemini/settings.json, mcpServers),
// Codex https://learn.chatgpt.com/docs/extend/mcp (.codex/config.toml, [mcp_servers.<name>]).
const JSON_SOURCES: readonly { pattern: RegExp; key: string; tool: string }[] = [
  { pattern: /(^|\/)\.mcp\.json$/, key: 'mcpServers', tool: 'Claude Code' },
  { pattern: /(^|\/)\.cursor\/mcp\.json$/, key: 'mcpServers', tool: 'Cursor' },
  { pattern: /(^|\/)\.vscode\/mcp\.json$/, key: 'servers', tool: 'VS Code' },
  { pattern: /(^|\/)\.gemini\/settings\.json$/, key: 'mcpServers', tool: 'Gemini CLI' },
];
const CODEX_CONFIG = /(^|\/)\.codex\/config\.toml$/;

interface Server {
  readonly file: string;
  readonly tool: string;
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly line: number | undefined;
  /** Gemini's `trust: true` skips every tool confirmation for the server. */
  readonly trusted: boolean;
  /** Claude Code's headersHelper runs a command to build request headers. */
  readonly helper?: boolean;
}

function jsonServers(ctx: ScanContext): Server[] {
  return JSON_SOURCES.flatMap(({ pattern, key, tool }) =>
    filesMatching(ctx, pattern).flatMap((file) => {
      const json = readJsonc(ctx, file);
      const servers = json === undefined ? undefined : at(json, key);
      if (json === undefined || !isObject(servers)) return [];
      return Object.entries(servers).flatMap(([name, server]): Server[] => {
        if (!isObject(server)) return [];
        const out: Server[] = [];
        const args = Array.isArray(server.args) ? server.args.filter(isString) : [];
        if (isString(server.command) && server.command.trim() !== '') {
          out.push({
            file,
            tool,
            name,
            command: server.command,
            args,
            line: lineOf(json, key, name, 'command'),
            trusted: server.trust === true,
          });
        }
        if (isString(server.headersHelper) && server.headersHelper.trim() !== '') {
          out.push({
            file,
            tool,
            name,
            command: server.headersHelper,
            args: [],
            line: lineOf(json, key, name, 'headersHelper'),
            trusted: false,
            helper: true,
          });
        }
        return out;
      });
    }),
  );
}

function codexServers(ctx: ScanContext): Server[] {
  return filesMatching(ctx, CODEX_CONFIG).flatMap((file) => {
    const toml = readToml(ctx, file);
    if (toml === undefined) return [];
    const servers = new Map<string, { command?: string; args: string[]; line?: number }>();
    for (const entry of toml.entries) {
      const [root, name, field] = entry.path;
      if (root !== 'mcp_servers' || typeof name !== 'string' || entry.path.length !== 3) continue;
      const server = servers.get(name) ?? { args: [] };
      if (field === 'command' && isString(entry.value)) {
        server.command = entry.value;
        server.line = entry.line;
      } else if (field === 'args' && Array.isArray(entry.value)) {
        server.args = entry.value.filter(isString);
      }
      servers.set(name, server);
    }
    return [...servers].flatMap(([name, s]) =>
      s.command === undefined
        ? []
        : [
            {
              file,
              tool: 'Codex',
              name,
              command: s.command,
              args: s.args,
              line: s.line,
              trusted: false,
            },
          ],
    );
  });
}

export const AGENT_002: Rule = {
  id: 'AGENT-002',
  title: 'Repository defines an MCP server that launches a local command',
  severity: 'high',
  status: 'stable',
  references: [
    'https://code.claude.com/docs/en/mcp',
    'https://cursor.com/docs/mcp',
    'https://code.visualstudio.com/docs/agents/reference/mcp-configuration',
    'https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md',
    'https://learn.chatgpt.com/docs/extend/mcp',
  ],
  run(ctx) {
    return [...jsonServers(ctx), ...codexServers(ctx)].map((s): Finding => {
      const full = [s.command, ...s.args].join(' ');
      const fetched = runsRegistryPackage(s.command, s.args)
        ? ' It downloads and runs a package from a registry each time it starts.'
        : '';
      const trust = s.trusted
        ? ' "trust": true makes Gemini CLI skip every confirmation for its tools.'
        : '';
      return {
        ruleId: 'AGENT-002',
        severity: s.trusted ? 'critical' : 'high',
        file: s.file,
        ...(s.line === undefined ? {} : { line: s.line }),
        evidence: clip(`${s.name}: ${s.helper === true ? 'headersHelper ' : ''}${full}`),
        message:
          (s.helper === true
            ? `${s.tool} runs this headersHelper command when it connects to the "${s.name}" server.`
            : `${s.tool} starts the MCP server "${s.name}" by running this command on your machine, with your user's permissions.`) +
          fetched +
          trust,
        remediation: `Check what "${s.name}" runs before approving it, or remove it from ${s.file}.`,
      };
    });
  },
};
