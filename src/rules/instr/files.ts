import type { ScanContext } from '../../types.js';
import { filesMatching } from '../agent/common.js';

// Instruction files agents load as context, from the brief plus the locations
// verified while implementing the AGENT rules (Claude Code, Cursor, Codex,
// Gemini CLI, Copilot docs). The root README is scanned at lower severity.
const AGENT_INSTRUCTIONS = [
  /(^|\/)(CLAUDE|CLAUDE\.local|AGENTS|AGENTS\.override|GEMINI)\.md$/,
  /(^|\/)\.(cursorrules|windsurfrules|clinerules)$/,
  /(^|\/)\.cursor\/rules\/.+\.mdc$/,
  /(^|\/)\.claude\/(rules|commands|agents|output-styles)\/.+\.md$/,
  /(^|\/)\.claude\/skills\/.+\/SKILL\.md$/,
  /(^|\/)\.github\/copilot-instructions\.md$/,
  /(^|\/)\.github\/instructions\/.+\.instructions\.md$/,
  /(^|\/)\.github\/prompts\/.+\.prompt\.md$/,
  /(^|\/)\.gemini\/commands\/.+\.toml$/,
];
const ROOT_README = /^README(\.(md|markdown|txt|rst))?$/i;

export interface InstructionFile {
  readonly path: string;
  /** READMEs are read by agents too, but usually written for humans. */
  readonly readme: boolean;
}

export function instructionFiles(ctx: ScanContext): InstructionFile[] {
  return ctx.memo('instr:files', () => [
    ...AGENT_INSTRUCTIONS.flatMap((pattern) => filesMatching(ctx, pattern))
      .filter((path, i, all) => all.indexOf(path) === i)
      .map((path) => ({ path, readme: false })),
    ...filesMatching(ctx, ROOT_README).map((path) => ({ path, readme: true })),
  ]);
}

/** 1-based line of a character offset. */
export function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
