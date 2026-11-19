import { foldName } from '../../names.js';
import type { ScanContext } from '../../types.js';
import type { Entry } from '../../walker.js';

// Files the project itself would run, as opposed to installed, built or vendored
// copies: those are out of scope and full of legitimate eval and minified code.

const SKIP_DIRS = new Set([
  'node_modules',
  'bower_components',
  'vendor',
  'dist',
  'build',
  'out',
  'coverage',
  '.git',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  '.turbo',
  '.cache',
]);
const SOURCE = /\.(c|m)?[jt]sx?$/;
const GENERATED = /\.min\.[a-z0-9]+$|\.map$|\.d\.(c|m)?ts$/;

/** Larger source files are not read; they are rarely hand-written. */
export const MAX_SOURCE_BYTES = 1024 * 1024;

/** Regular files outside dependency, build and VCS directories. */
export function firstPartyFiles(ctx: ScanContext): readonly Entry[] {
  return ctx.memo('code:first-party', () =>
    ctx.entries.filter(
      (e) =>
        e.kind === 'file' &&
        !foldName(e.path)
          .split('/')
          .slice(0, -1)
          .some((s) => SKIP_DIRS.has(s)),
    ),
  );
}

/**
 * Code npm start and npm run dev do not load: tests, fixtures, examples. Large repos
 * keep thousands of files there, full of deliberate eval, and reading them is slow.
 */
const NOT_RUN_ON_START = new Set([
  'test',
  'tests',
  '__tests__',
  '__test__',
  'spec',
  'specs',
  '__mocks__',
  'fixtures',
  '__fixtures__',
  'e2e',
  'example',
  'examples',
  'playground',
  'playgrounds',
  'benchmark',
  'benchmarks',
]);

/** First-party JavaScript and TypeScript that may run on start, minus minified and generated files. */
export function sourceFiles(ctx: ScanContext): readonly Entry[] {
  return ctx.memo('code:sources', () =>
    firstPartyFiles(ctx).filter((e) => {
      const segments = foldName(e.path).split('/');
      const name = segments.pop() ?? '';
      return (
        SOURCE.test(name) &&
        !GENERATED.test(name) &&
        e.size <= MAX_SOURCE_BYTES &&
        !segments.some((s) => NOT_RUN_ON_START.has(s))
      );
    }),
  );
}

/** 1-based line of each `\n`-separated row, as [line, text] pairs. */
export function numberedLines(text: string): [number, string][] {
  return text.split('\n').map((row, i) => [i + 1, row.replace(/\r$/, '')]);
}
