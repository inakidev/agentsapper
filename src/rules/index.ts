import type { Rule } from '../types.js';
import { IDE_001 } from './ide/ide-001-folder-open-task.js';
import { IDE_002 } from './ide/ide-002-devcontainer.js';
import { PKG_001 } from './pkg/pkg-001-lifecycle-scripts.js';
import { AGENT_001 } from './agent/agent-001-claude-code.js';
import { AGENT_002 } from './agent/agent-002-mcp.js';
import { AGENT_003 } from './agent/agent-003-other-hooks.js';
import { AGENT_004 } from './agent/agent-004-auto-approve.js';
import { INSTR_001 } from './instr/instr-001-invisible.js';
import { INSTR_002 } from './instr/instr-002-hidden-blocks.js';
import { INSTR_003 } from './instr/instr-003-remote-exec.js';
import { FS_001 } from './fs/fs-001-outside.js';
import { FS_002 } from './fs/fs-002-sensitive.js';
import { FS_003 } from './fs/fs-003-agent-config.js';
import { FS_004 } from './fs/fs-004-planted-program.js';
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
  FS_004,
  AGENT_001,
  AGENT_002,
  AGENT_003,
  AGENT_004,
  INSTR_001,
  INSTR_002,
  INSTR_003,
  IDE_001,
  IDE_002,
  PKG_001,
];
