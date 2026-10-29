# agentsapper

Scan an untrusted repository for what it can execute or inject **before** an AI coding agent opens it.

```text
$ npx agentsapper ./downloaded-repo
Scanned /home/dev/downloaded-repo with 21 rules.

== CRITICAL (1) ==

GIT-004  gitattributes route files through a driver defined in git config
  location: .gitattributes:1
  evidence: secret.bin filter=pwn
  why:      Files matching "secret.bin" use filter=pwn, which runs filter.pwn.clean (.git/config:4).
            Commands agents run to inspect changes, such as git diff, execute it, even with
            --no-ext-diff and --no-textconv.
  fix:      Remove the driver definition from git config, or the filter= attribute from
            .gitattributes, before running git or an agent here.

== HIGH (1) ==

GIT-003  Git config defines a filter, diff or merge driver command
  location: .git/config:4
  evidence: filter.pwn.clean = ./.agentsapper-marker
  ...

Summary: 1 critical, 1 high, 0 medium, 0 low, 0 info.
```

A _sapper_ is the military engineer who clears mines before the troops advance. agentsapper
clears the repository before the agent goes in.

> Status: 0.1.0. 21 rules across git, filesystem, agent config, instruction files, IDE and
> package scripts. Zero runtime dependencies. No LLM.

## The problem

Coding agents run git and read project config files as soon as they open a directory. During
2026, several research teams showed that those files, written by whoever authored the
repository rather than by the developer opening it, are enough to run commands outside the
sandbox and without any approval prompt: [GitSpawn][gitspawn] used `core.fsmonitor` in
`.git/config`, which `git status` executes; GitLab's [ConfigPoisoning][configpoisoning] routed a
file through a filter driver from `.gitattributes`, which `git diff` runs even with
`--no-ext-diff --no-textconv`; [GhostApproval][ghostapproval] used symlinks to make "workspace"
reads and writes land elsewhere; and agent lifecycle hooks run project-defined commands when a
session starts.

Most of these attacks do not need to trick the model. They exploit the trust boundary between
the agent and the tools it invokes: once a hostile config exists, a plain `git status` is
enough. That means they can be mitigated with classic, deterministic controls, without adding
more AI. agentsapper uses no LLM anywhere. That is a design decision, not a limitation: the same
repository always produces the same report, and every finding says which rule fired, where,
why it is dangerous and what to do.

Most untrusted-repo checks look at what the agent reads. agentsapper also covers what git
executes when the agent merely looks. It parses `.git/config` and `.gitattributes` with its own
parsers (it never runs `git`, which would trigger the very attack), resolves symlinks as paths
without ever following them, and checks agent and IDE config against formats verified in each
vendor's documentation.

## Install and use

```sh
npx agentsapper <path> [--format text|json|sarif] [--fail-on <severity>] [--rules GIT,FS,...] [--quiet]
```

| Option      | Default | Meaning                                                                                          |
| ----------- | ------- | ------------------------------------------------------------------------------------------------ |
| `--format`  | `text`  | `text` for people, `json` for scripts, `sarif` for GitHub code scanning                          |
| `--fail-on` | `high`  | Exit 1 when a finding is at or above this severity (`info`, `low`, `medium`, `high`, `critical`) |
| `--rules`   | all     | Comma-separated families (`GIT`, `FS`, `AGENT`, `INSTR`, `IDE`, `PKG`) or ids (`GIT-001`)        |
| `--quiet`   | off     | Text output shows only findings at or above `--fail-on`, and nothing when there are none         |

Exit codes: `0` nothing at or above `--fail-on`; `1` findings at or above `--fail-on`; `2` usage
or runtime error, **or an incomplete scan** (a limit was hit or a file could not be read). An
incomplete scan never passes as clean, so a repository cannot pad itself past the limits to hide.

Run it on a directory before you open it with an agent, an IDE or `npm install`. It needs
Node.js 20 or newer and has no runtime dependencies.

### In CI

The SARIF output works with GitHub code scanning:

