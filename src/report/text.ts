import type { ScanResult } from '../scan.js';
import { SEVERITIES } from '../severity.js';
import type { Finding } from '../types.js';
import { escapeForTerminal as esc } from './sanitize.js';

const MOST_SEVERE_FIRST = [...SEVERITIES].reverse();

export function formatText(result: ScanResult): string {
  const titles = new Map(result.rules.map((rule) => [rule.id, rule.title]));
  const plural = result.rules.length === 1 ? '' : 's';
  const lines: string[] = [
    `Scanned ${esc(result.root)} with ${result.rules.length} rule${plural}.`,
    '',
  ];

  if (result.findings.length === 0) {
    lines.push('No findings.');
  }

  for (const severity of MOST_SEVERE_FIRST) {
    const group = result.findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;

    lines.push(`== ${severity.toUpperCase()} (${group.length}) ==`, '');
    for (const finding of group) {
      lines.push(...formatFinding(finding, titles.get(finding.ruleId)), '');
    }
  }

  if (result.errors.length > 0) {
    lines.push(`Rule errors (${result.errors.length})`);
    for (const error of result.errors) {
      lines.push(`  ${error.ruleId}  ${esc(error.message)}`);
    }
    lines.push('');
  }

  if (result.findings.length > 0) {
    const counts = MOST_SEVERE_FIRST.map(
      (severity) => `${result.findings.filter((f) => f.severity === severity).length} ${severity}`,
    );
    lines.push(`Summary: ${counts.join(', ')}.`);
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function formatFinding(finding: Finding, title: string | undefined): string[] {
  const location = finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
  return [
    title === undefined ? finding.ruleId : `${finding.ruleId}  ${title}`,
    `  location: ${esc(location)}`,
    `  evidence: ${esc(finding.evidence)}`,
    `  why:      ${esc(finding.message)}`,
    `  fix:      ${esc(finding.remediation)}`,
  ];
}
