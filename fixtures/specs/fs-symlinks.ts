import type { FixtureSpec } from '../spec.js';
import { SOURCES } from './helpers.js';

export const specs: FixtureSpec[] = [
  {
    id: 'fs-001-outside',
    description:
      'GhostApproval: symlinks whose targets leave the repo, so an agent reading or writing ' +
      '"inside the workspace" actually touches files elsewhere.',
    kind: 'malicious',
    source: SOURCES.ghostApproval,
    files: [
      { type: 'symlink', path: 'docs/shared', target: '../../outside/data', targetType: 'dir' },
      { type: 'symlink', path: 'assets', target: '{{OUTSIDE}}/data', targetType: 'dir' },
      // A chain: the first hop stays inside, the second leaves.
      { type: 'symlink', path: 'build/out', target: '../assets', targetType: 'dir' },
    ],
    outside: [{ type: 'dir', path: 'data' }],
    expect: [
      { ruleId: 'FS-001', severity: 'high', file: 'docs/shared' },
      { ruleId: 'FS-001', severity: 'high', file: 'assets' },
      { ruleId: 'FS-001', severity: 'high', file: 'build/out' },
    ],
  },
  {
    id: 'fs-002-sensitive',
    description: 'Symlinks into credential stores and system config.',
    kind: 'malicious',
    source: SOURCES.ghostApproval,
    files: [
      { type: 'symlink', path: 'keys', target: '/home/dev/.ssh', targetType: 'dir' },
      { type: 'symlink', path: 'cloud', target: '/Users/dev/.aws', targetType: 'dir' },
      { type: 'symlink', path: 'system', target: '/etc', targetType: 'dir' },
      // Sensitive and inside an agent config dir: reported once, at the higher severity.
      { type: 'symlink', path: '.claude/agents', target: '/root', targetType: 'dir' },
    ],
    expect: [
      { ruleId: 'FS-002', severity: 'critical', file: 'keys' },
      { ruleId: 'FS-002', severity: 'critical', file: 'cloud' },
      { ruleId: 'FS-002', severity: 'critical', file: 'system' },
      { ruleId: 'FS-002', severity: 'critical', file: '.claude/agents' },
    ],
  },
  {
    id: 'fs-003-config-dirs',
    description:
      'Symlinks inside agent and IDE config dirs, or replacing instruction files, hide what the ' +
      'agent will load even when they point inside the repo.',
    kind: 'malicious',
    source: SOURCES.ghostApproval,
    files: [
      { type: 'dir', path: 'shared/commands' },
      {
        type: 'symlink',
        path: '.claude/commands',
        target: '../shared/commands',
        targetType: 'dir',
      },
      { type: 'dir', path: 'shared/vscode' },
      { type: 'symlink', path: 'pkg/.vscode', target: '../shared/vscode', targetType: 'dir' },
      { type: 'file', path: 'docs/agent.md', content: '# Notes\n' },
      { type: 'symlink', path: 'CLAUDE.md', target: 'docs/agent.md', targetType: 'file' },
    ],
    expect: [
      { ruleId: 'FS-003', severity: 'high', file: '.claude/commands' },
      { ruleId: 'FS-003', severity: 'high', file: 'pkg/.vscode' },
      { ruleId: 'FS-003', severity: 'high', file: 'CLAUDE.md' },
    ],
  },
  {
    id: 'benign-internal-symlinks',
    description:
      'Ordinary symlinks that stay inside the repo, plus circular and dangling ones: no findings, ' +
      'and the scan terminates.',
    kind: 'benign',
    files: [
      { type: 'dir', path: 'docs/v2' },
      { type: 'symlink', path: 'docs/latest', target: 'v2', targetType: 'dir' },
      { type: 'dir', path: 'a' },
      { type: 'symlink', path: 'a/loop', target: '..', targetType: 'dir' },
      { type: 'symlink', path: 'b', target: 'c', targetType: 'dir' },
      { type: 'symlink', path: 'c', target: 'b', targetType: 'dir' },
      { type: 'symlink', path: 'dangling', target: 'missing/dir', targetType: 'dir' },
    ],
    expect: [],
  },
];
