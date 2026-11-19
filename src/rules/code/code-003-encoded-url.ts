import { foldName } from '../../names.js';
import { baseName } from '../../paths.js';
import type { Finding, Rule } from '../../types.js';
import { clip } from '../util.js';
import { firstPartyFiles, numberedLines } from './files.js';

// Loaders keep the address of their next stage in .env as base64, disguised as an
// API key (NVISO 2025, Microsoft 2026). Real secrets rarely decode to a URL.

const ENV_FILE = /^\.env(\..+)?$|\.env$/;
const ASSIGNMENT =
  /^\s*(?:export\s+)?[A-Za-z_][\w.-]*\s*=\s*['"]?([A-Za-z0-9+/_-]{16,}={0,2})['"]?\s*$/;
/** JSON and paste stores those loaders read from. */
const PAYLOAD_HOSTS =
  /(^|\.)(jsonkeeper\.com|jsonsilo\.com|npoint\.io|vercel\.app|pastebin\.com|ipfs\.io|docs\.google\.com|gist\.githubusercontent\.com)$/;

function decodedUrl(value: string): URL | undefined {
  const text = Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString(
    'utf8',
  );
  if (!/^https?:\/\/[^\s]+$/.test(text)) return undefined;
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
}

export const CODE_003: Rule = {
  id: 'CODE-003',
  title: 'Environment file hides a URL as base64',
  severity: 'medium',
  status: 'experimental',
  references: [
    'https://blog.nviso.eu/2025/11/13/contagious-interview-actors-now-utilize-json-storage-services-for-malware-delivery/',
  ],
  run(ctx) {
    return firstPartyFiles(ctx).flatMap((entry): Finding[] => {
      if (!ENV_FILE.test(foldName(baseName(entry.path))) || entry.size > 64 * 1024) return [];
      return numberedLines(ctx.readText(entry.path) ?? '').flatMap(([line, row]): Finding[] => {
        const value = ASSIGNMENT.exec(row)?.[1];
        const url = value === undefined ? undefined : decodedUrl(value);
        if (url === undefined) return [];
        const store = PAYLOAD_HOSTS.test(url.hostname);
        return [
          {
            ruleId: 'CODE-003',
            severity: store ? 'high' : 'medium',
            file: entry.path,
            line,
            evidence: clip(`${row.trim()} (decodes to ${url.href})`, 200),
            message:
              'This value looks like a key but decodes to a URL. Loaders in fake job-interview repositories keep the address of their next stage this way' +
              (store ? ', often on a JSON or paste store like this one.' : '.'),
            remediation: `Find out what reads this value in the code before running the project.`,
          },
        ];
      });
    });
  },
};
