import type { Severity } from '../../severity.js';
import type { Finding, Rule } from '../../types.js';
import { readLinked } from '../linked.js';
import { clip } from '../util.js';
import { instructionFiles } from './files.js';

// Instructions telling the agent to download and run code, or carrying an
// encoded payload. Heuristic: install docs legitimately contain some of these.

const DOWNLOAD_PIPE =
  /\b(?:curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n|]{0,300}\|\s*(?:sudo\s+)?(sh|bash|zsh|dash|ksh|python3?|node|perl|ruby|iex|Invoke-Expression|pwsh|powershell)\b([^\n]*)/i;

/** Flags that make the interpreter run code given on the command line instead of stdin. */
const INLINE_CODE_FLAG: Readonly<Record<string, RegExp>> = {
  sh: /^-[a-z]*c/,
  bash: /^-[a-z]*c/,
  zsh: /^-[a-z]*c/,
  dash: /^-[a-z]*c/,
  ksh: /^-[a-z]*c/,
  python: /^-[a-zA-Z]*[cm]/,
  node: /^(-[ep]|--eval|--print)/,
  perl: /^-[a-zA-Z]*e/,
  ruby: /^-[a-zA-Z]*e/,
};

/**
 * Inline code that may run what it reads, such as exec(sys.stdin.read()). This is a
 * blocklist, and obfuscated code gets past it, which is why plain data pipes are
 * still reported (at low) instead of dropped.
 */
const EXECUTES_INPUT: readonly RegExp[] = [
  // Calls that run code or commands: exec, execfile, execSync, os.system, os.popen, ...
  /\b(exec\w*|eval|compile|_compile|system|popen\w*|spawn\w*|run\w*Context|instance_eval|Function|Script|getattr)\s*\(/,
  // Modules and builtins that run, deserialize or dynamically load code.
  /\b(subprocess|child_process|runpy|importlib|pickle|cPickle|marshal|dill|ctypes|builtins|__builtins__|__import__)\b/,
  // eval without parentheses (Perl, shell), Perl qx and Ruby %x.
  /\beval\b|\bqx\b|%x\W/,
];

const SHELLS = /^(sh|bash|zsh|dash|ksh)$/;
/** Shell code that runs its input, or hands it to another interpreter. */
const SHELL_RUNS_INPUT =
  /\/dev\/stdin|\$\(\s*cat\b|`\s*cat\b|\b(source|xargs|sh|bash|zsh|dash|ksh|python3?|node|perl|ruby)\b/;

export type DownloadPipe =
  /** The interpreter runs the download as its program: `| sh`, `| python3 -`, `| bash -s`. */
  | 'program'
  /** The download goes to inline code that appears to execute it. */
  | 'inline-exec'
  /** The download is input data for inline code or a script file. */
  | 'data';

/**
 * Classifies `curl ... | interpreter` lines. Whether inline code executes its input
 * is undecidable in general, so data pipes are still reported, at low severity
 * (benign example: cline/cline; evasive example: `| python3 -c "exec(sys.stdin.read())"`).
 */
export function classifyDownloadPipe(row: string): DownloadPipe | undefined {
  const match = DOWNLOAD_PIPE.exec(row);
  if (match === null) return undefined;
  const interpreter = (match[1] ?? '').toLowerCase();
  if (/^(iex|invoke-expression|pwsh|powershell)$/.test(interpreter)) return 'program';
  const inline = INLINE_CODE_FLAG[interpreter.replace(/3$/, '')];
  const command = (match[2] ?? '').split(/[|;&)`]/)[0]?.trim() ?? '';
  for (const arg of command.split(/\s+/)) {
    if (arg === '' || arg === '-' || arg === '--' || arg.startsWith('-s')) return 'program';
    if (inline?.test(arg) === true) {
      const code = match[2] ?? '';
      const runs =
        EXECUTES_INPUT.some((re) => re.test(code)) ||
        (SHELLS.test(interpreter) && SHELL_RUNS_INPUT.test(code));
      return runs ? 'inline-exec' : 'data';
    }
    if (arg.startsWith('-')) continue; // other interpreter flags
    return /^[\w./~$]/.test(arg) ? 'data' : 'program'; // a script path reads the download as input
  }
  return 'program';
}

const PATTERNS: readonly { re: RegExp; what: string }[] = [
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

interface Hit {
  readonly what: string;
  /** Data pipes are a weaker signal than code that clearly runs the download. */
  readonly weak: boolean;
}

function inspect(row: string): Hit | undefined {
  const pipe = classifyDownloadPipe(row);
  if (pipe === 'program')
    return { what: 'pipes a download straight into an interpreter', weak: false };
  if (pipe === 'inline-exec') {
    return { what: 'pipes a download into inline code that appears to execute it', weak: false };
  }
  const pattern = PATTERNS.find((p) => p.re.test(row));
  if (pattern !== undefined) return { what: pattern.what, weak: false };
  const blob = BLOB.exec(row)?.[0];
  if (blob !== undefined && looksEncoded(blob)) {
    return { what: `contains a ${blob.length}-character base64 blob`, weak: false };
  }
  if (pipe === 'data') {
    return {
      what: 'pipes a download into inline code or a script as input; that code could still run what it reads',
      weak: true,
    };
  }
  return undefined;
}

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
        const hit = inspect(row);
        if (hit === undefined) return;
        const severity: Severity = hit.weak
          ? file.readme
            ? 'info'
            : 'low'
          : file.readme
            ? 'low'
            : 'high';
        findings.push({
          ruleId: 'INSTR-003',
          severity,
          file: file.path,
          line: index + 1,
          evidence: clip(row.trim(), 200),
          message:
            `This line ${hit.what}. An agent that follows it runs code that never appears in the repository.` +
            (file.readme ? ' In a README this is often a normal install step; check the URL.' : ''),
          remediation: `Do not let an agent follow ${file.path}:${index + 1} until you have read what it downloads.`,
        });
      });
    }
    return findings;
  },
};
