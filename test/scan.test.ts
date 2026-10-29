import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scan } from '../src/scan.js';
import type { Rule, ScanContext } from '../src/types.js';
import { DEFAULT_LIMITS } from '../src/walker.js';
import { fakeRule, finding } from './helpers/rules.js';
import { makeTempDir, removeTempDir } from './helpers/tmp.js';

describe('scan', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTempDir();
  });

  afterEach(() => {
    removeTempDir(tmp);
  });

  it('gives every rule the same walked context', () => {
    writeFileSync(join(tmp, 'file.txt'), 'x');
    const seen: ScanContext[] = [];
    const rule: Rule = { ...fakeRule('TEST-001'), run: (ctx) => (seen.push(ctx), []) };

    const result = scan(tmp, { rules: [rule, rule] });

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
    expect(seen[0]?.root).toBe(tmp);
    expect(seen[0]?.entries.map((e) => e.path)).toEqual(['file.txt']);
    expect(result.incomplete).toEqual([]);
  });

  it('reports limits hit during the walk and during rule reads', () => {
    writeFileSync(join(tmp, 'big'), 'x'.repeat(50));
    const reader: Rule = { ...fakeRule('TEST-001'), run: (ctx) => (ctx.readText('big'), []) };

    const result = scan(tmp, { rules: [reader], limits: { ...DEFAULT_LIMITS, maxFileBytes: 10 } });

    expect(result.incomplete).toEqual(['skipped big: larger than 10 bytes']);
  });

  it('sorts findings by severity, then file, line and rule id', () => {
    const result = scan(tmp, {
      rules: [
        fakeRule('TEST-002', [
          finding({ severity: 'medium', file: 'a' }),
          finding({ severity: 'critical', file: 'b', line: 9 }),
        ]),
        fakeRule('TEST-001', [
          finding({ severity: 'critical', file: 'b', line: 2 }),
          finding({ severity: 'critical', file: 'b' }),
          finding({ severity: 'critical', file: 'a', line: 50 }),
          finding({ severity: 'critical', file: 'b', line: 9 }),
        ]),
      ],
    });

    expect(
      result.findings.map((f) => `${f.severity} ${f.file}:${f.line ?? '-'} ${f.ruleId}`),
    ).toEqual([
      'critical a:50 TEST-001',
      'critical b:- TEST-001',
      'critical b:2 TEST-001',
      'critical b:9 TEST-001',
      'critical b:9 TEST-002',
      'medium a:- TEST-002',
    ]);
  });

  it('records a failing rule as an error and keeps running the others', () => {
    const broken: Rule = {
      ...fakeRule('TEST-001'),
      run: () => {
        throw new Error('parser blew up');
      },
    };

    const result = scan(tmp, { rules: [broken, fakeRule('TEST-002', [finding()])] });

    expect(result.errors).toEqual([{ ruleId: 'TEST-001', message: 'parser blew up' }]);
    expect(result.findings.map((f) => f.ruleId)).toEqual(['TEST-002']);
  });

  it('reports the metadata of the rules that ran, without their implementation', () => {
    const result = scan(tmp, { rules: [fakeRule('TEST-001')] });

    expect(result.rules).toEqual([
      {
        id: 'TEST-001',
        title: 'Fake rule TEST-001',
        severity: 'high',
        status: 'experimental',
        references: [],
      },
    ]);
  });
});
