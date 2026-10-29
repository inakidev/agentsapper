import type { Rule } from '../types.js';
import { GIT_001 } from './git/git-001-fsmonitor.js';
import { GIT_002 } from './git/git-002-exec-keys.js';

/** Every rule shipped with agentsapper, in catalog order. */
export const ALL_RULES: readonly Rule[] = [GIT_001, GIT_002];
