import type { FixtureSpec } from '../spec.js';
import { specs as benignGit } from './benign-git.js';
import { specs as git001 } from './git-001-fsmonitor.js';
import { specs as git002 } from './git-002-exec-keys.js';
import { specs as git003004 } from './git-003-004-drivers.js';
import { specs as git005 } from './git-005-include.js';

export const ALL_SPECS: readonly FixtureSpec[] = [
  ...benignGit,
  ...git001,
  ...git002,
  ...git003004,
  ...git005,
];
