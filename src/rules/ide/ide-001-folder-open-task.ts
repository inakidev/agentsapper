import { isObject, isString } from '../../parsers/jsonc.js';
import { parentOf } from '../../paths.js';
import type { Finding, Rule } from '../../types.js';
import { at, filesMatching, lineOf, readJsonc } from '../agent/common.js';
import { clip } from '../util.js';

// https://code.visualstudio.com/docs/debugtest/tasks: runOptions.runOn "folderOpen"
// runs the task when the folder is opened. Automatic tasks never run in an
// untrusted workspace; with task.allowAutomaticTasks "on" they run without a prompt.

const TASKS = /(^|\/)\.vscode\/tasks\.json$/;

function commandOf(task: Record<string, unknown>): string {
  const command = task.command;
  const head = isString(command)
    ? command
    : Array.isArray(command)
      ? command.filter(isString).join(' ')
      : '';
  const args = Array.isArray(task.args) ? task.args.filter(isString).join(' ') : '';
  return `${head} ${args}`.trim();
}

export const IDE_001: Rule = {
  id: 'IDE-001',
  title: 'VS Code task runs when the folder is opened',
  severity: 'high',
  status: 'stable',
  references: [
    'https://code.visualstudio.com/docs/debugtest/tasks',
    'https://code.visualstudio.com/docs/editing/workspaces/workspace-trust',
  ],
  run(ctx) {
    return filesMatching(ctx, TASKS).flatMap((file) => {
      const json = readJsonc(ctx, file);
      const tasks = json === undefined ? undefined : at(json, 'tasks');
      if (json === undefined || !Array.isArray(tasks)) return [];

      const settings = readJsonc(ctx, `${parentOf(file)}/settings.json`);
      const automatic = settings !== undefined && at(settings, 'task.allowAutomaticTasks') === 'on';

      return tasks.flatMap((task, i): Finding[] => {
        if (!isObject(task) || !isObject(task.runOptions) || task.runOptions.runOn !== 'folderOpen')
          return [];
        const label = isString(task.label) ? task.label : `#${i}`;
        const line = lineOf(json, 'tasks', i, 'runOptions', 'runOn');
        return [
          {
            ruleId: 'IDE-001',
            severity: automatic ? 'critical' : 'high',
            file,
            ...(line === undefined ? {} : { line }),
            evidence: clip(`task "${label}": ${commandOf(task)}`),
            message: automatic
              ? 'This task runs as soon as the folder opens, and task.allowAutomaticTasks is "on" in the workspace settings, so VS Code runs it without asking once the workspace is trusted.'
              : 'This task runs as soon as the folder opens in a trusted workspace. Agents and extensions that open the folder trigger it too.',
            remediation: `Remove runOptions.runOn from the "${label}" task in ${file}, or open the folder in Restricted Mode first.`,
          },
        ];
      });
    });
  },
};
