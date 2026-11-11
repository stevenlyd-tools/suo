# Native distribution and updates

Checked against the official sources linked below on **2026-10-20**. Suo has two components: a portable skill and a Node CLI. Native plugin installation discovers instructions; it does **not** prove that the CLI or its dependencies are installed. This repository does not enable anybody's automatic updates, install into host profiles, publish to a public marketplace/registry, or change credentials or permissions.

## Package contract

`skills/suo/SKILL.md` is the only authored skill. `package.json` is the version authority. `npm run distribution:generate` synchronizes its frontmatter version and generates metadata; no host-specific skill copies exist.

| File | Native consumer |
| --- | --- |
| `plugin.json` | Agent Plugins 1.0: Codex, Cursor, Copilot CLI and compatible VS Code |
| `.claude-plugin/plugin.json` | Claude Code compatibility, same `skills/` |
| `gemini-extension.json` | Gemini CLI extension, same `skills/` |
| `package.json` → `pi.skills` | Pi Git/npm package discovery |
| `skills/suo/` | Hermes GitHub Skills Hub/tap, skill-only |

Host catalogs are not in this repository. The `stevenlyd-tools` marketplace in [stevenlyd-tools/plugins](https://github.com/stevenlyd-tools/plugins) lists Suo and Duet for Codex, Claude Code and Copilot, each pinned to a release tag; a Suo release reaches users when that pin moves, so the pinned plugin and a project's pinned runtime can be kept at the same version.

The repository/package root is the plugin root. It contains the compiled runtime in `dist/`, runtime schemas, declared npm dependencies, license and this guide. No MCP server, lifecycle hook, polling, cron or self-updater is included. The maintainer's distribution generator is not a runtime updater. There were no other host-specific Suo adapters before this change; the Git-contained Unit source loader is a project authority adapter, not an agent distribution channel. External Vault current-state authority is no longer supported; migrate selected definitions explicitly. Shelley/other hosts have no claimed native package/update integration here.

## Install and verify the runtime separately

Use Node **22.18+**, npm and Git. Obtain a reviewed full commit SHA from a merged, CI-passing Suo PR; do not assume a version tag or npm registry release exists. For a new isolated runtime directory:

```sh
SUO_REF=REVIEWED_FULL_40_CHARACTER_COMMIT_SHA
SUO_RUNTIME=/absolute/path/to/new/suo-runtime
npm install --prefix "$SUO_RUNTIME" --no-save --omit=dev --no-package-lock \
  "git+https://github.com/stevenlyd-tools/suo.git#$SUO_REF"
"$SUO_RUNTIME/node_modules/.bin/suo" --version
"$SUO_RUNTIME/node_modules/.bin/suo" --help
```

Use a new directory, without overwriting a previous install. The Git install consumes committed `dist/`; its explicit package entry points let pnpm recognize the prepared runtime without adding Suo to a dependency build-script allowlist. No TypeScript source build is required at installation time. npm installs production dependencies (including TypeScript and esbuild, required by the authority loader). Do not disable dependency install scripts and then assume esbuild works. No package registry publication is required. Private Git access, if needed, uses existing Git authentication; never put credentials into the URL.

Pass that absolute executable path to the agent, or explicitly put its `node_modules/.bin` on the PATH inherited by the host. A shell alias is not proof a desktop application's tools can find it. Run `--version` **from the agent's execution environment** and match the loaded skill frontmatter; where the host's Skill location is known, `suo --root PROJECT writer check --skill PATH` also compares its Skill digest. It reads that package as data, so a plugin cache without `node_modules` can be checked even though its own `dist/` cannot run, then use a disposable project to run `template`, `inspect --target working-tree` and `check` after committing the fixture. A mismatch or missing command blocks Product mutations. Skill-only Hermes installs cannot use paths relative to a missing repo checkout.

**Upgrade/rollback:** retain the old runtime directory and recorded SHA. Install the newly reviewed SHA into another directory, verify it, then select it together with the matching skill at a new session boundary. Revert both selections and the project Git state to a reviewed compatible revision to roll back. After new-schema edits, use fix-forward or a reviewed reverse migration with a loss report; an old client alone cannot read new authority. Do not change project authority/history as part of installing a runtime. This is manual runtime management; a host's plugin updater does not upgrade this independent installation.

## Native host channels

The commands below are user-operated setup instructions, not authorization for Suo to run them automatically. Review each host's confirmation prompt. Use native version/ref selection where documented; otherwise load an immutable local checkout through the host's supported local-plugin path. Do not edit managed caches or invent a rollback/version-picker command.

### Codex

Register the catalog with `codex plugin marketplace add stevenlyd-tools/plugins`. Install with `codex plugin add suo@stevenlyd-tools`, or choose it through `/plugins` or the desktop Plugins UI. Inspect `codex plugin list --json` to verify the installed version and enabled state. Enable it there and start a new session; verify the loaded skill version and runtime. Refresh with `codex plugin marketplace upgrade stevenlyd-tools`, then verify the **installed** version. No universal personal-install unattended-update guarantee is claimed. Workspace/admin synchronization is a different channel and is not configured here.

The catalog already pins Suo to a release tag; to pin the catalog itself, add it with `--ref FULL_SHA`. For local testing or rollback, use the documented repo marketplace pointing to an immutable package directory; select it intentionally and restart. Keep only one enabled Suo source. [Packaging/catalogs](https://developers.openai.com/plugins/build/plugins), [developer commands](https://developers.openai.com/codex/developer-commands), [activation](https://developers.openai.com/codex/plugins).

### Claude Code

```sh
claude plugin marketplace add stevenlyd-tools/plugins
claude plugin install suo@stevenlyd-tools
claude plugin list
claude plugin update suo@stevenlyd-tools
```

Use `/plugin` to enable/disable and inspect errors; `claude plugin validate /path/to/reviewed/suo` validates a local package. Third-party marketplace auto-update defaults off. A user may enable it in `/plugin` → Marketplaces. It updates installed files, while a running session retains its loaded version: use `/reload-plugins` deliberately or start a new session, then verify runtime parity. For rollback/local testing, load a known-good checkout with `claude --plugin-dir /absolute/path/to/suo` after disabling the duplicate managed source. [Installation/update](https://code.claude.com/docs/en/plugins/install), [manifest and paths](https://code.claude.com/docs/en/plugins-reference).

### Cursor

The root Agent Plugins manifest supports skills without a Cursor-only fork. With an existing eligible team marketplace, import `https://github.com/stevenlyd-tools/suo`, review it, then install/enable Suo in Customize at the intended scope. No team access or public listing was provisioned. Team GitHub Auto Refresh requires the Cursor GitHub App and explicit marketplace settings; it re-indexes the catalog. Verify the installed revision and newly loaded skill separately.

Without that channel, the documented `~/.cursor/plugins/local/suo` directory supports local development packages only: placing/replacing a reviewed checkout there is **manual local development**, not a managed installation or automatic updater. Back it up, avoid collisions, reload the window and verify in Customize. Restore a known-good local checkout for rollback; managed-version rollback needs the available team UI/admin flow. [Formats](https://cursor.com/docs/reference/plugins), [install, local development and refresh](https://cursor.com/docs/plugins).

### GitHub Copilot CLI

```sh
copilot plugin marketplace add stevenlyd-tools/plugins
copilot plugin install suo@stevenlyd-tools
copilot plugin list --json
copilot plugin update suo
```

`copilot plugin enable suo` enables a disabled install for future sessions; `/restart` or a new session applies it. Third-party session-start updates require `autoUpdate: true` in that marketplace's **user** settings (or managed policy); repository settings cannot opt the user in. SDK/server sessions are excluded. Catalog `marketplace update` alone does not establish an installed upgrade. A reviewed local path can be installed for rollback; disable/uninstall the duplicate first through native management, preserving local edits. [Official reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference).

### GitHub Copilot in VS Code

In a supported Copilot harness use `/plugin marketplace add stevenlyd-tools/plugins`, `/plugin install suo@stevenlyd-tools`, `/plugin list`, and `/plugin update suo@stevenlyd-tools`. Manage enablement from the same UI/inventory used to install; the slash-command and customization inventories can differ. Plugin support must already be permitted by user/admin settings. Start a new chat/window and verify the selected skill and CLI.

The Extensions UI checks plugin updates automatically every 24 hours when `extensions.autoUpdate` is enabled; this is separate from VS Code binary updates. Manual “Extensions: Check for Extension Updates” is available. A marketplace can use `stevenlyd-tools/plugins#FULL_SHA` for a reviewed rollback pin; do not assume a running conversation hot-loads it. [Official management and pinning](https://code.visualstudio.com/docs/agent-customization/agent-plugins). Local VS Code **1.104.2** predates [agent plugin support introduced in 1.110](https://code.visualstudio.com/updates/v1_110); no plugin runtime test is claimed on it.

### Gemini CLI

```sh
gemini extensions install https://github.com/stevenlyd-tools/suo.git
gemini extensions list
gemini extensions update suo
```

Use `gemini extensions enable suo` if disabled. Restart the session after management changes. Installation supports a user-chosen `--auto-update`; it is not enabled by these examples. Select `--ref FULL_SHA` for a pinned install/rollback (uninstall the old extension normally before reinstalling), and verify the loaded skill and separate runtime. `gemini extensions link /path/to/suo` is for local development, not managed release installation. [Reference](https://geminicli.com/docs/extensions/reference/), [release/update behavior](https://geminicli.com/docs/extensions/releasing/).

### Hermes

```sh
hermes skills inspect stevenlyd-tools/suo/skills/suo
hermes skills install stevenlyd-tools/suo/skills/suo
hermes skills list --source hub
hermes skills check
hermes skills update suo
```

This is a native **skill-only** GitHub install. Optional tap registration is `hermes skills tap add stevenlyd-tools/suo`. Updates are manual, using upstream provenance/content hashes; local edits are skipped. Do not force-overwrite them. Verify availability in a fresh session and check runtime parity. No periodic automatic update or tested generic Git-ref rollback syntax is claimed. Keep a reviewed skill backup for recovery; if native restoration is unavailable, disable/remove the new source and use a deliberately reviewed manual restore, not a fabricated managed rollback. [Official Skills Hub guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills).

### Pi

```sh
pi install git:github.com/stevenlyd-tools/suo
pi list
pi update --extensions
```

This explicitly declares only `pi.skills`; no extension code is auto-loaded. Pi installs dependencies for Git/npm packages, but its package install does not promise a globally available `suo` command. Verify the selected standalone runtime as above. Use `git:github.com/stevenlyd-tools/suo@FULL_SHA` for a fixed revision; reconciliation keeps that pin, while unpinned sources can advance. Start a new session or use the host's supported reload, verify `/skill:suo` discovery and version. To roll back, remove the configured new source normally and install the recorded pinned source. Native update is manual; no periodic updater is claimed. [Packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md), [skills](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md).

## Existing installs and failed updates

Do not overwrite existing copied skills or silently migrate global installations. Inventory the currently enabled source, preserve local edits and record its version/SHA; install and verify the native replacement before removing only the duplicate Suo entry through that host. A copy is still a copy after manifests are added upstream. An offline/failed refresh means freshness unknown, not “up to date.” An updated catalog, installed disk files, loaded session and CLI runtime are four separate things. Finish active Product work before changing its instruction/runtime versions.

## Maintainer checks and verification scope

```sh
pnpm build
pnpm distribution:generate
pnpm check
pnpm test:package
node test/cli-e2e.mjs
node scripts/distribution.mjs --check --base FULL_BASE_COMMIT_SHA
```

`distribution-lock.json` records SHA-256 of shipped content, including compiled code, schemas, runtime dependency declarations and all native metadata. Checks reject stale/missing files, duplicate skill trees, symlinks, unexpected execution/configuration surfaces and metadata/version mismatch. PR CI compares against the base commit and requires a newer stable version when the shipped payload changes; CI also rejects uncommitted build drift. Hashes detect drift, not publisher authenticity. The portable manifest is tested against a vendored official Agent Plugins 1.0 schema; compatibility manifests have structural/path tests, not vendor-certified validation.

Package tests pack the actual allowlist, install only production dependencies in a fresh temporary prefix, verify version/manifest/hash parity, and exercise the installed CLI without repository `src/` or dev dependencies. Native host install/update/reload/rollback and authenticated skill invocation remain **unverified** when the host is unavailable. See [validation receipt](testing/distribution.md) for the exact environment and tests. No automatic-update setting was toggled. Remaining host-runtime verification belongs in Suo issues; it is not evidence that an unavailable host passed.

The design was compared against [Duet's committed distribution guide at 2635bb5](https://github.com/stevenlyd-tools/duet/blob/2635bb56a541c763716d87ab75e8020659a36334/docs/distribution.md). Suo's production dependency/runtime packaging and version readiness check are specific to Suo. This release prepares native repository channels; it does not publish tags, release assets, npm packages or public marketplace listings.
