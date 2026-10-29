# Changelog

## 0.1.0 (unreleased)

First release.

- 21 rules: GIT-001 to GIT-008, FS-001 to FS-003, AGENT-001 to AGENT-004, INSTR-001 to INSTR-003,
  IDE-001, IDE-002 and PKG-001. AGENT-004, INSTR-002 and INSTR-003 are experimental.
- Own parsers for git config, gitattributes, JSONC, a TOML subset and frontmatter. The scanner
  never runs git or any other process, never follows symlinks and never writes; lint rules and
  tests enforce this.
- Safe walker with depth, entry, time and file-size limits. Hitting any limit makes the scan
  incomplete and the exit code 2.
- Text, JSON and SARIF 2.1.0 output; `--format`, `--fail-on`, `--rules` and `--quiet`.
- Fixture corpus (27 malicious, 8 benign), a container-only exploitability harness and a
  benign-corpus evaluation; results in `docs/evaluation/RESULTS.md`.
