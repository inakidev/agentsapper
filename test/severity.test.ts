import { describe, expect, it } from 'vitest';
import { SEVERITIES, isSeverity, meetsThreshold } from '../src/severity.js';

describe('severity', () => {
  it('orders severities from least to most severe', () => {
    expect(SEVERITIES).toEqual(['info', 'low', 'medium', 'high', 'critical']);
  });

  it('meets a threshold when equal or more severe', () => {
    expect(meetsThreshold('high', 'high')).toBe(true);
    expect(meetsThreshold('critical', 'high')).toBe(true);
    expect(meetsThreshold('medium', 'high')).toBe(false);
    expect(meetsThreshold('info', 'info')).toBe(true);
  });

  it('recognizes valid severity names only', () => {
    expect(isSeverity('critical')).toBe(true);
    expect(isSeverity('CRITICAL')).toBe(false);
    expect(isSeverity('severe')).toBe(false);
  });
});
