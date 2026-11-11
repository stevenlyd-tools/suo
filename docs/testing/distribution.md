# Distribution validation receipt

Target: Suo 0.4.0. Environment inspected on 2026-10-20: macOS, Node 22.20.0,
npm 10.9.3, pnpm 10.28.1. Test results below are completed before merging.

## Native host availability

| Host | Observed local capability | Native install/update/reload result |
| --- | --- | --- |
| Codex | No `codex` CLI on PATH or in inspected executable directories | Unverified; this task's tool interface is not a standalone plugin CLI |
| Claude Code | No `claude` CLI; Claude desktop app is a different surface | Unverified |
| Cursor | No Cursor app/CLI found in the inspected application/bin locations | Unverified |
| Copilot CLI | No `copilot` executable found | Unverified |
| VS Code | Installed 1.104.2, verified through bundle metadata and CLI help | Unsupported by this old build; plugin support was introduced later |
| Gemini CLI | No `gemini` executable found | Unverified |
| Hermes | No `hermes` executable found | Unverified |
| Pi | No `pi` executable found | Unverified |

Inspection covered the current PATH, the active Node bin directory,
`~/.local/bin`, `/usr/local/bin`, and installed application names. It is not a
claim that no alternate installation could exist anywhere on disk. No host was
installed/upgraded to conduct these tests. No credential files or global host
settings were edited. No native auto-update was enabled.

## Repository/package checks

The automated receipt is the CI run for the exact PR head/merge commit:

- Full TypeScript tests, regression suite, build and committed dist consistency.
- Deterministic native metadata, single canonical skill, content hashes,
  package dependency/version parity and release version gating.
- Portable Agent Plugins 1.0 schema validation against the official fixture;
  structural/path checks for other manifests/catalogs.
- npm tarball contents and production-only installation in an isolated prefix;
  installed CLI version, native manifest parity and hashes checked there.
- Full-SHA local Git installation of the packed payload, without `src/` or a
  build step; installed `node_modules/.bin/suo --version` checked on POSIX.
  Remote GitHub authentication is not exercised by this local fixture.
- Installed CLI init → approved freeze → approved edit/refreeze → source-only
  copy → repeated regeneration, without repository source or dev dependencies.

These are package/CLI results, not authenticated host skill-invocation receipts.
Native discovery, transition to a different version, session reload, local-edit
handling and rollback still need a supported host's isolated profile and its
actual configuration. Track those tasks in [Suo #6](https://github.com/stevenlyd-tools/suo/issues/6) without claiming that
catalog refresh proves installation or session activation.
