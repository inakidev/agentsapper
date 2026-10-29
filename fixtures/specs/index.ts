import type { FixtureSpec } from '../spec.js';
import { specs as benignGit } from './benign-git.js';
import { specs as git001 } from './git-001-fsmonitor.js';
import { specs as git002 } from './git-002-exec-keys.js';

export const ALL_SPECS: readonly FixtureSpec[] = [...benignGit, ...git001, ...git002];
