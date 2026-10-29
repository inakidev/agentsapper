import { isWithin, parentOf } from '../paths.js';
import type { ScanContext } from '../types.js';
import { AGENT_CONFIG_DIRS, classifyLinks } from './fs/links.js';

// Config files reached through symlinks inside the repository.
//
// Agents, IDEs and git open config paths with ordinary file APIs, which follow
// links, so a link must not hide what they will load: `.claude/settings.json`
// pointing at `config/innocent.json`, or a whole `.claude` directory pointing at
// `tools/claude`. We still never read through a link: each one is resolved as a
// path (rules/fs/links.ts), and when it ends at a regular file the walker saw
// inside the repo, that file is read by its own path.
//
// Not used for working-tree .gitattributes, because git does not follow those.

export interface ProjectFile {
  /** The path a tool would open, possibly through links. */
  readonly path: string;
  /** The regular file whose content that is. Equal to `path` when no link is involved. */
  readonly real: string;
}

/** Bounds the files exposed through directory links, so a repo cannot blow up the scan. */
const MAX_LINKED_FILES = 50_000;

const inAgentConfigDir = (path: string) => path.split('/').some((s) => AGENT_CONFIG_DIRS.has(s));

export function projectFiles(ctx: ScanContext): readonly ProjectFile[] {
  return ctx.memo('linked:files', () => {
    const files: ProjectFile[] = ctx.entries
      .filter((e) => e.kind === 'file')
      .map((e) => ({ path: e.path, real: e.path }));
    let budget = MAX_LINKED_FILES;

    for (const link of classifyLinks(ctx)) {
      if (link.cls.kind !== 'inside') continue;
      const target = link.cls.dest;
      const kind = target === '' ? 'dir' : ctx.entry(target)?.kind;
      if (kind === 'file') {
        files.push({ path: link.entry.path, real: target });
        continue;
      }
      // Directory links only where agents and IDEs look, and never onto an ancestor (a loop).
      if (kind !== 'dir' || !inAgentConfigDir(link.entry.path)) continue;
      if (isWithin(parentOf(link.entry.path), target)) continue;
      for (const entry of ctx.entries) {
        if (entry.kind !== 'file' || !isWithin(entry.path, target) || entry.path === target)
          continue;
        if (--budget < 0) break;
        files.push({
          path: `${link.entry.path}${entry.path.slice(target.length)}`,
          real: entry.path,
        });
      }
    }
    return files;
  });
}

function realByPath(ctx: ScanContext): ReadonlyMap<string, string> {
  return ctx.memo('linked:real', () => new Map(projectFiles(ctx).map((f) => [f.path, f.real])));
}

/** The regular file behind `path` (itself, or what in-repo links lead to), if any. */
export function realPath(ctx: ScanContext, path: string): string | undefined {
  return realByPath(ctx).get(path);
}

/** Reads `path` the way a tool that follows links would, without ever opening a link. */
export function readLinked(ctx: ScanContext, path: string): string | undefined {
  const real = realPath(ctx, path);
  return real === undefined ? undefined : ctx.readText(real);
}
