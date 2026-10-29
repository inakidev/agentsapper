import type { ScanResult } from '../scan.js';
import { meetsThreshold, SEVERITIES, type Severity } from '../severity.js';
import type { Finding } from '../types.js';
import { escapeForTerminal as esc } from './sanitize.js';

const MOST_SEVERE_FIRST = [...SEVERITIES].reverse();

/** `failOn` is the CLI's --fail-on, so the closing verdict matches the exit code. */
export function formatText(result: ScanResult, failOn: Severity = 'high'): string {
  const titles = new Map(result.rules.map((rule) => [rule.id, rule.title]));
  const plural = result.rules.length === 1 ? '' : 's';
  const lines: string[] = [
    `Scanned ${esc(result.root)} with ${result.rules.length} rule${plural}.`,
    '',
  ];

  if (result.findings.length === 0) {
    lines.push(result.incomplete.length > 0 ? 'No findings in what was scanned.' : 'No findings.');
    lines.push('');
  }

  for (const severity of MOST_SEVERE_FIRST) {
    const group = result.findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;

    lines.push(`== ${severity.toUpperCase()} (${group.length}) ==`, '');
    for (const finding of group) {
      lines.push(...formatFinding(finding, titles.get(finding.ruleId)), '');
    }
  }

  if (result.incomplete.length > 0) {
    lines.push(`Scan incomplete (${result.incomplete.length}): findings may be missing.`);
    for (const reason of result.incomplete) {
      lines.push(`  ${esc(reason)}`);
    }
    lines.push('');
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

  lines.push(verdict(result, failOn));
  return `${lines.join('\n').trimEnd()}\n`;
}

/** What to do, in one sentence that agrees with the exit code. */
function verdict(result: ScanResult, failOn: Severity): string {
  if (result.errors.length > 0 || result.incomplete.length > 0) {
    return 'Verdict: the scan is incomplete, so do not treat this folder as checked.';
  }
  const blocking = result.findings.filter((f) => meetsThreshold(f.severity, failOn)).length;
  if (blocking > 0) {
    const what = blocking === 1 ? 'the finding' : `the ${blocking} findings`;
    return `Verdict: do not open this folder with an agent, an IDE or git until you have read ${what} at ${failOn} or above.`;
  }
  if (result.findings.length > 0) {
    return `Verdict: nothing at ${failOn} or above; the lower findings are worth a look.`;
  }
  return 'Verdict: nothing found. That is not proof the folder is safe; see the limitations in the README.';
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
