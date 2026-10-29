import type { Rule } from '../types.js';
import { FS_001 } from './fs/fs-001-outside.js';
import { FS_002 } from './fs/fs-002-sensitive.js';
import { FS_003 } from './fs/fs-003-agent-config.js';
import { GIT_001 } from './git/git-001-fsmonitor.js';
import { GIT_002 } from './git/git-002-exec-keys.js';
import { GIT_003 } from './git/git-003-drivers.js';
import { GIT_004 } from './git/git-004-attributes.js';
import { GIT_005 } from './git/git-005-include.js';
import { GIT_006 } from './git/git-006-hooks.js';
import { GIT_007 } from './git/git-007-escapes.js';
import { GIT_008 } from './git/git-008-embedded.js';

/** Every rule shipped with agentsapper, in catalog order. */
export const ALL_RULES: readonly Rule[] = [
  GIT_001,
  GIT_002,
  GIT_003,
  GIT_004,
  GIT_005,
  GIT_006,
  GIT_007,
  GIT_008,
  FS_001,
  FS_002,
  FS_003,
];
