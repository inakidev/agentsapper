import { describe, expect, it } from 'vitest';
import { foldName, sameName } from '../src/names.js';

describe('sameName', () => {
  it('ignores case, as Windows and macOS do', () => {
    expect(sameName('.Claude/Settings.json', '.claude/settings.json')).toBe(true);
    expect(sameName('.GIT', '.git')).toBe(true);
    expect(sameName('PRE-COMMIT', 'pre-commit')).toBe(true);
  });

  it('folds non-ASCII letters that stand for ASCII ones', () => {
    const longS = String.fromCodePoint(0x17f);
    const kelvin = String.fromCodePoint(0x212a);
    expect(sameName(`.claude/${longS}ettings.json`, '.claude/settings.json')).toBe(true);
    expect(sameName(`${kelvin}eys`, 'keys')).toBe(true);
  });

  it('treats composed and decomposed forms as one name, as macOS does', () => {
    const composed = `caf${String.fromCodePoint(0xe9)}`;
    const decomposed = `cafe${String.fromCodePoint(0x301)}`;
    expect(sameName(composed, decomposed)).toBe(true);
  });

  it('keeps different names apart', () => {
    expect(sameName('.claude', '.claudex')).toBe(false);
    expect(foldName('.cursor/rules')).not.toBe(foldName('.cursor/rule'));
  });
});
