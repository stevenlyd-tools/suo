---
name: suo
description: Define current repository product Units, their dependencies and honest implementation coverage; collaborate through Git with deterministic validation.
version: 0.10.0
compatibility: "Requires Node.js 22.18+ and the matching suo CLI."
---

# Suo

Suo describes the checked-out commit's current product definition and implementation coverage. Git owns history. A Unit can contain Units at any depth; module and feature are labels, not fixed layers. Use a bounded deliverable boundary when useful, not one Unit per sentence or decision. Current normative decisions, alternatives and unresolved questions stay attached to Units. An intended assignee is an expectation, never evidence that the person accepted the work.

Before mutations, run `suo --version` from the selected runtime and match this skill version. When the loaded Skill's directory or plugin package is known, `suo --root PROJECT writer check --skill PATH` compares its Skill digest as data, without running anything from `PATH` (plugin caches may lack runtime dependencies); `matches: false` blocks mutations. Native plugin instructions and the separately installed Node runtime are different installations. Follow [native distribution](https://github.com/stevenlyd/suo/blob/main/docs/distribution.md) at the reviewed installed revision. Do not silently install a missing executable, copy skill files into managed caches or claim a host update updated the runtime/current session.

## Writer provenance

Before editing, run `suo --root PROJECT writer check` with this Skill's matching CLI. `suo/writer.json` records the last actual writer, not a latest-version requirement. Older versions must upgrade before writing; equal versions must match identity; newer versions review their migration guidance and migrate explicitly only if required. No command authorizes a semantic migration. A missing record means unknown history, not proof an old writer is safe.

Successful template/apply/record operations include writer metadata atomically with authority. After Skill-driven document edits or external view generation, run `suo --root PROJECT writer record --yes` and commit `suo/writer.json` with the edited content. Versions and digests come from the executing package, never hand-entered. Read-only inspect/check/export/next/render and failed mutations do not record a writer. A record is declared package provenance, not proof of host session loading; confirm the actual loaded Skill matches the CLI. Suo owns only its own record and has no dependency on other workflow tools. See [writer protocol](references/writer.md).

## Read the actual snapshot

Use `suo --root PROJECT inspect` and `next`; the default is committed HEAD, independent of dirty files. Use `--ref FULL_SHA` for another explicit committed snapshot, `--target index` for staged bytes, or `--target working-tree` for a clearly labelled candidate. Never present a dirty preview as the committed state. `export` returns the typed snapshot plus its observed content token. `check` validates structure and mappings; its success is not behavioral verification.

Authority is Git-contained `suo/**/*.suo.ts` and its generated exact ontology. Relationships import canonical objects. The flat registry supports arbitrary logical nesting without nested data syntax. Markdown/Obsidian can display a generated `render` view; an external Vault state file is not supported authority. Do not maintain TS and Markdown as parallel current-state stores. Old schemas require explicit migration, not weaker validation: see [upgrade guidance](https://github.com/stevenlyd/suo/blob/main/docs/validation-upgrade.md).

## Define and update

Keep objective, included behavior, exclusions, criteria, constraints, scope completeness, current decisions, dependencies and own composition obligations concrete. Children need not wait for an open parent to finish shaping when their local contract is defined. A parent completion claim needs its own integration obligations and complete declared child scope; children alone do not prove composition correctness. Null required-check policy means unresolved. Empty checks or own obligations require a real rationale and must not be inferred merely because no checks/evidence were found.

Distinguish product choices from technical implementation choices. Ask only for genuinely missing product intent; continue independent work. Never invent approved scope, assignee acceptance, required-check policy or user acceptance. An unresolved feature can stay proposed/experimental while independent selected Units proceed. Preserve branch-specific experiments and concurrent edits.

For a reviewed whole-snapshot update, write `{ "expectedToken": "OBSERVED_TOKEN", "snapshot": ... }` to a file outside the observed repository, then run `suo --root PROJECT apply FILE --yes` within user authorization. Re-read after conflicts; never substitute a new token without reviewing the changed inputs. Git commits/PRs are the shared publication flow; there is no proposal-history ledger or product generation counter.

## Implementation coverage and delivery

`record FILE --yes` accepts exactly `expectedToken`, `unitId`, `state`, `coverage`, and `gaps`. States are unknown, not_started, in_progress, implemented. Coverage maps criterion IDs to repository paths, optional TS/JS symbols and source/test kinds. The command binds the declaration to current definition/input fingerprints. Review actual code before declaring implementation; path existence, type checks and hashes do not prove semantics. A missing realization is unknown, not “not implemented.” Do not rebind stale declarations mechanically.

Inspect applicability after code, configuration, lockfile, dependency or definition changes. For a stale declaration, `suo --root PROJECT explain UNIT_ID` uses Git history to name the binding commit, whether its base is exactly reproduced, changed own-definition fields and the added/removed/modified/excluded/included input paths; review those changes before any rebinding. An inexact or missing base widens, not narrows, the review. Stale/unknown mappings cannot support a current completion claim, even if a prior receipt said accepted. All source/config/new-file inputs are included conservatively except explicitly declared non-runtime paths and Suo authority/views. Review exclusions; do not hide indirect runtime inputs. LFS/gitlink or other unavailable inputs remain unknown. Source mappings cannot point into exclusions.

Suo stores no current CI result, PR status, other-branch inclusion, deployment status or external execution approval. Committing a provider observation does not turn it into a current-code fact. Persist versioned test/check requirements and normative product decisions; consuming engineering workflows run checks and query providers/live manifests at use time. Product scope selection, declared implementation, behavioral verification, product acceptance and deployment authorization remain distinct.

Keep any owning engineering record discoverable via Unit `documents` and update current implementation coverage for only the selected Units. Engineering records describe fixes and repository validation rules/mappings; do not turn Suo into a build-log ledger. Consumers are responsible for live delivery verification and their own authorizations. A supplied link is not independent provider verification. Suo requires no particular engineering workflow tool, and no checklist grants deployment or destructive cleanup permission.

## Integrity and recovery

Strict runtime shapes, canonical references, single-parent containment, typed dependency and derived phase graphs reject malformed input and deadlocks. All owned graph/hierarchy traversals use explicit stacks/queues. Natural-language constraints and behavior still require semantic review, including inherited constraints. Static consistency is not authenticated identity or actual acceptance.

Writes stage and validate source, compare the observed token, then use a lock and recovery journal. Do not read a pending working-tree transaction as final. `recover` verifies identities before restoring; conflicting data stays preserved. A crash can leave a lock: verify no writer remains before manual lock removal. Do not bypass validation to restore old formats. Roll back project and matching client together only where reviewed; after schema-5 edits, an old client alone is not a data rollback.

## Snapshot definitions and work discovery

Current product definitions include adopted behavior that is not implemented yet. `approved` is a product decision; implementation and its applicability remain separate. Missing coverage is unknown, not not-started. Proposed/deferred definitions describe the selected snapshot, not a global task queue. `expectedAssignee` is a versioned expectation, not live assignment, consent or activity. `next` projects this snapshot only; use the project's external work index for cross-branch tasks. Cancelling a task or implementation approach does not revoke an adopted definition. Product decisions may be reviewed/promoted independently of code; do not fabricate implementation or acceptance to publish a definition.
