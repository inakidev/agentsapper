import { lstatSync, type Stats } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatText } from './report/text.js';
import { escapeForTerminal as esc } from './report/sanitize.js';
import { scan } from './scan.js';
import { meetsThreshold, type Severity } from './severity.js';
import type { Rule } from './types.js';
import { readVersion } from './version.js';

export const EXIT_CLEAN = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_ERROR = 2;

/** Findings at or above this severity make the run exit with EXIT_FINDINGS. */
export const DEFAULT_FAIL_ON: Severity = 'high';

const USAGE = `Usage: agentsapper <path>

Scans a repository for things it can execute or inject before an AI coding
agent opens it. Read-only: nothing in the repository is run or modified.

Options:
  -h, --help     Show this help
  -v, --version  Show the version

Exit codes:
  0  no findings at or above ${DEFAULT_FAIL_ON}
  1  findings at or above ${DEFAULT_FAIL_ON}
  2  usage or runtime error
`;

export interface CliIO {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export interface CliOptions {
  /** Overrides the built-in rule set (used by tests). */
  readonly rules?: readonly Rule[];
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

function main(argv: readonly string[], io: CliIO, options: CliOptions): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return usageError(io, message);
  }

  if (parsed.values.help === true) {
    io.stdout(USAGE);
    return EXIT_CLEAN;
  }
  if (parsed.values.version === true) {
    io.stdout(`${readVersion()}\n`);
    return EXIT_CLEAN;
  }

  const [target, ...extra] = parsed.positionals;
  if (target === undefined || extra.length > 0) {
    return usageError(io, 'expected exactly one path to scan');
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

  const result = scan(root, options.rules === undefined ? {} : { rules: options.rules });
  io.stdout(formatText(result));

  if (result.errors.length > 0) return EXIT_ERROR;
  return result.findings.some((f) => meetsThreshold(f.severity, DEFAULT_FAIL_ON))
    ? EXIT_FINDINGS
    : EXIT_CLEAN;
}

function usageError(io: CliIO, message: string): number {
  io.stderr(`agentsapper: ${esc(message)}\n\n${USAGE}`);
  return EXIT_ERROR;
}

function fail(io: CliIO, message: string): number {
  io.stderr(`agentsapper: ${esc(message)}\n`);
  return EXIT_ERROR;
}
