# Changelog

Notable changes use [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Dates on backfilled entries are verified UTC merge dates of the versioned source,
not claims that a GitHub Release existed then. Earlier history is not reconstructed.
See [release process](https://github.com/stevenlyd/suo/blob/main/docs/releases.md) for publication and compatibility rules.

## [Unreleased]

## [0.10.0] - 2026-11-05

### Added

- Read-only `explain UNIT_ID [--depth N]` names the commit that introduced an implementation binding, whether that commit or its parent exactly reproduces the recorded input fingerprint, changed own-definition fields and decisions, input-policy changes and added/removed/modified/excluded/included input paths. Git history is the only source; nothing is stored or rebound ([#18](https://github.com/stevenlyd/suo/issues/18)).
- `writer check --skill PATH` compares the version and Skill digest of a package root or bare Skill directory with the executing runtime by reading files only, so dependency-free plugin caches can be checked; a mismatch exits non-zero ([#19](https://github.com/stevenlyd/suo/issues/19)).

### Changed

- The Skill directs stale-declaration review through `explain` and Skill/runtime parity through `writer check --skill`.

### Breaking changes

- None. Schema 5 and existing command output are unchanged; `writer check` output gains `skill` only when `--skill` is passed.

### Migration

- No data migration. Select the matching 0.10.0 Skill and runtime together; existing writer records from 0.9.0 report `newer`.

## [0.9.0] - 2026-10-24

### Added

- Independent last-writer provenance in `suo/writer.json`, automatic atomic recording with Unit writes, and read-only `writer check` / explicit `writer record --yes` for Skill edits and external renderers.
- Older writers are rejected; newer writers preserve explicit migration and semantic review boundaries. Read-only commands never advance provenance. Suo has no dependency on another workflow tool.

### Breaking changes

- Unit authority writes now include a reserved `suo/writer.json` file. Older clients do not enforce this protocol and must not write repositories after adoption.

### Migration

- Existing schema-5 repositories adopt on their next successful write; schema-5 product meaning is unchanged. Select matching Skill/CLI, inspect compatibility, and commit writer metadata with the content. Historical writer versions are not inferred. Rollback requires restoring a compatible repository and client together.

## [0.8.4] - 2026-10-22

### Changed

- Clarifies adopted-but-unimplemented snapshot definitions, snapshot-only next, and expected-assignee semantics independently of global work tracking. No schema or runtime change.

- See the [Suo contract](https://github.com/stevenlyd/suo/blob/main/docs/unit-runtime.md) for scope and verification limits.

### Breaking changes

- None. Schema 5 remains unchanged.

### Migration

- No data migration. Use project work-index conventions for cross-branch discovery; current definitions and implementation applicability remain separate.


## [0.8.3] - 2026-10-22

### Changed

- Restore the README's approachable Suo 梭 introduction, standalone Unit-model explanation, runnable onboarding, repository layout and development guidance. Documentation-only update; runtime behavior is unchanged.

### Breaking changes

- None.

### Migration

- No project migration. The patch version keeps the shipped README and native distribution identity consistent; existing schema-5 projects remain compatible.

## [0.8.2] - 2026-10-21

### Added

- Versioned changelog shipped with the native package, deterministic note checks and extraction, and a maintainer publishing command guarded by exact-main CI and immutable tag identity.

### Fixed

- Read CLI `--version` from package metadata so runtime identity cannot drift from the released native package version.

### Breaking changes

- None; runtime behavior and schema remain at schema 5 introduced in 0.8.0.

### Migration

- No project migration from 0.8.1. Upgrade the native plugin and separately installed runtime together. Upgrades from before 0.8.0 still require the schema-5 migration below.

## [0.8.1] - 2026-10-21

### Fixed

- Declare compiled JavaScript and TypeScript declaration entry points so pnpm consumes the prepared Git runtime without requiring Suo preparation-script permission. Includes pinned Git installation and CLI regressions. [PR #13](https://github.com/stevenlyd/suo/pull/13), source `5259c3a95df3ed44ba883aa2a3798060e6c79a51`.

### Breaking changes

- None relative to 0.8.0; schema 5 requirements still apply.

### Migration

- No project conversion from 0.8.0. Install the reviewed Git revision into a new runtime directory and verify CLI/skill versions together; do not grant Suo a new build-script permission to work around the old packaging problem.

## [0.8.0] - 2026-10-21

### Changed

- Replace lifecycle records with a flat registry of repository Units, arbitrary logical nesting, typed dependencies, and declared criterion/integration coverage. Current definitions live in Git; prior definitions remain in Git history. [PR #12](https://github.com/stevenlyd/suo/pull/12), source `eb1f170`.
- Bind coverage applicability to definition and repository input fingerprints. Missing policy or incomplete/stale coverage cannot establish verification readiness or acceptance.
- Preserve strict canonical TypeScript references, runtime validation, iterative graph traversal, and staged writes with observed-content guards and crash recovery.

### Removed

- The parallel legacy lifecycle/Vault authority runtime and external CI, PR, acceptance, and deployment outcomes as current authority fields.

### Breaking changes

- Schema 5 replaces prior product/lifecycle shapes and APIs. Old authority cannot be read as schema 5 or converted by installing a new client. Implementation declarations do not prove behavior or acceptance.

### Migration

- Follow [the explicit schema-5 migration](https://github.com/stevenlyd/suo/blob/main/docs/validation-upgrade.md): preserve a Git recovery point, map selected definitions and relationships deliberately, review code/criterion coverage, keep unknown facts unknown, and validate in an isolated branch before committing.
- Coordinate with Unit-aware Duet 0.7.0 or newer. After new-schema writes, use fix-forward or a reviewed reverse migration with a loss report; switching to an old runtime alone is not rollback.
