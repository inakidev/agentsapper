import { lstatSync, type Stats } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatJson } from './report/json.js';
import { escapeForTerminal as esc } from './report/sanitize.js';
import { formatSarif } from './report/sarif.js';
import { formatText } from './report/text.js';
import { ALL_RULES } from './rules/index.js';
import { scan, type ScanResult } from './scan.js';
import { isSeverity, meetsThreshold, SEVERITIES, type Severity } from './severity.js';
import type { Rule } from './types.js';
import { readVersion } from './version.js';
import type { Limits } from './walker.js';

export const EXIT_CLEAN = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_ERROR = 2;

/** Findings at or above this severity make the run exit with EXIT_FINDINGS. */
export const DEFAULT_FAIL_ON: Severity = 'high';

const FORMATS = ['text', 'json', 'sarif'] as const;
type Format = (typeof FORMATS)[number];
const FAMILIES = ['GIT', 'FS', 'AGENT', 'INSTR', 'IDE', 'PKG'];

const USAGE = `Usage: agentsapper <path> [options]

Scans a repository for things it can execute or inject before an AI coding
agent opens it. Read-only: nothing in the repository is run or modified.

Options:
  --format <text|json|sarif>   Output format (default: text)
  --fail-on <severity>         Exit 1 on findings at or above this severity:
                               ${SEVERITIES.join(', ')} (default: ${DEFAULT_FAIL_ON})
  --rules <list>               Only run these rule families or ids, comma-separated
                               (${FAMILIES.join(', ')}, or ids such as GIT-001)
  --quiet                      Text output: print only findings at or above --fail-on,
                               and nothing at all when there are none
  -h, --help                   Show this help
  -v, --version                Show the version

Exit codes:
  0  no findings at or above --fail-on
  1  findings at or above --fail-on
  2  usage or runtime error, or the scan was incomplete (limits hit, unreadable files)
`;

export interface CliIO {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export interface CliOptions {
  /** Overrides the built-in rule set (used by tests). */
  readonly rules?: readonly Rule[];
  /** Overrides the walk and read limits (used by tests). */
  readonly limits?: Limits;
}

export function runCli(argv: readonly string[], io: CliIO, options: CliOptions = {}): number {
  try {
    return main(argv, io, options);
  } catch (error) {
    // Never let a crash fall through to Node's default exit code 1, which means "findings".
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`agentsapper: internal error: ${esc(message)}\n`);
    return EXIT_ERROR;
  }
}

class UsageError extends Error {}

function selectRules(available: readonly Rule[], spec: string | undefined): readonly Rule[] {
  if (spec === undefined) return available;
  const tokens = spec
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t !== '');
  if (tokens.length === 0) throw new UsageError('--rules needs at least one family or rule id');
  for (const token of tokens) {
    if (!FAMILIES.includes(token) && !available.some((r) => r.id === token)) {
      throw new UsageError(`unknown rule or family "${token}"`);
    }
  }
  return available.filter(
    (r) => tokens.includes(r.id) || tokens.includes(r.id.split('-')[0] ?? ''),
  );
}

function main(argv: readonly string[], io: CliIO, options: CliOptions): number {
  let format: Format;
  let failOn: Severity;
  let rules: readonly Rule[];
  let quiet: boolean;
  let target: string;
  try {
    const parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        format: { type: 'string', default: 'text' },
        'fail-on': { type: 'string', default: DEFAULT_FAIL_ON },
        rules: { type: 'string' },
        quiet: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
    if (parsed.values.help === true) {
      io.stdout(USAGE);
      return EXIT_CLEAN;
    }
    if (parsed.values.version === true) {
      io.stdout(`${readVersion()}\n`);
      return EXIT_CLEAN;
    }

    const formatValue = parsed.values.format;
    if (!(FORMATS as readonly string[]).includes(formatValue)) {
      throw new UsageError(`--format must be one of ${FORMATS.join(', ')}`);
    }
    format = formatValue as Format;
    const failValue = parsed.values['fail-on'].toLowerCase();
    if (!isSeverity(failValue))
      throw new UsageError(`--fail-on must be one of ${SEVERITIES.join(', ')}`);
    failOn = failValue;
    rules = selectRules(options.rules ?? ALL_RULES, parsed.values.rules);
    quiet = parsed.values.quiet;

    const [first, ...extra] = parsed.positionals;
    if (first === undefined || extra.length > 0)
      throw new UsageError('expected exactly one path to scan');
    target = first;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`agentsapper: ${esc(message)}\n\n${USAGE}`);
    return EXIT_ERROR;
  }

  const root = resolve(target);
  let stats: Stats;
  try {
    stats = lstatSync(root);
  } catch {
    return fail(io, `cannot access ${root}`);
  }
  if (stats.isSymbolicLink()) {
    return fail(io, `${root} is a symlink; pass the real path of the repository instead`);
  }
  if (!stats.isDirectory()) {
    return fail(io, `${root} is not a directory`);
  }

  const result = scan(root, {
    rules,
    ...(options.limits === undefined ? {} : { limits: options.limits }),
  });
  io.stdout(render(result, format, failOn, quiet));

  // An incomplete scan must never pass as clean: a repo could pad itself to hide.
  if (result.errors.length > 0 || result.incomplete.length > 0) return EXIT_ERROR;
  return result.findings.some((f) => meetsThreshold(f.severity, failOn))
    ? EXIT_FINDINGS
    : EXIT_CLEAN;
}

function render(result: ScanResult, format: Format, failOn: Severity, quiet: boolean): string {
  if (format === 'json') return formatJson(result, readVersion());
  if (format === 'sarif') return formatSarif(result, readVersion());
  if (!quiet) return formatText(result);
  const shown = {
    ...result,
    findings: result.findings.filter((f) => meetsThreshold(f.severity, failOn)),
  };
  const clean =
    shown.findings.length === 0 && result.errors.length === 0 && result.incomplete.length === 0;
  return clean ? '' : formatText(shown);
}

function fail(io: CliIO, message: string): number {
  io.stderr(`agentsapper: ${esc(message)}\n`);
  return EXIT_ERROR;
}
