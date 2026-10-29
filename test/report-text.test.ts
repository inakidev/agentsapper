import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { escapeForTerminal } from '../src/report/sanitize.js';
import { formatText } from '../src/report/text.js';
import { scan, type ScanResult } from '../src/scan.js';
import type { Rule } from '../src/types.js';
import { fakeRule, finding } from './helpers/rules.js';
import { makeTempDir, removeTempDir } from './helpers/tmp.js';

let emptyDir: string;
beforeAll(() => {
  emptyDir = makeTempDir();
});
afterAll(() => {
  removeTempDir(emptyDir);
});

/** Runs the rules over an empty dir, then labels the result as coming from /repo. */
function resultOf(options: { rules: Rule[] }, overrides: Partial<ScanResult> = {}): ScanResult {
  return { ...scan(emptyDir, options), root: '/repo', ...overrides };
}

describe('escapeForTerminal', () => {
  it('leaves ordinary text alone', () => {
    expect(escapeForTerminal('core.fsmonitor = true (\u{f1}, \u{6f22}\u{5b57})')).toBe(
      'core.fsmonitor = true (\u{f1}, \u{6f22}\u{5b57})',
    );
  });

  it('escapes control characters that could drive the terminal', () => {
    expect(escapeForTerminal('a\u001b[2Jb\nc\rd\te\u0007')).toBe(
      'a\\u{1b}[2Jb\\u{a}c\\u{d}d\\u{9}e\\u{7}',
    );
  });

  it('escapes invisible and bidi characters so the output is truthful', () => {
    expect(escapeForTerminal('x\u{202e}y\u{200b}z\u{2066}\u{feff}')).toBe(
      'x\\u{202e}y\\u{200b}z\\u{2066}\\u{feff}',
    );
    expect(escapeForTerminal('hi\u{e0041}\u{e007f}')).toBe('hi\\u{e0041}\\u{e007f}');
  });
});

describe('formatText', () => {
  it('says so when there are no findings', () => {
    const output = formatText(resultOf({ rules: [] }));

    expect(output).toContain('Scanned /repo with 0 rules.');
    expect(output).toContain('No findings.');
  });

  it('ends with a verdict that agrees with the exit code', () => {
    const rules = (severity: 'high' | 'low') => [fakeRule('TEST-001', [finding({ severity })])];

    expect(formatText(resultOf({ rules: [] }))).toContain('Verdict: nothing found.');
    expect(formatText(resultOf({ rules: rules('high') }))).toContain(
      'Verdict: do not open this folder with an agent, an IDE or git until you have read the finding at high or above.',
    );
    expect(formatText(resultOf({ rules: rules('low') }))).toContain(
      'Verdict: nothing at high or above',
    );
    expect(formatText(resultOf({ rules: rules('low') }), 'low')).toContain('at low or above');
    expect(formatText(resultOf({ rules: [] }, { incomplete: ['time limit'] }))).toContain(
      'Verdict: the scan is incomplete',
    );
  });

  it('groups findings by severity, most severe first', () => {
    const output = formatText(
      resultOf({
        rules: [
          fakeRule('TEST-001', [finding({ severity: 'medium', file: 'm.txt' })]),
          fakeRule('TEST-002', [finding({ severity: 'critical', file: '.git/config', line: 3 })]),
        ],
      }),
    );

    const critical = output.indexOf('== CRITICAL (1) ==');
    const medium = output.indexOf('== MEDIUM (1) ==');
    expect(critical).toBeGreaterThan(-1);
    expect(medium).toBeGreaterThan(critical);
    expect(output).toContain('TEST-002  Fake rule TEST-002');
    expect(output).toContain('.git/config:3');
    expect(output).toContain('Summary: 1 critical, 0 high, 1 medium, 0 low, 0 info.');
  });

  it('shows evidence, explanation and remediation for each finding', () => {
    const output = formatText(
      resultOf({
        rules: [
          fakeRule('TEST-001', [
            finding({ evidence: 'the snippet', message: 'the reason', remediation: 'the fix' }),
          ]),
        ],
      }),
    );

    expect(output).toContain('the snippet');
    expect(output).toContain('the reason');
    expect(output).toContain('the fix');
  });

  it('never prints raw control characters taken from the scanned repo', () => {
    const output = formatText(
      resultOf({
        rules: [
          fakeRule('TEST-001', [
            finding({ file: 'evil\u001b]0;title\u0007.md', evidence: 'line1\nline2\u{202e}' }),
          ]),
        ],
      }),
    );

    expect(output).not.toContain('\u001b');
    expect(output).not.toContain('\u{202e}');
    expect(output).toContain('evil\\u{1b}]0;title\\u{7}.md');
    expect(output).toContain('line1\\u{a}line2\\u{202e}');
  });

  it('warns when the scan is incomplete instead of claiming a clean result', () => {
    const output = formatText(
      resultOf({ rules: [] }, { incomplete: ['entry limit of 3 reached', 'cannot read a/b'] }),
    );

    expect(output).toContain('Scan incomplete (2)');
    expect(output).toContain('  entry limit of 3 reached');
    expect(output).toContain('No findings in what was scanned.');
    expect(output).not.toContain('No findings.\n');
  });

  it('lists rules that failed to run', () => {
    const broken: Rule = {
      ...fakeRule('TEST-001'),
      run: () => {
        throw new Error('bad input');
      },
    };

    const output = formatText(resultOf({ rules: [broken] }));

    expect(output).toContain('Rule errors (1)');
    expect(output).toContain('TEST-001  bad input');
  });
});
