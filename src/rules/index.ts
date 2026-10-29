import type { Rule } from '../types.js';
import { GIT_001 } from './git/git-001-fsmonitor.js';

/** Every rule shipped with agentsapper, in catalog order. */
export const ALL_RULES: readonly Rule[] = [GIT_001];
