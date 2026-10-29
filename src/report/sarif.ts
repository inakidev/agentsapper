import { pathToFileURL } from 'node:url';
import type { ScanResult } from '../scan.js';
import type { Severity } from '../severity.js';
import type { RuleInfo } from '../types.js';

// SARIF 2.1.0 for GitHub code scanning and other consumers.
// https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
// https://docs.github.com/en/code-security/reference/code-scanning/sarif-files/sarif-support

const LEVEL: Readonly<Record<Severity, 'error' | 'warning' | 'note'>> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

/** GitHub maps security-severity (0-10) onto its own critical/high/medium/low labels. */
const SECURITY_SEVERITY: Readonly<Record<Severity, string>> = {
  critical: '9.5',
  high: '8.0',
  medium: '5.5',
  low: '3.0',
  info: '0.0',
};

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

function rule(info: RuleInfo) {
  return {
    id: info.id,
    name: info.id.replace('-', ''),
    shortDescription: { text: info.title },
    fullDescription: { text: info.title },
    ...(info.references[0] === undefined ? {} : { helpUri: info.references[0] }),
    help: { text: `References:\n${info.references.map((r) => `- ${r}`).join('\n')}` },
    defaultConfiguration: { level: LEVEL[info.severity] },
    properties: {
      tags: ['security', info.id.split('-')[0]?.toLowerCase() ?? ''],
      precision: info.status === 'stable' ? 'high' : 'medium',
      'security-severity': SECURITY_SEVERITY[info.severity],
      status: info.status,
    },
  };
}

export function formatSarif(result: ScanResult, version: string): string {
  const index = new Map(result.rules.map((r, i) => [r.id, i]));
  const notifications = [
    ...result.incomplete.map((text) => ({
      level: 'warning',
      message: { text: `Scan incomplete: ${text}` },
    })),
    ...result.errors.map((e) => ({
      level: 'error',
      message: { text: `${e.ruleId} failed: ${e.message}` },
    })),
  ];

  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'agentsapper',
            version,
            informationUri: 'https://github.com/inakidev/agentsapper',
            rules: result.rules.map(rule),
          },
        },
        originalUriBaseIds: {
          SRCROOT: { uri: `${pathToFileURL(result.root).href.replace(/\/?$/, '/')}` },
        },
        invocations: [
          {
            executionSuccessful: result.errors.length === 0 && result.incomplete.length === 0,
            ...(notifications.length > 0 ? { toolExecutionNotifications: notifications } : {}),
          },
        ],
        results: result.findings.map((f) => ({
          ruleId: f.ruleId,
          ...(index.has(f.ruleId) ? { ruleIndex: index.get(f.ruleId) } : {}),
          level: LEVEL[f.severity],
          message: { text: `${f.message} Fix: ${f.remediation}` },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: encodePath(f.file), uriBaseId: 'SRCROOT' },
                ...(f.line === undefined ? {} : { region: { startLine: f.line } }),
              },
            },
          ],
          properties: { severity: f.severity, evidence: f.evidence },
        })),
      },
    ],
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}
