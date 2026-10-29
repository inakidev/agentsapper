import { isObject, isString } from '../../parsers/jsonc.js';
import type { Finding, Rule } from '../../types.js';
import { at, filesMatching, lineOf, readJsonc } from '../agent/common.js';
import { clip } from '../util.js';

// npm runs these on `npm install` in the project (https://docs.npmjs.com/cli/using-npm/scripts),
// which agents often do unprompted. Dependencies' own scripts are out of scope.

const PACKAGE_JSON = /(^|\/)package\.json$/;
const LIFECYCLE = ['preinstall', 'install', 'postinstall', 'preprepare', 'prepare', 'postprepare'];

const SUSPICIOUS: readonly { re: RegExp; what: string }[] = [
  {
    re: /\b(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b/i,
    what: 'downloads something',
  },
  { re: /\bhttps?:\/\//i, what: 'contacts a URL' },
  { re: /\beval\b|\bnew Function\b/, what: 'evaluates code' },
  { re: /\bbase64\b|\batob\b|Buffer\.from\([^)]*['"]base64['"]/i, what: 'decodes base64' },
  { re: /\|\s*(sh|bash|zsh|node|python3?)\b/, what: 'pipes into an interpreter' },
  { re: /\b(powershell|pwsh)\b[^|]*\s-(e|enc|encodedcommand)\b/i, what: 'runs encoded PowerShell' },
];

export const PKG_001: Rule = {
  id: 'PKG-001',
  title: 'package.json has install lifecycle scripts',
  severity: 'info',
  status: 'stable',
  references: [
    'https://docs.npmjs.com/cli/using-npm/scripts',
    'https://docs.npmjs.com/cli/commands/npm-install',
  ],
  run(ctx) {
    return filesMatching(ctx, PACKAGE_JSON).flatMap((file) => {
      const json = readJsonc(ctx, file);
      const scripts = json === undefined ? undefined : at(json, 'scripts');
      if (json === undefined || !isObject(scripts)) return [];
      return LIFECYCLE.flatMap((name): Finding[] => {
        const script = scripts[name];
        if (!isString(script) || script.trim() === '') return [];
        const reasons = SUSPICIOUS.filter((s) => s.re.test(script)).map((s) => s.what);
        const line = lineOf(json, 'scripts', name);
        return [
          {
            ruleId: 'PKG-001',
            severity: reasons.length > 0 ? 'high' : 'info',
            file,
            ...(line === undefined ? {} : { line }),
            evidence: clip(`scripts.${name}: ${script}`),
            message:
              `npm runs this ${name} script on npm install in this project.` +
              (reasons.length > 0
                ? ` It ${reasons.join(', ')}.`
                : ' It looks routine, but it runs code from the repo.'),
            remediation: `Read scripts.${name} in ${file}, or install with --ignore-scripts.`,
          },
        ];
      });
    });
  },
};
