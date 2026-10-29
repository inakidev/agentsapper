import type { Rule } from '../types.js';
import { GIT_001 } from './git/git-001-fsmonitor.js';
import { GIT_002 } from './git/git-002-exec-keys.js';
import { GIT_003 } from './git/git-003-drivers.js';
import { GIT_004 } from './git/git-004-attributes.js';

/** Every rule shipped with agentsapper, in catalog order. */
export const ALL_RULES: readonly Rule[] = [GIT_001, GIT_002, GIT_003, GIT_004];