```yaml
- run: npx agentsapper . --format sarif > agentsapper.sarif || true
- uses: github/codeql-action/upload-sarif@8498dc4c2b27cdd99baf0f87955b29ebbf30c78d # v4.39.1
  with:
    sarif_file: agentsapper.sarif
```

A fresh clone never contains the remote's `.git/config`, so in CI the git rules mostly matter
for buried bare repositories, nested `.git` directories and `.gitattributes`; the agent, IDE and
instruction-file rules apply fully.

## Rules

| ID        | Detects                                                                                                                                                                                                                    | Severity                                                          | Status       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------ |
| GIT-001   | `core.fsmonitor` set to a command (any non-boolean value)                                                                                                                                                                  | critical                                                          | stable       |
| GIT-002   | About 30 config keys that run programs (`diff.external`, `core.pager`, `core.sshCommand`, `core.hooksPath`, `credential.helper`, `gpg.program`, config-defined hooks, aliases with `!`, ...), graded by what triggers them | critical to low                                                   | stable       |
| GIT-003   | Filter, diff and merge driver commands in git config (`filter.<x>.clean`, `diff.<x>.textconv`, ...)                                                                                                                        | high                                                              | stable       |
| GIT-004   | `.gitattributes` (including nested files, `info/attributes` and macros) routing files through a config-defined driver                                                                                                      | critical for drivers `git diff` runs, otherwise high              | stable       |
| GIT-005   | `include.path` / `includeIf` in git config; included repo files are analyzed recursively                                                                                                                                   | high to low                                                       | stable       |
| GIT-006   | Live hooks in `.git/hooks` or in a `core.hooksPath` directory inside the repo                                                                                                                                              | high or medium                                                    | stable       |
| GIT-007   | A `.git` file, `.git` symlink or `core.worktree` pointing outside the repository                                                                                                                                           | high                                                              | stable       |
| GIT-008   | Embedded repositories: buried bare repos and nested `.git` directories                                                                                                                                                     | high                                                              | stable       |
| FS-001    | Symlink resolving outside the repository                                                                                                                                                                                   | high                                                              | stable       |
| FS-002    | Symlink resolving to credentials or system paths (`~/.ssh`, `~/.aws`, `/etc`, ...)                                                                                                                                         | critical                                                          | stable       |
| FS-003    | Symlink inside an agent or IDE config location, resolving inside the repo                                                                                                                                                  | medium                                                            | stable       |
| AGENT-001 | Claude Code project settings: hooks, helper commands, broad allow rules, `defaultMode`, dangerous `env`, MCP auto-approval, plugins; hooks in agent and skill frontmatter                                                  | critical to medium                                                | stable       |
| AGENT-002 | MCP servers that launch local commands (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.gemini/settings.json`, `.codex/config.toml`)                                                                                | critical or high                                                  | stable       |
| AGENT-003 | Hooks and setup commands of Cursor, Gemini CLI, Codex and GitHub Copilot                                                                                                                                                   | critical to medium                                                | stable       |
| AGENT-004 | Workspace settings that auto-approve agent actions (VS Code, Codex)                                                                                                                                                        | high or medium                                                    | experimental |
| INSTR-001 | Invisible Unicode in instruction files (tag characters, zero-width, bidi), with the hidden text decoded                                                                                                                    | critical (README: high)                                           | stable       |
| INSTR-002 | Agent-directed instructions hidden in HTML comments or collapsed blocks                                                                                                                                                    | medium (README: low)                                              | experimental |
| INSTR-003 | Instructions to download and run code, or long encoded payloads                                                                                                                                                            | high (README: low)                                                | experimental |
| IDE-001   | VS Code tasks with `runOn: folderOpen`                                                                                                                                                                                     | critical with automatic tasks on, otherwise high                  | stable       |
| IDE-002   | Dev container lifecycle commands                                                                                                                                                                                           | high for `initializeCommand` (runs on the host), otherwise medium | stable       |
| PKG-001   | `package.json` install lifecycle scripts                                                                                                                                                                                   | high when they download, evaluate or decode code, otherwise info  | stable       |

Instruction files are `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `AGENTS.override.md`,
`GEMINI.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`, `.cursor/rules/*.mdc`, Claude Code
rules, commands, agents and skills, Copilot instruction and prompt files, Gemini custom commands,
and the root README at lower severity. Every rule lists its sources in its `references`
(shown in the SARIF output). Experimental rules are heuristics or depend on settings whose
exact names could not be verified verbatim in official docs.

## Evaluation

Full tables: [docs/evaluation/RESULTS.md](docs/evaluation/RESULTS.md). Reproduce them with
`npm run corpus:fetch && npm run eval`, or with the Evaluation workflow on Linux.

**Fixture corpus.** 27 malicious fixtures (each reproducing a published technique, with a link
to its source) and 8 benign false-positive traps. All 95 expected findings are detected with
the expected file, line and severity, with no unexpected findings. These fixtures were written
alongside the rules, so treat this as a regression suite rather than an independent measure.

**Exploitability.** In a throwaway container (git 2.39.5), a harness turns the git fixtures into
real repositories and runs the command each technique abuses. Nine techniques executed the
fixture's inert marker program: `core.fsmonitor` on `git status` (plain and obfuscated),
`diff.external` on `git diff`, a clean filter on `git diff` even with `--no-ext-diff
--no-textconv`, `textconv` through a macro in `.git/info/attributes`, `fsmonitor` pulled in
through `include.path`, a `pre-push` hook from `core.hooksPath`, and `git status` inside a buried
bare repository. Two controls behaved as expected: `--no-textconv` blocks textconv, and
`git status` alone does not run the clean filter. agentsapper flagged every case.

**Benign corpus.** 16 popular, legitimate repositories (husky, express, axios, eslint, prettier,
vite, execa, devcontainers/templates, anthropics/claude-code, google-gemini/gemini-cli,
openai/codex, modelcontextprotocol/servers, cline/cline, requests, flask, pydantic), scanned at
their default branch on 2026-10-29. Each scan took under 0.4 s.

- **2 of 16 would fail a CI gate at the default `--fail-on high`.** Both are `SessionStart` hooks
  in `.claude/settings.json` (modelcontextprotocol/servers and cline/cline) that run a project
  script as soon as a Claude Code session starts. The intent is legitimate, but the behavior is
  exactly what this tool exists to surface: opening the repository runs its code.
- The remaining findings are medium or lower and also describe real behavior: dev container
  lifecycle commands (4), Gemini CLI custom commands that run shell (5), symlinks sharing skills
  between agent config dirs (9), install commands in READMEs (5, low) and routine install
  scripts (13, info).
- Calibration: FS-003 was lowered from high to medium after this run, because cline/cline
  legitimately shares agent config through in-repo symlinks. Links that leave the repo stay at
  high or critical under FS-001 and FS-002.

16 repositories is a small sample chosen by hand; it shows the alert rate on mainstream
projects, not a false-positive rate for the wider ecosystem.

## Known limitations

- **Not a sandbox and not a verdict.** A clean report means none of these rules fired, not that
  the repository is safe. Code fetched at run time (packages started with `npx`, scripts
  downloaded by install hooks) is out of reach of static analysis.
- **gitattributes patterns are not matched against files.** A line that routes files through a
  driver is reported even if no current file matches it.
- **`includeIf` conditions are not evaluated.** Entries they bring in are assumed to apply.
- **Not analyzed:** linked worktree config under `.git/worktrees/`, a scan root that is itself a
  bare repository, `.gitmodules` URLs, hard links, Windows shortcut files, and your own global or
  system git config.
- **Heuristic rules** (INSTR-002, INSTR-003) will have false positives; they are signals to
  review. AGENT-004 depends on setting names verified only through summaries of the docs.
- **Agent config formats change quickly.** The AGENT rules were verified against vendor
  documentation in October 2026 and link to it.
- **Windows:** antivirus can block reading a hostile file (Windows Defender does so for some
  install scripts). agentsapper then reports the scan as incomplete and exits 2 rather than
  calling it clean. Without Developer Mode, git checks out symlinks as plain files, so the FS
  rules have nothing to see in such a checkout.

## Threat model

**In scope:** a directory you did not write, delivered by clone, archive, synced folder or copy,
including its `.git` directory when one comes with it; and the things that run from it when you
merely open or inspect it: git (status, diff, log, hooks), coding agents (hooks, MCP servers,
settings, instruction files), IDEs (tasks, dev containers) and `npm install`.

**Out of scope:** malicious code you run on purpose (`npm test`, `make`), compromised or
transitive dependencies, prompt injection through ordinary source code, and sandboxing or
monitoring the agent itself.

**What agentsapper guarantees about itself:** it never executes anything from the scanned
repository (no `git` or other external process; enforced by a lint rule and a test), never
follows symlinks, never writes to the repository, caps file size, depth, entry count and time,
treats any limit hit as an incomplete scan, escapes control and bidi characters from the repo
before printing, and has no runtime dependencies.

## Related work

[repo-airlock](https://github.com/ankitsxchdeva/repo-airlock) (July 2026) proposed the same idea:
a read-only triage of an untrusted repository before opening it with an agent. It is a compact
bash script that greps for git hooks, `.vscode/tasks.json`, `CLAUDE.md` and `.cursorrules`,
`.mcp.json`, install scripts, exfiltration patterns and hidden Unicode, and it is a good, quick
first look. agentsapper builds on the same idea and adds the git layer (execution keys in
`.git/config`, `.gitattributes` drivers, includes, `gitdir` files and buried bare repositories),
symlink resolution, structured parsing of config instead of grep, a measured corpus with an
exploitability harness, and CI integration through SARIF and exit codes.

## Development

The toolchain needs Node.js 22 or newer.

```sh
npm ci
npm test               # unit and fixture tests (Vitest)
npm run lint           # ESLint, including the ban on child processes in src/
npm run typecheck
npm run build          # compile to dist/
npm run selfscan       # scan this repository with the built CLI; must exit 0
npm run corpus:fetch   # shallow-clone the benign corpus outside the repo
npm run eval           # regenerate docs/evaluation/RESULTS.md
```

Malicious fixtures exist only as data in `fixtures/specs/`. Tests write them into a fresh
temporary directory and delete them afterwards; the commands they reference are inert. The
exploitability harness runs git against them on purpose, so it only runs inside the throwaway
container of the Exploitability workflow. Dependency install scripts are disabled for this
repository (`.npmrc`).

## References

- Cloud Security Alliance, GitSpawn research note: <https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-coding-agent-git-config-rce-20260904-cs/>
- GitLab, DeepSeek-Reasonix (ConfigPoisoning): <https://about.gitlab.com/blog/deepseek-reasonix-vulnerability-discovered>
- Justin Steven, buried bare repos and `core.fsmonitor` (2022): <https://github.com/justinsteven/advisories/blob/main/2022_git_buried_bare_repos_and_fsmonitor_various_abuses.md>
- Adversa AI, coding agent security roundups (GhostApproval and others): <https://adversa.ai/blog/top-ai-coding-agent-security-resources-august-2026/>, <https://adversa.ai/blog/top-ai-coding-agent-security-resources-october-2026/>
- CSA, CI/CD secrets and GuardFall: <https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-coding-agent-cicd-secrets-20260808-csa/>
- git documentation: [git-config](https://git-scm.com/docs/git-config), [gitattributes](https://git-scm.com/docs/gitattributes), [githooks](https://git-scm.com/docs/githooks)
- Agent and IDE documentation: [Claude Code](https://code.claude.com/docs/en/settings), [Cursor](https://cursor.com/docs/hooks), [VS Code](https://code.visualstudio.com/docs/agents/reference/mcp-configuration), [Gemini CLI](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/settings.md), [Codex](https://learn.chatgpt.com/docs/config-file/config-basic), [GitHub Copilot](https://docs.github.com/en/copilot/reference/hooks-reference), [Dev Containers](https://containers.dev/implementors/json_reference/)

[gitspawn]: https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-coding-agent-git-config-rce-20260904-cs/
[configpoisoning]: https://about.gitlab.com/blog/deepseek-reasonix-vulnerability-discovered
[ghostapproval]: https://adversa.ai/blog/top-ai-coding-agent-security-resources-august-2026/

## License

[MIT](LICENSE)
