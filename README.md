# agentsapper

Scan an untrusted repository for what it can execute or inject **before** an AI coding agent opens it.

```text
$ npx agentsapper ./downloaded-repo
Scanned /home/dev/downloaded-repo with 22 rules.

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
Verdict: do not open this folder with an agent, an IDE or git until you have read the 2 findings at high or above.
```

A _sapper_ is the military engineer who clears mines before the troops advance. agentsapper
clears the repository before the agent goes in.

> Status: 0.1.0. 22 rules across git, filesystem, agent config, instruction files, IDE and
> package scripts. Zero runtime dependencies. No LLM.

## Quick start

From the folder that contains the repository (Node.js 20 or newer):

```sh
npx agentsapper ./downloaded-repo
```

It takes well under a second. Read the last line:

- `Verdict: do not open this folder...` (exit code 1): read the findings first.
- `Verdict: nothing found` (exit code 0): none of the 22 rules fired. That is not a guarantee;
  see [Known limitations](#known-limitations).

Always run it from **outside** the folder you are checking. Inside it, npx reads the folder's
`.npmrc` and `node_modules/.bin`, and on Windows `cmd.exe` looks for programs in the current
folder first. The repository controls all of these.

## The problem

Coding agents run git and read project config files as soon as they open a directory. During
2026, several research teams showed that those files, written by whoever authored the
repository rather than by the developer opening it, are enough to run commands outside the
agent's own approval prompts. [GitSpawn][gitspawn] used `core.fsmonitor` in `.git/config`, which
`git status` executes, and some agents ran `git status` before showing their own trust dialog.
GitLab's [ConfigPoisoning][configpoisoning] routed a file through a clean filter selected by
`.gitattributes`, which `git diff` runs even with `--no-ext-diff --no-textconv`.
[GhostApproval][ghostapproval] used symlinks to make "workspace" reads and writes land elsewhere.
And agent hooks run commands the project defines when a session starts: behind a one-time
folder-trust prompt in interactive sessions, and with no prompt at all in non-interactive runs
such as `claude -p`, the Claude Agent SDK or Copilot's cloud agent.

**How the git attacks arrive.** A plain `git clone` does not copy the remote's `.git/config`, so
the attacks that need repository config (`core.fsmonitor`, `diff.external`, filter and diff
drivers, and GIT-004's attributes, which only matter once a driver is defined) need another way
in. The research above names these: an archive shipped with its `.git` directory, a synced or
shared folder, a USB stick, a CI cache or a dev container build, or an agent already running on
the machine (compromised or prompt-injected) writing the config into a repository that was
cloned normally. What a clone does carry is a buried bare repository (GIT-008): its
config is ordinary tracked files, and git uses it as soon as anyone runs git inside that
directory. The agent, IDE, instruction-file, symlink and package rules apply to clones in full.

Most of these attacks do not need to trick the model. They exploit the trust boundary between
the agent and the tools it invokes: once a hostile config exists, a plain `git status` is
enough. That means they can be mitigated with classic, deterministic controls, without adding
more AI. agentsapper uses no LLM anywhere. That is a design decision, not a limitation: the same
repository always produces the same report, and every finding says which rule fired, where,
why it is dangerous and what to do.

Most untrusted-repo checks look at what the agent reads. agentsapper also covers what git
executes when the agent merely looks, which matters whenever a repository arrives with its
`.git` directory or buries one. It parses `.git/config` and `.gitattributes` with its own
parsers (it never runs `git`, which would trigger the very attack), resolves symlinks as paths
without ever opening them, and checks agent and IDE config against formats verified in each
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

Run it before you open a directory with an agent, an IDE or `npm install`. It needs Node.js 20
or newer and has no runtime dependencies.

### In CI

The SARIF output works with GitHub code scanning. Exit code 1 (findings) should not stop the
upload, but exit code 2 (error or incomplete scan) must fail the job, or a partial report would
pass as clean. Install in a separate step: npm's own failures (a network error, or a version not
yet on the registry) also exit with 1 and would otherwise pass as findings. This is the job this
repository runs itself
([code-scanning.yml](.github/workflows/code-scanning.yml); a test keeps the two identical):

```yaml
permissions:
  contents: read
  security-events: write
  actions: read
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
    with:
      persist-credentials: false
  # Its own step, so a failed install fails the job instead of passing as exit 1.
  - name: Install agentsapper
    # From outside the checkout, so its .npmrc cannot redirect the install.
    working-directory: ${{ runner.temp }}
    run: npm install --global --ignore-scripts agentsapper@0.1.0
  - name: Scan with agentsapper
    run: |
      status=0
      agentsapper . --format sarif > agentsapper.sarif || status=$?
      # 1 = findings, reported through code scanning; 2 = error or incomplete scan
      if [ "$status" -ge 2 ]; then exit "$status"; fi
  - uses: github/codeql-action/upload-sarif@9b3254085494b55a0f7c4c2b3d2d52cc712ce370 # v4.39.1
    with:
      sarif_file: agentsapper.sarif
```

Pin the agentsapper version as you pin actions (to commit SHAs, not tag objects). A fresh clone
never contains the remote's `.git/config`, so in CI the git rules mostly matter for buried bare
repositories and nested `.git` directories, whose own config can define drivers that
`.gitattributes` then route files through. The agent, IDE, instruction-file and symlink rules
apply fully.

## Rules

| ID        | Detects                                                                                                                                                                                                                    | Severity                                                                                 | Status       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------ |
| GIT-001   | `core.fsmonitor` set to a command (any non-boolean value)                                                                                                                                                                  | critical                                                                                 | stable       |
| GIT-002   | About 30 config keys that run programs (`diff.external`, `core.pager`, `core.sshCommand`, `core.hooksPath`, `credential.helper`, `gpg.program`, config-defined hooks, aliases with `!`, ...), graded by what triggers them | critical to low                                                                          | stable       |
| GIT-003   | Filter, diff and merge driver commands in git config (`filter.<x>.clean`, `diff.<x>.textconv`, ...)                                                                                                                        | high                                                                                     | stable       |
| GIT-004   | `.gitattributes` (including nested files, `info/attributes` and macros) routing files through a config-defined driver                                                                                                      | critical for drivers `git diff` runs, otherwise high                                     | stable       |
| GIT-005   | `include.path` / `includeIf` in git config; included repo files are analyzed recursively                                                                                                                                   | high to low                                                                              | stable       |
| GIT-006   | Live hooks in `.git/hooks` or in a `core.hooksPath` directory inside the repo                                                                                                                                              | high or medium                                                                           | stable       |
| GIT-007   | A `.git` file, `.git` symlink or `core.worktree` pointing outside the repository                                                                                                                                           | high                                                                                     | stable       |
| GIT-008   | Embedded repositories: buried bare repos and nested `.git` directories                                                                                                                                                     | high                                                                                     | stable       |
| FS-001    | Symlink resolving outside the repository                                                                                                                                                                                   | high                                                                                     | stable       |
| FS-002    | Symlink resolving to credentials or system paths (`~/.ssh`, `~/.aws`, `/etc`, ...)                                                                                                                                         | critical                                                                                 | stable       |
| FS-003    | Symlink inside an agent or IDE config location, resolving inside the repo                                                                                                                                                  | medium                                                                                   | stable       |
| FS-004    | A program at the repository root named like a tool agents run (`git.exe`, `node.cmd`, ...), which Windows runs instead of the real one                                                                                     | critical for git, otherwise high                                                         | stable       |
| AGENT-001 | Claude Code project settings: hooks, helper commands, broad allow rules, `defaultMode`, dangerous `env`, MCP auto-approval, plugins; hooks in agent and skill frontmatter                                                  | critical to medium                                                                       | stable       |
| AGENT-002 | MCP servers that launch local commands (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.gemini/settings.json`, `.codex/config.toml`)                                                                                | critical or high                                                                         | stable       |
| AGENT-003 | Hooks and setup commands of Cursor, Gemini CLI, Codex and GitHub Copilot                                                                                                                                                   | critical to medium                                                                       | stable       |
| AGENT-004 | Workspace settings that auto-approve agent actions (VS Code, Codex)                                                                                                                                                        | high or medium                                                                           | experimental |
| INSTR-001 | Invisible Unicode in instruction files (tag characters, zero-width, bidi), with the hidden text decoded                                                                                                                    | critical (README: high)                                                                  | stable       |
| INSTR-002 | Agent-directed instructions hidden in HTML comments or collapsed blocks                                                                                                                                                    | medium (README: low)                                                                     | experimental |
| INSTR-003 | Instructions to download and run code, or long encoded payloads                                                                                                                                                            | high when the download runs as code, low when it is piped in as data (README: low, info) | experimental |
| IDE-001   | VS Code tasks with `runOn: folderOpen`                                                                                                                                                                                     | critical with automatic tasks on, otherwise high                                         | stable       |
| IDE-002   | Dev container lifecycle commands                                                                                                                                                                                           | high for `initializeCommand` (runs on the host), otherwise medium                        | stable       |
| PKG-001   | `package.json` install lifecycle scripts                                                                                                                                                                                   | high when they download, evaluate or decode code, otherwise info                         | stable       |

Instruction files are `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `AGENTS.override.md`,
`GEMINI.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`, `.cursor/rules/*.mdc`, Claude Code
rules, commands, agents and skills, Copilot instruction and prompt files, Gemini custom commands,
and the root README at lower severity. Paths are compared the way Windows and macOS compare
them, ignoring case, on every platform: `.Claude/Settings.json` counts as
`.claude/settings.json`, and `.GIT/CONFIG` as `.git/config`. Every rule lists its sources in its
`references`
(shown in the SARIF output). Experimental rules are heuristics or depend on settings whose
exact names could not be verified verbatim in official docs.

## Evaluation

Full tables: [docs/evaluation/RESULTS.md](docs/evaluation/RESULTS.md). Reproduce them with
`npm run corpus:fetch && npm run eval`, or with the Evaluation workflow on Linux.

**Fixture corpus.** 37 malicious fixtures (each reproducing a published technique or a known
evasion, with a link to its source) and 8 benign false-positive traps. Two are Windows-only
(directory junctions, and the Win32 treatment of `..` in link targets) and run in the Windows CI
jobs; one is POSIX-only, and one Linux-only (two names that differ only in case). On Linux, all
115 expected findings of the other 35 malicious fixtures are detected with the expected file,
line and severity, with no unexpected findings. In CI every fixture also runs a second time with
its paths in upper case, on Linux and Windows, and must produce the same findings. These
fixtures were written alongside the rules, so treat this as a regression suite rather than an
independent measure of detection.

**Exploitability on real git.** In throwaway containers with git 2.39.5 (Debian bookworm) and
git 2.56.0 (Alpine edge, the current release), a harness turns the git fixtures into real
repositories and runs the command each technique abuses. On both versions these executed the
fixture's inert marker program: `core.fsmonitor` on `git status` (plain and obfuscated),
`diff.external` on `git diff`, a clean filter on `git diff` even with `--no-ext-diff
--no-textconv`, `textconv` through a macro in `.git/info/attributes`, `fsmonitor` pulled in
through `include.path`, a `pre-push` hook from `core.hooksPath`, `git status` inside a buried
bare repository, and `fsmonitor` set through a symlinked `.git/config`. A config-defined hook
(`hook.<name>.command`) ran on git 2.56.0 only, as expected. Two controls behaved as expected
on both: `--no-textconv` blocks textconv, and `git status` alone does not run the clean filter.
agentsapper flagged every case. This independently confirms that the git fixtures are real
attacks on current git; it uses the same fixtures, so it says nothing about how detection
generalizes beyond them.

**Parser parity with git.** This is the check with an independent oracle. 5000 generated
configs (fixed seed, legal and illegal syntax) were parsed by agentsapper and by
`git config --list --file` on both git versions: the 3745 that git accepts produce the same
entries in the same order, and the 1255 git rejects all produce a parse error in agentsapper.
The first run found one difference (git accepts variables before the first section header);
it was fixed. Scope: single files only. Include resolution and the gitattributes parser are not
covered by the differential test.

**Benign corpus.** 16 popular, legitimate repositories (husky, express, axios, eslint, prettier,
vite, execa, devcontainers/templates, anthropics/claude-code, google-gemini/gemini-cli,
openai/codex, modelcontextprotocol/servers, cline/cline, requests, flask, pydantic), each pinned
to the commit in [scripts/benign-corpus.json](scripts/benign-corpus.json) (their default
branches on 2026-10-29), so `npm run corpus:fetch` reproduces the exact trees. Each scan took
under 0.4 s. The sample leans on purpose towards agent tooling repositories, which is why AGENT
and FS findings show up at all.

- **2 of 16 would fail a CI gate at the default `--fail-on high`.** Both are `SessionStart` hooks
  in `.claude/settings.json` (modelcontextprotocol/servers and cline/cline) that run a project
  script as soon as a Claude Code session starts. The intent is legitimate, but the behavior is
  exactly what this tool exists to surface: opening the repository runs its code.
- The remaining findings are medium or lower and also describe real behavior: dev container
  lifecycle commands (4), Gemini CLI custom commands that run shell (5), symlinks sharing skills
  between agent config dirs (9), downloads in instruction files (6, low: five README install
  commands and one download piped as data into inline Python) and routine install scripts
  (13, info).
- What the evaluation changed: FS-003 was lowered from high to medium because cline/cline
  legitimately shares agent config through in-repo symlinks (links that leave the repo stay at
  high or critical under FS-001 and FS-002, and content reached through in-repo links is still
  analyzed by the other rules). INSTR-003 reported the cline download, which only feeds data to
  inline Python, at high; it now reports such data pipes at low instead of high, but still
  reports them, because inline code that executes its input looks the same at a glance.

16 repositories is a small sample, picked to exercise the features agentsapper inspects; it
shows the alert rate on mainstream projects, not a false-positive rate for the wider ecosystem.

**Review before release.** The project was built with Claude Code under the maintainer's spec
and review. Before release, a second-pass review by a separate Claude session (the same model
that wrote the code, so not an independent review) found four problems, all now fixed and
covered by fixtures:

- A symlinked `.claude/settings.json` (or a symlinked `.claude` directory, `CLAUDE.md` or
  `.git/config`) hid its content, so a `SessionStart` hook surfaced only as a medium symlink
  finding. agentsapper still never opens or dereferences a link; when a tool would load config
  through an in-repo link, it now analyzes the target by its own path. The exploitability
  harness confirms git follows a symlinked `.git/config`.
- Link targets were normalized as text, so `.claude -> a/b/../conf` with `a/b` itself a link was
  analyzed at a different place than the one the kernel resolves. Links are now resolved
  component by component as the OS does (POSIX applies `..` after following a link; Win32
  normalizes it first). A test checks the resolver against what the OS actually opens, in the
  Linux and Windows CI jobs.
- Downloads piped into `python3 -c "exec(sys.stdin.read())"` looked like data pipes. INSTR-003
  now reports inline code that executes its input at high.
- Names were compared exactly. On Windows and macOS, which ignore case by default, a tool that
  opens `.claude/settings.json` also opens `.Claude/Settings.json`, and that directory produced no
  findings. The review raised this for link targets; checking it showed that plain names were
  affected too. Names are now compared as those filesystems compare them, on every platform,
  because a repository scanned on Linux is often opened on Windows or macOS. A test runs every
  fixture again with its paths in upper case.

## Known limitations

- **Not a sandbox and not a verdict.** A clean report means none of these rules fired, not that
  the repository is safe. Code fetched at run time (packages started with `npx`, scripts
  downloaded by install hooks) is out of reach of static analysis.
- **gitattributes patterns are not matched against files.** A line that routes files through a
  driver is reported even if no current file matches it. The gitattributes parser is tested
  against git's documented behavior, not differentially against git like the config parser.
- **`includeIf` conditions are not evaluated.** Entries they bring in are assumed to apply.
- **Not analyzed:** linked worktree config under `.git/worktrees/`, a scan root that is itself a
  bare repository, `.gitmodules` URLs, hard links, Windows shortcut files, and your own global or
  system git config.
- **Heuristic rules** (INSTR-002, INSTR-003) will have false positives; they are signals to
  review. INSTR-003 decides whether inline code runs a download it reads from a blocklist of
  calls and modules (`exec`, `eval`, `os.system`, `subprocess`, `pickle`, ...), which obfuscated
  code gets past. That is why a download piped in as data is still reported, at low, instead of
  dropped. AGENT-004 depends on setting names verified only through summaries of the docs.
- **Name comparison is an approximation.** Names are compared with Unicode case folding and
  normalization. That covers every difference in ASCII case, but each filesystem uses its own
  tables, so a few rare non-ASCII characters may compare differently there.
- **Agent config formats change quickly.** The AGENT rules were verified against vendor
  documentation in October 2026 and link to it.
- **Windows:** antivirus can block reading a hostile file (Windows Defender does so for some
  install scripts). agentsapper then reports the scan as incomplete and exits 2 rather than
  calling it clean. Without Developer Mode, git checks out symlinks as plain files holding the
  link target; agentsapper reads git's index to recognize them and reports them as the links
  they are on macOS and Linux, so the three systems give the same report (root repository only;
  other rules still read those files as the plain files Windows tools see). Directory junctions
  (`mklink /J`), which need no special rights, are treated as symlinks.

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
opens or dereferences a symlink (link targets are resolved as paths, and only regular files the
walker saw inside the repo are read), never writes to the repository (also enforced by a lint
rule and a test), caps file size, depth, entry count and time,
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
npm run demo           # plant 11 small cases in a temp dir, scan them, print OK or FAIL
```

Malicious fixtures exist only as data in `fixtures/specs/`. Tests write them into a fresh
temporary directory and delete them afterwards; the commands they reference are inert. The
exploitability harness runs git against them on purpose, so it only runs inside the throwaway
container of the Exploitability workflow. Dependency install scripts are disabled for this
repository (`.npmrc`).

Releases are published only by the Release workflow, from a `vX.Y.Z` tag that matches
`package.json`, after every check passes, with npm provenance. Nothing is published from a
workstation.

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
