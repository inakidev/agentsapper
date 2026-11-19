import { foldName } from '../../names.js';
import { baseName } from '../../paths.js';
import type { Finding, Rule } from '../../types.js';
import { firstPartyFiles } from '../code/files.js';

// Fake job-interview repositories ship script text named like a font, an image or a
// spell-check dictionary, and a VS Code task runs it with node (IDE-003). Only the
// first bytes are read: real fonts and images start with a fixed signature.

const HEAD_BYTES = 4096;

const starts = (head: Uint8Array, ...bytes: number[]) => bytes.every((b, i) => head[i] === b);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

const SIGNATURES: Readonly<Record<string, (head: Uint8Array) => boolean>> = {
  woff2: (h) => starts(h, ...ascii('wOF2')),
  woff: (h) => starts(h, ...ascii('wOFF')),
  ttf: (h) => starts(h, 0, 1, 0, 0) || starts(h, ...ascii('true')) || starts(h, ...ascii('OTTO')),
  otf: (h) => starts(h, ...ascii('OTTO')) || starts(h, 0, 1, 0, 0),
  eot: (h) => h[34] === 0x4c && h[35] === 0x50,
  png: (h) => starts(h, 0x89, 0x50, 0x4e, 0x47),
  jpg: (h) => starts(h, 0xff, 0xd8, 0xff),
  jpeg: (h) => starts(h, 0xff, 0xd8, 0xff),
  gif: (h) => starts(h, ...ascii('GIF8')),
  ico: (h) => starts(h, 0, 0, 1, 0),
  bmp: (h) => starts(h, ...ascii('BM')),
  webp: (h) => starts(h, ...ascii('RIFF')),
  // A word list has no signature; script tokens alone give it away.
  dict: () => false,
};

const SCRIPT =
  /\b(require|function|const|let|var|eval|import|exports|module\.exports|child_process)\b|=>/;

function looksLikeScript(head: Uint8Array): boolean {
  if (head.includes(0)) return false;
  return SCRIPT.test(new TextDecoder('utf-8').decode(head));
}

export const FS_005: Rule = {
  id: 'FS-005',
  title: 'Script disguised as a font, image or dictionary file',
  severity: 'high',
  status: 'stable',
  references: [
    'https://www.trendmicro.com/en_gb/research/26/d/void-dokkaebi-uses-fake-job-interview-lure-to-spread-malware-via-code-repositories.html',
    'https://radar.securityalliance.org/vs-code-tasks-abuse-by-contagious-interview-dprk/',
  ],
  run(ctx) {
    return firstPartyFiles(ctx).flatMap((entry): Finding[] => {
      const name = foldName(baseName(entry.path));
      const ext = name.slice(name.lastIndexOf('.') + 1);
      const signature = SIGNATURES[ext];
      if (signature === undefined || !Object.hasOwn(SIGNATURES, ext) || entry.size === 0) return [];
      const head = ctx.readHead(entry.path, HEAD_BYTES);
      if (head === undefined || signature(head) || !looksLikeScript(head)) return [];
      return [
        {
          ruleId: 'FS-005',
          severity: 'high',
          file: entry.path,
          evidence: `.${ext} file whose content is script text`,
          message: `This file is named like a .${ext} file, but it holds script text. Fake job-interview repositories hide their payload this way and run it with node from a VS Code task.`,
          remediation: `Delete ${entry.path}, and check .vscode/tasks.json and package.json scripts for anything that runs it.`,
        },
      ];
    });
  },
};
