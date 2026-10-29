# Changelog

## 0.1.0 (unreleased)

First release.

- 21 rules: GIT-001 to GIT-008, FS-001 to FS-003, AGENT-001 to AGENT-004, INSTR-001 to INSTR-003,
  IDE-001, IDE-002 and PKG-001. AGENT-004, INSTR-002 and INSTR-003 are experimental.
- Own parsers for git config, gitattributes, JSONC, a TOML subset and frontmatter. The scanner
  never runs git or any other process, never opens a symlink and never writes; lint rules and
  tests enforce this.
- Config files that agents, IDEs or git reach through in-repo symlinks are analyzed as the tool
  would see them, with link targets resolved as the OS does (found in a second-pass review by a
  separate Claude session before release).
- Safe walker with depth, entry, time and file-size limits. Hitting any limit makes the scan
  incomplete and the exit code 2.
- Text, JSON and SARIF 2.1.0 output; `--format`, `--fail-on`, `--rules` and `--quiet`.
- Windows directory junctions are treated as symlinks, and link resolution is tested against
  what the OS actually opens on Linux and Windows.
- Paths and link targets are compared ignoring case, as Windows and macOS compare them, on
  every platform: `.Claude/Settings.json` is analyzed as `.claude/settings.json`.
- Fixture corpus (34 malicious, 2 of them Windows-only, and 8 benign), a container-only
  exploitability harness on git 2.39 and 2.56, a differential test of the config parser against
  git, and a benign-corpus evaluation; results in `docs/evaluation/RESULTS.md`.
- Published from CI with npm provenance, only from tags that point to a commit on main.
