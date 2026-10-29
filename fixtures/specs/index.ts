import type { FixtureSpec } from '../spec.js';
import { specs as benignGit } from './benign-git.js';
import { specs as git001 } from './git-001-fsmonitor.js';

export const ALL_SPECS: readonly FixtureSpec[] = [...benignGit, ...git001];
