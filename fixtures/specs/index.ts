import type { FixtureSpec } from '../spec.js';
import { specs as agentConfigs } from './agent-configs.js';
import { specs as benignGit } from './benign-git.js';
import { specs as fsSymlinks } from './fs-symlinks.js';
import { specs as git001 } from './git-001-fsmonitor.js';
import { specs as git002 } from './git-002-exec-keys.js';
import { specs as git003004 } from './git-003-004-drivers.js';
import { specs as git005 } from './git-005-include.js';
import { specs as git006 } from './git-006-hooks.js';
import { specs as git007 } from './git-007-escapes.js';
import { specs as git008 } from './git-008-embedded.js';
import { specs as idePkg } from './ide-pkg.js';
import { specs as instrFiles } from './instr-files.js';

export const ALL_SPECS: readonly FixtureSpec[] = [
  ...benignGit,
  ...git001,
  ...git002,
  ...git003004,
  ...git005,
  ...git006,
  ...git007,
  ...git008,
  ...fsSymlinks,
  ...agentConfigs,
  ...instrFiles,
  ...idePkg,
];
