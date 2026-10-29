import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSensitive } from '../../src/rules/fs/links.js';

describe('isSensitive', () => {
  it.each([
    '/etc/passwd',
    '/etc',
    '/private/etc/hosts',
    '/root',
    '/root/notes.txt',
    '/var/run/docker.sock',
    '/home/dev',
    '/home/dev/.ssh/id_ed25519',
    '/Users/dev/.aws/credentials',
    '/home/dev/.config/gcloud',
    '/home/dev/.claude/settings.json',
    'C:\\Users\\dev\\.ssh',
    'C:\\Users\\dev\\AppData\\Roaming\\Code',
    'C:\\Windows\\System32\\config\\SAM',
    join(homedir(), '.ssh'),
  ])('flags %s', (path) => {
    expect(isSensitive(path)).toBe(true);
  });

  it.each([
    '/tmp/build',
    '/home/dev/projects/app',
    '/Users/dev/code/app/README.md',
    '/opt/tools',
    'C:\\Users\\dev\\AppData\\Local\\Temp\\agentsapper-x',
    'D:\\work\\repo',
  ])('does not flag %s', (path) => {
    expect(isSensitive(path)).toBe(false);
  });
});
