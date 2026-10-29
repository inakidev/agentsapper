import { isObject, isString } from '../../parsers/jsonc.js';
import type { Finding, Rule } from '../../types.js';
import { at, filesMatching, lineOf, readJsonc } from '../agent/common.js';
import { clip } from '../util.js';

// https://containers.dev/implementors/json_reference/: initializeCommand runs on
// the host machine; the other lifecycle commands run inside the container.

const DEVCONTAINER =
  /^(\.devcontainer\.json|\.devcontainer\/devcontainer\.json|\.devcontainer\/[^/]+\/devcontainer\.json)$/;

const COMMANDS: readonly { key: string; host: boolean; when: string }[] = [
  {
    key: 'initializeCommand',
    host: true,
    when: 'on the host, every time the container is built or started',
  },
  { key: 'onCreateCommand', host: false, when: 'inside the container when it is first created' },
  { key: 'updateContentCommand', host: false, when: 'inside the container after it is created' },
  { key: 'postCreateCommand', host: false, when: 'inside the container after it is created' },
  { key: 'postStartCommand', host: false, when: 'inside the container every time it starts' },
  {
    key: 'postAttachCommand',
    host: false,
    when: 'inside the container every time a tool attaches',
  },
];

function render(value: unknown): string {
  if (isString(value)) return value;
  if (Array.isArray(value)) return value.filter(isString).join(' ');
  if (isObject(value)) return Object.values(value).map(render).join(' & ');
  return '';
}

export const IDE_002: Rule = {
  id: 'IDE-002',
  title: 'Dev container runs lifecycle commands',
  severity: 'medium',
  status: 'stable',
  references: ['https://containers.dev/implementors/json_reference/'],
  run(ctx) {
    return filesMatching(ctx, DEVCONTAINER).flatMap((file) => {
      const json = readJsonc(ctx, file);
      if (json === undefined || !isObject(json.value)) return [];
      return COMMANDS.flatMap(({ key, host, when }): Finding[] => {
        const command = render(at(json, key)).trim();
        if (command === '') return [];
        const line = lineOf(json, key);
        return [
          {
            ruleId: 'IDE-002',
            severity: host ? 'high' : 'medium',
            file,
            ...(line === undefined ? {} : { line }),
            evidence: clip(`${key}: ${command}`),
            message:
              `Opening this repo in a dev container runs this command ${when}.` +
              (host ? ' It is not contained: it has your user access on this machine.' : ''),
            remediation: `Read ${key} in ${file} before reopening the folder in a container.`,
          },
        ];
      });
    });
  },
};
