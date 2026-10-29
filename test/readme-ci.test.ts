import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The CI example in the README must be exactly what a workflow of this repository
// runs, so it cannot silently rot (it once pinned a tag object instead of a commit).

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const workflow = readFileSync(
  new URL('../.github/workflows/code-scanning.yml', import.meta.url),
  'utf8',
);

function dedent(block: string): string {
  const lines = block.split('\n').filter((line) => line.trim() !== '');
  const indent = Math.min(...lines.map((line) => line.length - line.trimStart().length));
  return lines.map((line) => line.slice(indent)).join('\n');
}

describe('README CI example', () => {
  it('is the code-scanning workflow, verbatim', () => {
    const section = readme.slice(readme.indexOf('### In CI'));
    const snippet = /```yaml\n([\s\S]*?)```/.exec(section)?.[1];
    const job = /# README snippet begins\n([\s\S]*?)\n\s*# README snippet ends/.exec(workflow)?.[1];

    expect(snippet).toBeDefined();
    expect(job).toBeDefined();
    expect(dedent(snippet ?? '')).toBe(dedent(job ?? ''));
  });

  it('pins actions to commits and agentsapper to the version being released', () => {
    const job = workflow.slice(workflow.indexOf('# README snippet begins'));
    const { version } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };

    // Bumping package.json fails this test until the example scans with the new version.
    expect(job.match(/agentsapper@\S+/g)).toEqual([`agentsapper@${version}`]);
    for (const uses of job.match(/uses: \S+/g) ?? []) expect(uses).toMatch(/@[0-9a-f]{40}$/);
  });
});
