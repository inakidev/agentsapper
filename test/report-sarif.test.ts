import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';
import addFormatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { materialize } from '../fixtures/materialize.js';
import { ALL_SPECS } from '../fixtures/specs/index.js';
import { formatSarif } from '../src/report/sarif.js';
import { scan } from '../src/scan.js';

// Validates real output against the official SARIF 2.1.0 schema. CI downloads the
// schema before running tests; locally the test is skipped until it is cached:
//   curl -sfL https://json.schemastore.org/sarif-2.1.0.json -o node_modules/.cache/sarif-2.1.0.json
const SCHEMA = fileURLToPath(new URL('../node_modules/.cache/sarif-2.1.0.json', import.meta.url));

const addFormats = addFormatsModule as unknown as (ajv: Ajv) => Ajv;

describe('SARIF output', () => {
  it.skipIf(!existsSync(SCHEMA))('validates against the SARIF 2.1.0 schema', () => {
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA, 'utf8')) as object);

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
