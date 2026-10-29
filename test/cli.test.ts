import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXIT_CLEAN, EXIT_ERROR, EXIT_FINDINGS, runCli, type CliOptions } from '../src/cli.js';
import type { Rule } from '../src/types.js';
import { DEFAULT_LIMITS } from '../src/walker.js';
import { fakeRule, finding } from './helpers/rules.js';
import { makeTempDir, removeTempDir } from './helpers/tmp.js';

function run(argv: string[], options: CliOptions = { rules: [] }) {
  let stdout = '';
  let stderr = '';
  const code = runCli(
    argv,
    {
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      },
    },
    options,
  );
  return { code, stdout, stderr };
}

describe('cli', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTempDir();
  });

  afterEach(() => {
    removeTempDir(tmp);
  });

  it('prints usage with --help', () => {
    const { code, stdout } = run(['--help']);

    expect(code).toBe(EXIT_CLEAN);
    expect(stdout).toContain('Usage: agentsapper <path>');
  });

  it('prints the package version with --version', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };

    const { code, stdout } = run(['--version']);

    expect(code).toBe(EXIT_CLEAN);
    expect(stdout.trim()).toBe(pkg.version);
  });

  it.each([
    ['no path', []],
    ['two paths', ['a', 'b']],
    ['an unknown option', ['--bogus', '.']],
  ])('fails with usage when given %s', (_label, argv) => {
    const { code, stderr } = run(argv);

    expect(code).toBe(EXIT_ERROR);
    expect(stderr).toContain('Usage: agentsapper <path>');
  });

  it('fails when the path does not exist', () => {
    const { code, stderr } = run([join(tmp, 'missing')]);

    expect(code).toBe(EXIT_ERROR);
    expect(stderr).toContain('cannot access');
  });

  it('fails when the path is not a directory', () => {
    const file = join(tmp, 'file.txt');
    writeFileSync(file, 'hello');

    const { code, stderr } = run([file]);

    expect(code).toBe(EXIT_ERROR);
    expect(stderr).toContain('not a directory');
  });

  it('refuses to scan through a symlinked root', () => {
    const target = join(tmp, 'target');
    const link = join(tmp, 'link');
    mkdirSync(target);
    // Junctions need no special privileges on Windows; lstat reports them as symlinks.
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');

    const { code, stderr } = run([link]);

    expect(code).toBe(EXIT_ERROR);
    expect(stderr).toContain('symlink');
  });

  it('exits clean on a directory with no findings', () => {
    const { code, stdout } = run([tmp]);

    expect(code).toBe(EXIT_CLEAN);
    expect(stdout).toContain('No findings.');
  });

  it('exits 1 when a finding reaches the default threshold (high)', () => {
    const rules = [fakeRule('TEST-001', [finding({ severity: 'high' })])];

    expect(run([tmp], { rules }).code).toBe(EXIT_FINDINGS);
  });

  it('exits clean when every finding is below the default threshold', () => {
    const rules = [fakeRule('TEST-001', [finding({ severity: 'medium' })])];

    const { code, stdout } = run([tmp], { rules });

    expect(code).toBe(EXIT_CLEAN);
    expect(stdout).toContain('== MEDIUM (1) ==');
  });

  it('honors --fail-on', () => {
    const rules = [fakeRule('TEST-001', [finding({ severity: 'medium' })])];

    expect(run([tmp, '--fail-on', 'medium'], { rules }).code).toBe(EXIT_FINDINGS);
    expect(run([tmp, '--fail-on', 'critical'], { rules }).code).toBe(EXIT_CLEAN);
  });

  it.each([
    ['an unknown format', ['--format', 'xml']],
    ['an unknown severity', ['--fail-on', 'severe']],
    ['an unknown rule family', ['--rules', 'NOPE']],
  ])('rejects %s with a usage error', (_label, flags) => {
    const { code, stderr } = run([tmp, ...flags], {});

    expect(code).toBe(EXIT_ERROR);
    expect(stderr).toContain('Usage: agentsapper <path>');
  });

  it('runs only the selected rule families and ids with --rules', () => {
    const { stdout } = run([tmp, '--format', 'json', '--rules', 'fs,GIT-001'], {});
    const ids = (JSON.parse(stdout) as { rules: { id: string }[] }).rules.map((r) => r.id);

    expect(ids).toEqual(['GIT-001', 'FS-001', 'FS-002', 'FS-003', 'FS-004']);
  });

  it('prints machine-readable JSON with --format json', () => {
    const rules = [fakeRule('TEST-001', [finding({ severity: 'high', file: 'a', line: 3 })])];

    const { code, stdout } = run([tmp, '--format', 'json'], { rules });
    const report = JSON.parse(stdout) as Record<string, unknown>;

    expect(code).toBe(EXIT_FINDINGS);
    expect(report).toMatchObject({
      schemaVersion: 1,
      tool: { name: 'agentsapper' },
      complete: true,
      summary: { high: 1, total: 1 },
      findings: [{ ruleId: 'TEST-001', severity: 'high', file: 'a', line: 3 }],
    });
  });

  it('prints SARIF 2.1.0 with --format sarif', () => {
    const rules = [fakeRule('TEST-001', [finding({ severity: 'medium', file: 'dir/a b.txt' })])];

    const sarif = JSON.parse(run([tmp, '--format', 'sarif'], { rules }).stdout) as {
      version: string;
      runs: {
        results: {
          level: string;
          locations: { physicalLocation: { artifactLocation: { uri: string } } }[];
        }[];
      }[];
    };

    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0]?.results[0]?.level).toBe('warning');
    expect(sarif.runs[0]?.results[0]?.locations[0]?.physicalLocation.artifactLocation.uri).toBe(
      'dir/a%20b.txt',
    );
  });

  it('prints nothing with --quiet when nothing reaches --fail-on', () => {
    const rules = [fakeRule('TEST-001', [finding({ severity: 'low' })])];

    expect(run([tmp, '--quiet'], { rules }).stdout).toBe('');
  });

  it('prints only findings at or above --fail-on with --quiet', () => {
    const rules = [
      fakeRule('TEST-001', [finding({ severity: 'low', evidence: 'minor' })]),
      fakeRule('TEST-002', [finding({ severity: 'critical', evidence: 'major' })]),
    ];

    const { stdout } = run([tmp, '--quiet'], { rules });

    expect(stdout).toContain('major');
    expect(stdout).not.toContain('minor');
  });

  it('exits 2 when the scan is incomplete, even without findings', () => {
    writeFileSync(join(tmp, 'a'), 'a');
    writeFileSync(join(tmp, 'b'), 'b');

    const { code, stdout } = run([tmp], {
      rules: [],
      limits: { ...DEFAULT_LIMITS, maxEntries: 1 },
    });

    expect(code).toBe(EXIT_ERROR);
    expect(stdout).toContain('Scan incomplete (1)');
  });

  it('exits 2 when a rule fails, even if others found something', () => {
    const broken: Rule = {
      ...fakeRule('TEST-001'),
      run: () => {
        throw new Error('boom');
      },
    };
    const rules = [broken, fakeRule('TEST-002', [finding({ severity: 'critical' })])];

    expect(run([tmp], { rules }).code).toBe(EXIT_ERROR);
  });
});
