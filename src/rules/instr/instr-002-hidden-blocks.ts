import type { Finding, Rule } from '../../types.js';
import { clip } from '../util.js';
import { instructionFiles, lineAt } from './files.js';

// Text that renders as nothing (HTML comments, markdown comment links) or
// collapsed (<details>) but that agents still read. Flagged only when it reads
// like an instruction aimed at the agent: a signal to review, not a verdict.

const BLOCKS = [
  /<!--([\s\S]*?)(?:-->|$)/g,
  /<details\b[^>]*>([\s\S]*?)<\/details>/gi,
  /^\[(?:\/\/|comment)\]:\s*(?:#|<>)\s*\(([^)\n]*)\)/gim,
];

const AGENT = '(?:ai|assistant|agent|llm|model|claude|copilot|gemini|codex|cursor|chatgpt)s?';
const IMPERATIVE = [
  /\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|earlier|all|any|other)\b.{0,20}\b(instructions?|rules|prompts?|guidelines)\b/i,
  new RegExp(`\\b(you are|you're|act as|pretend to be)\\b.{0,30}\\b${AGENT}\\b`, 'i'),
  new RegExp(`\\b${AGENT}\\b.{0,60}\\b(must|should|always|never|need to|are required to)\\b`, 'i'),
  /\bdo not\b.{0,20}\b(tell|inform|mention|reveal|show|alert|notify)\b.{0,20}\b(the )?(user|developer|human|reviewer)s?\b/i,
  /\bwithout (asking|telling|confirmation|approval|permission|prompting)\b/i,
  /\b(send|upload|post|exfiltrate|forward|copy)\b.{0,60}\b(\.env|secrets?|tokens?|api[_ -]?keys?|credentials?|ssh|passwords?)\b/i,
  /\bsystem prompt\b/i,
];

export const INSTR_002: Rule = {
  id: 'INSTR-002',
  title: 'Hidden or collapsed text with instructions aimed at the agent',
  severity: 'medium',
  status: 'experimental',
  references: [
    'https://genai.owasp.org/llmrisk/llm01-prompt-injection/',
    'https://adversa.ai/blog/top-ai-coding-agent-security-resources-october-2026/',
  ],
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of instructionFiles(ctx)) {
      const text = ctx.readText(file.path);
      if (text === undefined) continue;
      for (const pattern of BLOCKS) {
        for (const match of text.matchAll(pattern)) {
          const body = (match[1] ?? '').replace(/\s+/g, ' ').trim();
          if (!IMPERATIVE.some((re) => re.test(body))) continue;
          findings.push({
            ruleId: 'INSTR-002',
            severity: file.readme ? 'low' : 'medium',
            file: file.path,
            line: lineAt(text, match.index),
            evidence: clip(body, 240),
            message:
              'This text is hidden when the file is rendered (comment or collapsed block) but agents read it, ' +
              'and it is phrased as an instruction to them. Heuristic: review it, it may be benign.',
            remediation: `Read the hidden block in ${file.path} and remove it if it is not meant for you.`,
          });
        }
      }
    }
    return findings;
  },
};
