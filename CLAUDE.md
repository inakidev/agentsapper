# agentsapper

Read-only CLI that scans an untrusted repository **before** an AI coding agent opens it. It flags git config execution sinks, malicious `.gitattributes` drivers, workspace-escaping symlinks, agent/MCP config hooks, hidden instructions in agent instruction files, and IDE/package auto-run vectors.

The full spec lives in `docs/PROJECT_BRIEF.md` (in Spanish). Read it at the start of every phase. It is the source of truth for the rule catalog, phases, and scope.

## Communication

- Talk to the maintainer (Iñaki) in Spanish (rioplatense).
- Write everything in the repo in English: code, comments, CLI output, commit messages, README.

## Security rules for working in this repo (non-negotiable)

This project builds hostile test fixtures. You are an AI coding agent, which is exactly the target of those fixtures. So:

1. **Never run `git` or any other command inside a materialized fixture directory**, and never `cd` into one. Fixtures exist only as specs in `fixtures/specs/`. They are materialized into OS temp dirs by the test harness and deleted afterwards.
2. **Never commit a materialized fixture**: no nested `.git/` directories, no real symlinks pointing outside the repo, no live hook files.
3. **Fixture payloads must be harmless:** they only write a marker file inside the test's own temp dir. No network, no writes outside the temp dir, no destructive commands.
4. **The exploitability harness (phase 6) runs only inside a disposable Docker container.** Never run it on the host.
5. **Do not put live exploit strings in this file, the README, or source comments.** The tool scans its own repo in CI (self-scan), and instruction files must pass it. Describe patterns in words or reference rule IDs instead.

## Engineering rules

- **Never invoke the `git` binary (or any external process) from `src/`.** Parse `.git/config` and `.gitattributes` with our own parsers. Running `git status` is the very attack we detect. Enforce this with an ESLint `no-restricted-imports` rule banning `child_process` (and `node:child_process`) under `src/`.
- **Never follow symlinks** while walking the tree. Use `lstat`/`readlink`, resolve targets only as paths for analysis, and never read through them. When a tool would follow an in-repo link to a config file (agents, IDEs and git do), resolve the link as a path and read the target by its own path (`src/rules/linked.ts`); never open the link itself.
- **Read-only:** never modify the scanned repository.
- **Resource limits:** cap file size read, walk depth, and total time, so a hostile repo cannot hang or exhaust the scanner.
- **Zero runtime dependencies.** Dev dependencies are fine. Any runtime dependency needs explicit approval from the maintainer.
- TypeScript in `strict` mode, Node 20+, ESM.
- No LLM calls anywhere. Determinism is a design goal, not a limitation.

## Project layout

```
src/
  cli.ts              # arg parsing, exit codes
  scan.ts             # orchestrates walker + rules
  walker.ts           # safe filesystem walk (lstat, limits)
  parsers/            # gitconfig.ts, gitattributes.ts, jsonc.ts, ...
  rules/<family>/     # one file per rule: git/, fs/, agent/, instr/, ide/, pkg/
  report/             # text.ts, json.ts, sarif.ts
fixtures/
  specs/              # fixture definitions (data only, never live repos)
  materialize.ts      # writes a spec into a temp dir for tests
scripts/              # benign corpus list and fetcher (clones outside the repo)
test/
  exploit/            # exploitability harness: container only, never on the host
  eval/               # evaluation run that writes docs/evaluation/
docs/
  PROJECT_BRIEF.md
  evaluation/         # RESULTS.md, results.json, exploitability.json
```

## Rule contract

Every rule exports an object with: `id` (e.g. `GIT-001`), `title`, `severity` (`info | low | medium | high | critical`), `status` (`stable | experimental`), `references` (URLs to the original research or official docs), and a pure function that takes the scan context and returns `Finding[]`.

Each finding includes: rule id, file, line (when applicable), a short evidence snippet, an explanation of why it is dangerous, and a remediation hint.

## Agent config formats

Config file paths and formats for AI agents (Claude Code, Cursor, Codex, Gemini CLI, Copilot) change often. Before implementing any `AGENT-*` rule, verify the current format in the tool's official documentation and link it in the rule's `references`. If it cannot be verified, mark the rule `experimental` and tell the maintainer.

## Workflow

- Work **one phase at a time** (F0–F6 in the brief). At the end of each phase, summarize what was done, what is pending, and any decisions taken, then **stop and wait for confirmation**.
- TDD: write the fixture spec and the failing test first, then the rule.
- Small, focused commits using Conventional Commits (`feat(git): add GIT-001 fsmonitor rule`).
- Ask before making architectural decisions not covered by the brief, or before adding anything listed as out of scope.

## Commands

These are set up in F0; keep this list updated if they change.

- `npm test`: unit tests plus fixture tests (Vitest)
- `npm run lint`: ESLint, including the `child_process` ban in `src/` (fails on warnings)
- `npm run typecheck`: `tsc` over `src/`, `test/` and `fixtures/` without emitting
- `npm run format` / `npm run format:check`: Prettier
- `npm run build`: compile to `dist/`
- `npm run selfscan`: run the built CLI against this repo; must exit 0
- `npm run corpus:fetch [dir]`: shallow-clone the benign corpus outside the repo (default: OS temp dir)
- `npm run eval`: fixture detection plus benign-corpus scan; writes `docs/evaluation/RESULTS.md`
- Exploitability harness (`vitest.exploit.config.ts`): container only, run by the Exploitability workflow; never on the host
