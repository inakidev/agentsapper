import { isObject, isString, parseJsonc, pointer, type JsoncResult } from '../../parsers/jsonc.js';
import { parseToml, type ParsedToml } from '../../parsers/toml.js';
import { compareStrings } from '../../walker.js';
import type { ScanContext } from '../../types.js';
import { projectFiles, readLinked } from '../linked.js';

// Vendored dependencies are out of scope (they are not opened by the agent as
// project config), and git dirs hold no agent config.
function isProjectPath(path: string): boolean {
  const segments = path.split('/');
  return !segments.includes('node_modules') && !segments.includes('.git');
}

/**
 * Paths a tool would open that match `pattern`, sorted: regular files, plus paths
 * that in-repo symlinks lead to a regular file (see rules/linked.ts).
 */
export function filesMatching(ctx: ScanContext, pattern: RegExp): string[] {
  return projectFiles(ctx)
    .map((f) => f.path)
    .filter((path) => isProjectPath(path) && pattern.test(path))
    .sort(compareStrings);
}

export function readJsonc(ctx: ScanContext, path: string): JsoncResult | undefined {
  return ctx.memo(`jsonc:${path}`, () => {
    const text = readLinked(ctx, path);
    return text === undefined ? undefined : parseJsonc(text);
  });
}

export function readToml(ctx: ScanContext, path: string): ParsedToml | undefined {
  return ctx.memo(`toml:${path}`, () => {
    const text = readLinked(ctx, path);
    return text === undefined ? undefined : parseToml(text);
  });
}

export function at(json: JsoncResult, ...segments: (string | number)[]): unknown {
  let node: unknown = json.value;
  for (const segment of segments) {
    if (Array.isArray(node) && typeof segment === 'number') node = node[segment];
    else if (isObject(node) && typeof segment === 'string') node = node[segment];
    else return undefined;
  }
  return node;
}

export function lineOf(json: JsoncResult, ...segments: (string | number)[]): number | undefined {
  return json.lines.get(pointer(...segments));
}

export interface HookCommand {
  /** Event name as written (SessionStart, preToolUse, BeforeTool, ...). */
  readonly event: string;
  /** What runs: a shell command, or `POST <url>` for HTTP hooks. */
  readonly command: string;
  readonly kind: 'command' | 'http';
  readonly line: number | undefined;
}

const COMMAND_FIELDS = ['command', 'bash', 'powershell', 'exec'];

/**
 * Every command under a `hooks` object, whatever the tool's nesting:
 * hooks.<Event>[] entries, possibly with their own nested `hooks` arrays.
 */
export function hookCommands(json: JsoncResult, ...hooksPath: string[]): HookCommand[] {
  const hooks = at(json, ...hooksPath);
  if (!isObject(hooks)) return [];
  const out: HookCommand[] = [];

  const visit = (event: string, node: unknown, path: (string | number)[]) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => visit(event, item, [...path, i]));
      return;
    }
    if (!isObject(node)) return;
    if (node.type === 'http' && isString(node.url)) {
      out.push({
        event,
        command: `POST ${node.url}`,
        kind: 'http',
        line: lineOf(json, ...path, 'url'),
      });
    }
    for (const field of COMMAND_FIELDS) {
      const value = node[field];
      if (isString(value) && value.trim() !== '') {
        const args = Array.isArray(node.args) ? ` ${node.args.filter(isString).join(' ')}` : '';
        out.push({
          event,
          command: value + args,
          kind: 'command',
          line: lineOf(json, ...path, field),
        });
      }
    }
    if (Array.isArray(node.hooks)) visit(event, node.hooks, [...path, 'hooks']);
  };

  for (const [event, value] of Object.entries(hooks)) visit(event, value, [...hooksPath, event]);
  return out;
}

/** Events that fire on their own when a session starts or a workspace opens. */
const AUTOMATIC_EVENTS = new Set(['sessionstart', 'setup', 'instructionsloaded', 'workspaceopen']);

export function firesAutomatically(event: string): boolean {
  return AUTOMATIC_EVENTS.has(event.toLowerCase());
}

const PACKAGE_RUNNERS = /^(npx|uvx|bunx|pnpx|pipx|deno)$|^(pnpm|yarn)\s+dlx\b/;

/** True when the command fetches and runs a package from a registry at launch. */
export function runsRegistryPackage(command: string, args: readonly string[] = []): boolean {
  const first = command.trim().split(/[\\/]/).pop() ?? '';
  return PACKAGE_RUNNERS.test(first) || PACKAGE_RUNNERS.test(`${first} ${args[0] ?? ''}`);
}
