import type { Finding, Rule } from '../../types.js';
import { readLinked } from '../linked.js';
import { clip } from '../util.js';
import { instructionFiles } from './files.js';

// Instructions telling the agent to download and run code, or carrying an
// encoded payload. Heuristic: install docs legitimately contain some of these.

const PATTERNS: readonly { re: RegExp; what: string }[] = [
  {
    re: /\b(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n|]{0,300}\|\s*(sudo\s+)?(sh|bash|zsh|dash|ksh|python3?|node|perl|ruby|iex|Invoke-Expression|pwsh|powershell)\b/i,
    what: 'pipes a download straight into an interpreter',
  },
  {
    re: /\b(bash|sh|zsh|source)\s+<\(\s*(curl|wget)\b/i,
    what: 'runs a downloaded script through process substitution',
  },
  { re: /\beval\b[^\n]{0,20}\$\(\s*(curl|wget)\b/i, what: 'evaluates a downloaded script' },
  {
    re: /\b(iex|Invoke-Expression)\b[^\n]{0,60}\b(iwr|irm|Invoke-WebRequest|Invoke-RestMethod|DownloadString)\b/i,
    what: 'evaluates a downloaded PowerShell script',
  },
  {
    re: /\b(powershell|pwsh)(\.exe)?\b[^\n]{0,40}\s-(e|enc|encodedcommand)\s+[A-Za-z0-9+/=]{20,}/i,
    what: 'runs an encoded PowerShell command',
  },
  {
    re: /\bbase64\s+(-d|--decode|-D)\b[^\n]{0,60}\|\s*(sh|bash|zsh|python3?|node)\b/i,
    what: 'decodes base64 into an interpreter',
  },
  { re: /\beval\b[^\n]{0,40}\b(base64|atob|b64decode)\b/i, what: 'evaluates decoded base64' },
];

/** Long base64-looking runs mixing cases and digits, so hashes and words do not count. */
const BLOB = /[A-Za-z0-9+/]{200,}={0,2}/;
const looksEncoded = (s: string) => /[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s);

export const INSTR_003: Rule = {
  id: 'INSTR-003',
  title: 'Instruction file asks to download and run code, or carries an encoded payload',
  severity: 'high',
  status: 'experimental',
  references: [
    'https://genai.owasp.org/llmrisk/llm01-prompt-injection/',
    'https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-coding-agent-git-config-rce-20260904-cs/',
  ],
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of instructionFiles(ctx)) {
      const text = readLinked(ctx, file.path);
      if (text === undefined) continue;
      text.split('\n').forEach((row, index) => {
        const hit = PATTERNS.find((p) => p.re.test(row));
        const blob = BLOB.exec(row)?.[0];
        if (hit === undefined && (blob === undefined || !looksEncoded(blob))) return;
        const what = hit?.what ?? `contains a ${blob?.length ?? 0}-character base64 blob`;
        findings.push({
          ruleId: 'INSTR-003',
          severity: file.readme ? 'low' : 'high',
          file: file.path,
          line: index + 1,
          evidence: clip(row.trim(), 200),
          message:
            `This line ${what}. An agent that follows it runs code that never appears in the repository.` +
            (file.readme ? ' In a README this is often a normal install step; check the URL.' : ''),
          remediation: `Do not let an agent follow ${file.path}:${index + 1} until you have read what it downloads.`,
        });
      });
    }
    return findings;
  },
};
