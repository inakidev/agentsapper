#!/usr/bin/env node
// Shallow-clones the benign corpus OUTSIDE this repository, for measuring false
// positives (npm run eval). Usage: node scripts/fetch-benign-corpus.mjs [dir]
// Default dir: $AGENTSAPPER_CORPUS or <os temp>/agentsapper-corpus.
//
// These are well-known legitimate projects, not fixtures. Hooks are disabled for
// the clone anyway, and only `git clone` and `git rev-parse` are run.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const list = JSON.parse(readFileSync(new URL('./benign-corpus.json', import.meta.url), 'utf8'));
const dir =
  process.argv[2] ?? process.env.AGENTSAPPER_CORPUS ?? join(tmpdir(), 'agentsapper-corpus');
mkdirSync(dir, { recursive: true });

const git = (args, cwd) =>
  execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();

const manifest = { fetchedAt: new Date().toISOString(), platform: process.platform, repos: [] };
for (const repo of list.repos) {
  const target = join(dir, repo.name);
  let checkout = 'complete';
  if (!existsSync(target)) {
    console.log(`cloning ${repo.url}`);
    try {
      git(
        [
          '-c',
          'core.longpaths=true',
          'clone',
          '--quiet',
          '--depth',
          '1',
          '--single-branch',
          '--no-tags',
          repo.url,
          target,
        ],
        dir,
      );
    } catch {
      // Some trees cannot be fully checked out on some platforms (path length, reserved names).
      if (!existsSync(join(target, '.git'))) throw new Error(`clone failed: ${repo.url}`);
      checkout = 'partial';
      console.log(`  checkout incomplete on ${process.platform}; scanning what was written`);
    }
  } else {
    console.log(`already present: ${repo.name}`);
  }
  manifest.repos.push({ ...repo, commit: git(['rev-parse', 'HEAD'], target), checkout });
}
writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`corpus ready in ${dir}`);
