# agentsapper

Scan an untrusted repository **before** an AI coding agent opens it.

> Status: early development. The scanner skeleton works, but no detection rules ship yet.

Most untrusted-repo checks look at what the agent reads. agentsapper also covers what git
executes when the agent merely looks: git config execution sinks, `.gitattributes` drivers,
workspace-escaping symlinks, agent and MCP config hooks, hidden instructions in agent
instruction files, and IDE or package auto-run vectors.

It is deterministic and read-only. It never runs anything from the scanned repository (not even
`git`), never follows symlinks, never modifies files, and uses no LLM.

## Usage

```sh
npx agentsapper <path>
```

Exit codes: `0` no findings at or above `high`, `1` findings at or above `high`, `2` usage or
runtime error.

## Development

Requires Node 22+ for the toolchain. The published CLI targets Node 20+.

```sh
npm ci
npm test          # unit and fixture tests (Vitest)
npm run lint      # ESLint, including the ban on child processes in src/
npm run typecheck
npm run build     # compile to dist/
npm run selfscan  # run the built CLI against this repo; must exit 0
```

Dependency install scripts are disabled for this repo (`.npmrc`).

## License

[MIT](LICENSE)
