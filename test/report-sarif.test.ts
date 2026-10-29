import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import addFormatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { materialize } from '../fixtures/materialize.js';
import { ALL_SPECS } from '../fixtures/specs/index.js';
import { formatSarif } from '../src/report/sarif.js';
import { scan } from '../src/scan.js';

// Validates real output against the official SARIF 2.1.0 schema (OASIS), vendored
// from https://json.schemastore.org/sarif-2.1.0.json so tests need no network. The
// hash pins that exact copy; Prettier leaves the file alone.
const SCHEMA = readFileSync(new URL('./schemas/sarif-2.1.0.json', import.meta.url));
const SCHEMA_SHA256 = 'c96eb2d311c37b0a38cbd18c52d79a68f778bbd2d831abed7412d9850740f785';

const addFormats = addFormatsModule as unknown as (ajv: Ajv) => Ajv;

describe('SARIF output', () => {
  it('uses the pinned copy of the schema', () => {
    expect(createHash('sha256').update(SCHEMA).digest('hex')).toBe(SCHEMA_SHA256);
  });

  it('validates against the SARIF 2.1.0 schema', () => {
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(JSON.parse(SCHEMA.toString('utf8')) as object);

    const specs = ALL_SPECS.filter((s) =>
      ['git-002-exec-keys', 'agent-001-claude-settings', 'git-008-embedded-bare'].includes(s.id),
    );
    for (const spec of specs) {
      const fixture = materialize(spec);
      try {
        const sarif: unknown = JSON.parse(formatSarif(scan(fixture.root), '0.0.0-test'));
        expect(validate(sarif), JSON.stringify(validate.errors, null, 2)).toBe(true);
      } finally {
        fixture.cleanup();
      }
    }
  });
});
