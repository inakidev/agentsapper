#!/usr/bin/env node
// Fetches the benign corpus OUTSIDE this repository, for measuring false positives
// (npm run eval). Usage: node scripts/fetch-benign-corpus.mjs [dir] [--latest]
// Default dir: $AGENTSAPPER_CORPUS or <os temp>/agentsapper-corpus.
//
// Each repository is checked out at the commit pinned in benign-corpus.json, so
// RESULTS.md can be reproduced exactly. --latest ignores the pins and takes each
// default branch instead (to refresh the corpus; then update the pins).
//
// These are well-known legitimate projects, not fixtures. Hooks are disabled, and
// only git init, fetch, checkout and rev-parse are run.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const latest = args.includes('--latest');
const list = JSON.parse(readFileSync(new URL('./benign-corpus.json', import.meta.url), 'utf8'));
const dir =
  args.find((a) => !a.startsWith('--')) ??
  process.env.AGENTSAPPER_CORPUS ??
  join(tmpdir(), 'agentsapper-corpus');
mkdirSync(dir, { recursive: true });

const git = (gitArgs, cwd) =>
  execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.longpaths=true', ...gitArgs], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();

const head = (target) => {
  try {
    return git(['rev-parse', 'HEAD'], target);
  } catch {
    return undefined;
  }
};

const manifest = {
  fetchedAt: new Date().toISOString(),
  platform: process.platform,
  pinned: !latest,
  repos: [],
};
for (const repo of list.repos) {
  const target = join(dir, repo.name);
  const want = latest ? 'HEAD' : repo.commit;
  let checkout = 'complete';
  if (existsSync(target) && head(target) === want) {
    console.log(`already at ${want.slice(0, 7)}: ${repo.name}`);
  } else {
    console.log(`fetching ${repo.url} at ${latest ? 'its default branch' : want.slice(0, 7)}`);
    if (!existsSync(join(target, '.git'))) {
      mkdirSync(target, { recursive: true });
      git(['init', '--quiet'], target);
      git(['remote', 'add', 'origin', repo.url], target);
    }
    git(['fetch', '--quiet', '--depth', '1', '--no-tags', 'origin', want], target);
    try {
      git(['checkout', '--quiet', '--force', '--detach', 'FETCH_HEAD'], target);
    } catch {
      // Some trees cannot be fully checked out on some platforms (path length, reserved names).
      checkout = 'partial';
      console.log(`  checkout incomplete on ${process.platform}; scanning what was written`);
    }
  }
  manifest.repos.push({ ...repo, commit: head(target), checkout });
}
writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`corpus ready in ${dir}`);
