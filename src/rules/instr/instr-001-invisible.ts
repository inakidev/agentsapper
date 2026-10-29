import type { Finding, Rule } from '../../types.js';
import { clip } from '../util.js';
import { instructionFiles } from './files.js';

// Tag characters (U+E0000-E007F), zero-width (U+200B-200D, U+2060, U+FEFF) and
// bidi controls (U+202A-202E, U+2066-2069). Tag characters map one-to-one to
// ASCII, so text hidden with them is decoded and shown.
const INVISIBLE =
  /[\u{200b}-\u{200d}\u{2060}\u{feff}\u{202a}-\u{202e}\u{2066}-\u{2069}\u{e0000}-\u{e007f}]/gu;
const PICTOGRAPH = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u{fe0f}/u;
const LETTER = /\p{L}|\p{M}/u;
const hasNonAscii = (s: string) => [...s].some((c) => (c.codePointAt(0) ?? 0) > 0x7f);
const MAX_PER_FILE = 20;

/** Legitimate uses: ZWJ inside emoji sequences, ZWNJ between letters of scripts such as Persian. */
function isLegitimate(cp: number, before: string, after: string): boolean {
  if (cp === 0x200d) return PICTOGRAPH.test(before) && PICTOGRAPH.test(after);
  if (cp === 0x200c) {
    return LETTER.test(before) && LETTER.test(after) && hasNonAscii(before + after);
  }
  return false;
}

const hex = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

export function decodeTags(chars: readonly number[]): string {
  return chars
    .filter((cp) => cp >= 0xe0020 && cp <= 0xe007e)
    .map((cp) => String.fromCharCode(cp - 0xe0000))
    .join('');
}

export const INSTR_001: Rule = {
  id: 'INSTR-001',
  title: 'Invisible Unicode characters in an instruction file',
  severity: 'critical',
  status: 'stable',
  references: [
    'https://embracethered.com/blog/posts/2024/hiding-and-finding-text-with-unicode-tags/',
    'https://www.unicode.org/charts/PDF/UE0000.pdf',
    'https://trojansource.codes/',
  ],
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of instructionFiles(ctx)) {
      const text = ctx.readText(file.path);
      if (text === undefined) continue;
      let count = 0;
      text.split('\n').forEach((row, index) => {
        const chars = [...row];
        const hidden: { cp: number; col: number }[] = [];
        chars.forEach((ch, col) => {
          INVISIBLE.lastIndex = 0;
          if (!INVISIBLE.test(ch)) return;
          const cp = ch.codePointAt(0) ?? 0;
          if (!isLegitimate(cp, chars[col - 1] ?? '', chars[col + 1] ?? ''))
            hidden.push({ cp, col: col + 1 });
        });
        if (hidden.length === 0 || ++count > MAX_PER_FILE) return;

        const decoded = decodeTags(hidden.map((h) => h.cp));
        const kinds = [...new Set(hidden.map((h) => hex(h.cp)))].join(', ');
        findings.push({
          ruleId: 'INSTR-001',
          severity: file.readme ? 'high' : 'critical',
          file: file.path,
          line: index + 1,
          evidence: clip(
            decoded !== ''
              ? `hidden text: "${decoded}"`
              : `${hidden.length} invisible characters (${kinds})`,
            300,
          ),
          message:
            (decoded !== ''
              ? `Unicode tag characters starting at column ${hidden[0]?.col ?? 0} spell out text that is invisible in editors and on GitHub, but that models read as instructions.`
              : `Invisible or bidi control characters (${kinds}) starting at column ${hidden[0]?.col ?? 0} can hide or reorder text so that what you review differs from what the agent reads.`) +
            (file.readme ? ' Agents often read the README too.' : ''),
          remediation: `Remove the invisible characters from ${file.path} and review what the line really says.`,
        });
      });
    }
    return findings;
  },
};
