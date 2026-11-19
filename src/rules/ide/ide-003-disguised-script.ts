import { isObject, isString } from '../../parsers/jsonc.js';
import type { Finding, Rule } from '../../types.js';
import { at, filesMatching, lineOf, readJsonc } from '../agent/common.js';
import { clip } from '../util.js';
import { commandsOf } from './ide-001-folder-open-task.js';

// Fake job-interview repositories hide the payload in a file named like a font, an
// image or a dictionary, and a VS Code task or launch config runs it with node (Trend
// Micro, SEAL and OpenSourceMalware, 2026). Nobody runs a .woff2 file legitimately.

const TASKS = /(^|\/)\.vscode\/tasks\.json$/;
const LAUNCH = /(^|\/)\.vscode\/launch\.json$/;
const DISGUISED = String.raw`[^\s"';&|]+\.(?:woff2?|ttf|otf|eot|png|jpe?g|gif|ico|bmp|webp|svg|dict|txt|log|css|map|lock|csv)`;
/** An interpreter, optional flags, then a file with a non-code extension. */
const RUNS_DISGUISED = new RegExp(
  String.raw`(?:^|[\s;&|'"(])(?:node|nodejs|bun|deno(?:\s+run)?|python3?|py|bash|sh|zsh|pwsh|powershell)(?:\.exe)?\s+(?:-\S+\s+)*["']?(${DISGUISED})(?=$|[\s"';&|)])`,
  'i',
);
const PROGRAM = new RegExp(String.raw`^${DISGUISED}$`, 'i');

function finding(
  file: string,
  line: number | undefined,
  severity: Finding['severity'],
  what: string,
  evidence: string,
): Finding {
  return {
    ruleId: 'IDE-003',
    severity,
    file,
    ...(line === undefined ? {} : { line }),
    evidence: clip(evidence),
    message: `${what} runs a file with a non-code extension as a script. Fake job-interview repositories hide their payload in fake fonts, images or dictionaries this way.`,
    remediation: `Remove that entry from ${file} and check the file it runs (see FS-005).`,
  };
}

export const IDE_003: Rule = {
  id: 'IDE-003',
  title: 'VS Code task or launch config runs a file disguised as data',
  severity: 'high',
  status: 'stable',
  references: [
    'https://www.trendmicro.com/en_gb/research/26/d/void-dokkaebi-uses-fake-job-interview-lure-to-spread-malware-via-code-repositories.html',
    'https://radar.securityalliance.org/vs-code-tasks-abuse-by-contagious-interview-dprk/',
  ],
  run(ctx) {
    const tasks = filesMatching(ctx, TASKS).flatMap((file) => {
      const json = readJsonc(ctx, file);
      const list = json === undefined ? undefined : at(json, 'tasks');
      if (json === undefined || !Array.isArray(list)) return [];
      return list.flatMap((task, i): Finding[] => {
        if (!isObject(task)) return [];
        const hit = commandsOf(task).find((c) => RUNS_DISGUISED.test(c));
        if (hit === undefined) return [];
        const onOpen = isObject(task.runOptions) && task.runOptions.runOn === 'folderOpen';
        const line =
          lineOf(json, 'tasks', i, 'command') ??
          ['osx', 'linux', 'windows']
            .map((os) => lineOf(json, 'tasks', i, os, 'command'))
            .find((l) => l !== undefined);
        const label = isString(task.label) ? task.label : `#${i}`;
        return [
          finding(
            file,
            line,
            onOpen ? 'critical' : 'high',
            onOpen ? `Task "${label}" runs when the folder opens and` : `Task "${label}"`,
            `task "${label}": ${hit}`,
          ),
        ];
      });
    });

    const launches = filesMatching(ctx, LAUNCH).flatMap((file) => {
      const json = readJsonc(ctx, file);
      const list = json === undefined ? undefined : at(json, 'configurations');
      if (json === undefined || !Array.isArray(list)) return [];
      return list.flatMap((config, i): Finding[] => {
        if (!isObject(config) || !isString(config.program)) return [];
        const program = config.program.replace(/^\$\{workspace(Folder|Root)\}[\\/]?/, '');
        if (!PROGRAM.test(program)) return [];
        return [
          finding(
            file,
            lineOf(json, 'configurations', i, 'program'),
            'high',
            'This launch configuration',
            `program: ${config.program}`,
          ),
        ];
      });
    });
    return [...tasks, ...launches];
  },
};
