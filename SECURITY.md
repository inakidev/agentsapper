# Security policy

## Reporting a vulnerability in agentsapper

agentsapper scans hostile repositories, so a bug in agentsapper itself can be a security issue.
Examples: anything in a scanned repository that makes agentsapper execute code, follow a symlink,
read outside the scanned directory, write anywhere, hang despite its limits, or inject escape
sequences into your terminal.

Please report these privately through GitHub's
[private vulnerability reporting](https://github.com/inakidev/agentsapper/security/advisories/new)
rather than in a public issue. Include a fixture (a description of the files, not a live
repository) and the agentsapper version.

## Detection gaps

A repository that runs something when opened but that agentsapper does not flag is a detection
gap, not a vulnerability in agentsapper. Open a regular issue with the technique and, if possible,
a link to the original research. If the technique is an unpatched vulnerability in a third-party
tool (an agent, IDE or git itself), report it to that vendor first and wait for their fix before
opening a public issue.

## Supported versions

Only the latest release receives fixes.
