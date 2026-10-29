import { describe, expect, it } from 'vitest';
import { materialize, type MaterializedFixture } from '../fixtures/materialize.js';
import type { ExpectedFinding, FixtureSpec } from '../fixtures/spec.js';
import { ALL_SPECS } from '../fixtures/specs/index.js';
import { foldName } from '../src/names.js';
import { ALL_RULES } from '../src/rules/index.js';
import { scan } from '../src/scan.js';

// Every fixture is materialized into a temp dir, scanned with the full rule set,
// and must produce exactly its expected findings: no misses, no extras.

const signature = (f: ExpectedFinding) =>
  `${f.ruleId} ${f.severity} ${f.file}${f.line === undefined ? '' : `:${f.line}`}`;

function materializeOrSkip(spec: FixtureSpec, skip: (note: string) => never): MaterializedFixture {
  if (spec.onlyOn !== undefined && !spec.onlyOn.includes(process.platform)) {
    skip(`depends on ${spec.onlyOn.join('/')} filesystem semantics`);
  }
  try {
    return materialize(spec);
  } catch (error) {
    if (error instanceof Error && error.message.includes('symlinks are not supported')) {
      skip(error.message);
    }
    throw error;
  }
}

describe.each(ALL_SPECS.map((spec) => [spec.id, spec] as const))('fixture %s', (_id, spec) => {
  it('produces exactly the expected findings', (ctx) => {
    const fixture = materializeOrSkip(spec, (note) => ctx.skip(note));
    try {
      const result = scan(fixture.root);

      expect(result.errors).toEqual([]);
      expect(result.incomplete).toEqual([]);
      // Expectations without a line (hooks, directories) match a finding at any line.
      const actual = result.findings.map((f) => {
        const anyLine = spec.expect.some(
          (e) => e.line === undefined && e.file === f.file && e.ruleId === f.ruleId,
        );
        return signature(anyLine ? { ruleId: f.ruleId, severity: f.severity, file: f.file } : f);
      });
      expect(actual.sort()).toEqual(spec.expect.map(signature).sort());
    } finally {
      fixture.cleanup();
    }
  });
});

// On case-insensitive filesystems (Windows, macOS by default) a tool that opens
// .claude/settings.json also gets .CLAUDE/SETTINGS.JSON, so respelling paths must not
// hide anything. File contents and link targets keep their spelling, so lookups through
// config values (include.path, gitdir:) and links are exercised too.
function respelled(spec: FixtureSpec): FixtureSpec {
  return {
    ...spec,
    files: spec.files.map((entry) => ({ ...entry, path: entry.path.toUpperCase() })),
  };
}

describe.each(ALL_SPECS.map((spec) => [spec.id, spec] as const))(
  'fixture %s with its paths in upper case',
  (_id, spec) => {
    it('produces the same findings, up to the spelling of paths', (ctx) => {
      const paths = respelled(spec).files.map((entry) => entry.path);
      if (new Set(paths).size < paths.length) ctx.skip('its paths collide once respelled');
      const fixture = materializeOrSkip(respelled(spec), (note) => ctx.skip(note));
      try {
        const result = scan(fixture.root);

        expect(result.errors).toEqual([]);
        expect(result.incomplete).toEqual([]);
        const folded = (f: ExpectedFinding) => ({ ...f, file: foldName(f.file) });
        const expected = spec.expect.map(folded);
        const actual = result.findings.map((f) => {
          const anyLine = expected.some(
            (e) => e.line === undefined && e.file === foldName(f.file) && e.ruleId === f.ruleId,
          );
          const g = folded(f);
          return signature(anyLine ? { ruleId: g.ruleId, severity: g.severity, file: g.file } : g);
        });
        expect(actual.sort()).toEqual(expected.map(signature).sort());
      } finally {
        fixture.cleanup();
      }
    });
  },
);

describe('fixture catalog', () => {
  it('has unique ids', () => {
    const ids = ALL_SPECS.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('links every malicious fixture to its source and expects at least one finding', () => {
    for (const spec of ALL_SPECS.filter((s) => s.kind === 'malicious')) {
      expect(spec.source, spec.id).toMatch(/^https:\/\//);
      expect(spec.expect.length, spec.id).toBeGreaterThan(0);
    }
  });

  it('expects nothing from benign fixtures', () => {
    for (const spec of ALL_SPECS.filter((s) => s.kind === 'benign')) {
      expect(spec.expect, spec.id).toEqual([]);
    }
  });

  it('covers every shipped rule with at least one malicious fixture', () => {
    const covered = new Set(
      ALL_SPECS.filter((s) => s.kind === 'malicious').flatMap((s) => s.expect.map((e) => e.ruleId)),
    );
    expect(ALL_RULES.map((rule) => rule.id).filter((id) => !covered.has(id))).toEqual([]);
  });
});
