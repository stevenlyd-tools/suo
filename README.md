# Suo 梭

**A shuttle for thought.**

Suo is a portable Skill backed by deterministic local tools. It helps a person turn an idea into a clear product definition, keep that definition beside the code, and see which parts have current implementation coverage. The Skill is the needle; each project is the fabric.

> Your idea is the work. Suo is only the shuttle.

## Start with a sentence

People normally use Suo through a compatible agent:

> I have an idea for a private client gallery. Help me define the smallest useful version.

The agent reads the project's current definitions, helps make the behavior and boundaries concrete, and brings missing product choices back to you. It can recommend a choice and prepare an exact change; it cannot invent your approval, required checks, or acceptance. Independent work can continue while an unresolved choice stays visible.

You do not need to design a hierarchy before starting. Begin with one useful piece of behavior, then give it more structure as the product takes shape.

```text
Human intent
  → Agent + Suo Skill
  → reviewed product definitions and code mappings
  → Suo CLI validation
  → repository TypeScript + normal Git review
```

## The loop

```text
“I have an idea”
→ clarify a bounded piece of behavior
→ review its definition, choices and dependencies
→ commit the authorized definition
→ implement and map criteria to actual code
→ inspect what is current, missing or stale
→ choose the next useful piece
```

Suo describes the product at the selected commit. Git keeps earlier definitions and branch-specific experiments. There is no separate product-history ledger to maintain, and another agent can continue from the same repository without inheriting the previous conversation.

A definition, an implementation declaration, a successful test, and a person's acceptance are different things. Suo helps keep those distinctions visible.

## One Unit, many useful sizes

A **Unit** is a piece of product behavior with its own objective, scope and criteria. A whole application, a module and a small feature can all be Units; those names are labels, not fixed levels.

For a client gallery, you might describe:

```text
Client gallery
├── Private viewing
│   ├── Sign in
│   └── View delivered photographs
└── Download selected photographs
```

The registry is flat; containment expresses the logical nesting. A Unit has at most one parent, with no fixed depth limit. Use a meaningful boundary rather than creating a Unit for every sentence. A child can have a defined local contract while its parent is still open. A parent needs bounded scope, complete children and its own composition obligations before its declared implementation is complete.

Each Unit can hold:

- **Definition:** objective, included behavior, exclusions, observable criteria and open or bounded scope.
- **Choices:** proposed, experimental, approved or deferred selection; attached decisions with alternatives, rationale and unresolved questions.
- **Constraints and checks:** local or inherited constraints, required-check policy, and the parent's own integration obligations.
- **Implementation:** unknown, not started, in progress or implemented, with source/test mappings and explicit gaps.
- **Context:** labels, relevant repository document paths and an intended assignee. Assignment is an expectation, not proof that someone accepted work.

Dependencies are separate from containment. A dependency says which prerequisite is needed—its **contract**, **implementation** or **verification**—and when the consuming Unit needs it: **start**, **verify** or **accept**. For example, gallery viewing can require the sign-in contract before work starts without pretending that sign-in has already been deployed. Suo checks the resulting dependency and phase graphs for cycles; it does not perform external verification.

See the [small Unit snapshot](https://github.com/stevenlyd/suo/blob/main/examples/current-units.json), [typed model](https://github.com/stevenlyd/suo/blob/main/src/unit-model.ts) and [runtime contract](docs/unit-runtime.md) for the exact fields and rules.

## Install the skill and runtime

Use the [native distribution guide](docs/distribution.md) for Codex, Claude Code, Cursor, Copilot CLI/VS Code, Gemini CLI, Hermes and Pi. All native manifests discover the same canonical `skills/suo/` tree. Keep the source registered through your host's supported marketplace/package mechanism rather than copying skill files into managed caches.

The Skill and Node CLI are separate installations. Install the runtime from a reviewed full Git commit using the guide's pinned npm Git procedure; select the same revision for the Skill where the host supports it. Verify the executable **from the agent's environment**, not only an interactive shell:

```sh
suo --version
suo --help
```

Here, `suo` means the verified executable on your PATH; otherwise use its absolute path. Match its version to the loaded Skill before mutations. If you know where the host loaded the Skill (for example a plugin cache), `suo --root PROJECT writer check --skill PATH` compares that Skill's digest without executing anything there. A catalog refresh does not prove that an installed plugin, running session or separate runtime has updated. Apply upgrades at a new session boundary and retain the previous runtime for recovery. Native plugin installation does not require publishing Suo to npm.

For existing projects using older schemas, read the [explicit schema-5 migration guide](docs/validation-upgrade.md) first. Installing a newer client does not convert project authority.

## Try it in a disposable project

The following walkthrough runs from a clone of **this repository**, with Node.js 22.18+, pnpm 10.28.1 and Git available. Configure your normal Git author identity before committing. This uses the checkout's CLI and makes no host plugin installation.

### 1. Build and create a project

```sh
pnpm install --frozen-lockfile
pnpm build
SUO="$PWD/dist/cli.js"
DEMO="$(mktemp -d)"
node "$SUO" --version
node "$SUO" template "$DEMO" --title 'My client gallery'
git -C "$DEMO" init -b main
printf '.suo/\n' > "$DEMO/.gitignore"
node "$SUO" --root "$DEMO" --target working-tree inspect
```

The template starts with an empty Unit registry. There is no committed HEAD yet, so the first inspection explicitly selects the working tree. The `.suo/` directory is local transaction state, not product history.

### 2. Add one proposed Unit

The repository's example is deliberately incomplete: its selection is proposed, implementation is unknown, and check/integration policy is unresolved. It is a starting point for a conversation, not a claim that a product is ready.

Export the observed candidate and prepare an update envelope **outside** the demo repository, so writing the request does not change the inputs it describes:

```sh
SNAPSHOT="$(mktemp)"
REQUEST="$(mktemp)"
node "$SUO" --root "$DEMO" --target working-tree export > "$SNAPSHOT"
node --input-type=module - "$SNAPSHOT" "$REQUEST" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs'
const [snapshotFile, requestFile] = process.argv.slice(2)
const { expectedToken, snapshot } = JSON.parse(readFileSync(snapshotFile, 'utf8'))
const example = JSON.parse(readFileSync('examples/current-units.json', 'utf8'))
snapshot.units = example.units
writeFileSync(requestFile, JSON.stringify({ expectedToken, snapshot }, null, 2))
JS
cat "$REQUEST"
```

Review the proposed fields. In this disposable walkthrough, applying that reviewed example is the next step:

```sh
node "$SUO" --root "$DEMO" apply "$REQUEST" --yes
node "$SUO" --root "$DEMO" --target working-tree check
node "$SUO" --root "$DEMO" --target working-tree next
```

`check` can succeed while `next` still reports blockers. The model is structurally valid; the product choices and implementation remain unfinished. `--yes` confirms execution of the mutation; it is not proof of a person's product acceptance.

### 3. Commit and read the shared state

```sh
git -C "$DEMO" add .gitignore suo
git -C "$DEMO" commit -m 'Define the first proposed Unit'
node "$SUO" --root "$DEMO" inspect
node "$SUO" --root "$DEMO" check
node "$SUO" --root "$DEMO" next
node "$SUO" --root "$DEMO" render
```

Default reads now use committed HEAD, independently of later working-tree edits. `render` writes a Markdown view to stdout; it does not write authority or claim completion. The shell variables `$DEMO`, `$SNAPSHOT` and `$REQUEST` identify the disposable walkthrough files if you want to explore further.

In a real project, replace the example with your actual definitions and use the project's normal branch, review and commit process. `template` refuses an existing `suo/` authority; inspect or migrate it instead of initializing over it.

## What travels with the project

```text
<project>/
├── suo/
│   ├── product.suo.ts       authority root and canonical relationships
│   ├── ontology.d.ts        generated exact TypeScript contract
│   ├── units/*.suo.ts       Unit definitions and implementation declarations
│   └── decisions/*.suo.ts   attached decisions, when present
├── src/, tests/, …          actual implementation and checks
├── docs/suo/                optional disposable reading views
└── .suo/                   local lock, staging and recovery state
```

The writer generates stable filenames from IDs. `suo/**/*.suo.ts` and the exact generated ontology form the current authority. Relationships in the TypeScript root import canonical Unit and decision objects; JSON export/envelope IDs are the interchange format, not a second editable store. Source must remain declarative—arbitrary executable expressions and dynamic imports are rejected. Do not weaken `ontology.d.ts` to make an old model type-check.

`docs/suo/` is only a conventional destination if you choose to save rendered output. Markdown or Obsidian can display that view; they do not become another current-state authority. Git commits keep the versioned definitions, code and relevant documents together.

## Read the snapshot you mean

Use an explicit project root; there is no persistent active project. The default root is the current directory, so do not assume discovery from an arbitrary nested directory.

| Read selection | Meaning |
| --- | --- |
| `suo --root PROJECT inspect` | Committed HEAD, unaffected by dirty files. |
| `suo --root PROJECT --ref FULL_SHA inspect` | One explicit committed snapshot. |
| `suo --root PROJECT --target index inspect` | Staged bytes, clearly a candidate. |
| `suo --root PROJECT --target working-tree inspect` | Tracked and unignored candidate files. |

The same target options apply to `check`, `export`, `next` and `render`. `next` lists Units whose implementation is not established, with readiness and blockers; it does not choose one global action or silently approve work.

## Record implementation honestly

After reviewing actual code, an agent can prepare a `record` envelope containing exactly `expectedToken`, `unitId`, `state`, `coverage` and `gaps`. Coverage maps criterion IDs to repository paths, optional TS/JS symbol names, and `source` or `test` kinds. Run `suo --root PROJECT record FILE --yes` only for the reviewed declaration.

`record` binds the declaration to the observed definition and repository input fingerprints. Changed definitions, dependencies, source, configuration or lockfiles can make it stale. Relevant new candidate files count too. Reinspect and review the change before rebinding; substituting a new token is not a review. `suo --root PROJECT explain UNIT_ID [--depth N]` is the read-only aid for that review: it finds the first-parent commit that introduced the binding, reports whether that commit or its parent reproduces the recorded input fingerprint (`exact`), and lists changed own-definition fields, decisions, input-policy changes and changed input paths. Paths that still exist but changed bound status under a new policy are `excluded`/`included`. The output is guidance, never permission to rebind.

A complete declared implementation needs source coverage for every criterion and own integration obligation, plus the required child scope. A missing declaration remains **unknown**. A null check policy remains **unresolved**, not an empty list of checks. Even a current, complete declaration does not prove correct behavior or user acceptance. See the [CLI end-to-end example](https://github.com/stevenlyd/suo/blob/main/test/cli-e2e.mjs) for a runnable record/inspect/stale-input exercise.

## Deterministic boundaries

The local tools check strict shapes, canonical references, containment and dependency cycles, machine-checkable inherited constraints, source mappings, content applicability and stale writes. They stage and validate candidate source before replacing authority. An observed content token, project lock and recovery journal protect cooperating writes; conflicting input must be reread and reviewed.

They cannot understand every natural-language constraint, prove behavior from a file or symbol, authenticate a supplied identity, decide that a user accepted the product, or infer deployment from a merge. Required checks are versioned requirements; CI, PR and deployment outcomes are not stored as current Suo facts. A content hash proves unchanged supplied inputs, not correctness.

Unavailable inputs remain unknown. Explicit non-runtime exclusions are reviewed assertions about input scope; do not use them to hide relevant code or indirect runtime dependencies. A pending transaction is not a final working-tree snapshot. See [runtime integrity and recovery](docs/unit-runtime.md) before using `recover`; preserve conflicting data rather than deleting a journal to make an error disappear.

The agent owns dialogue, research and semantic judgment. You own product intent and acceptance. Suo keeps the repository model precise enough for both to inspect.

## Development

From this repository, using Node.js 22.18+ and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm distribution:generate
pnpm check
node test/cli-e2e.mjs
pnpm test:package
pnpm benchmark:units
```

`pnpm check` runs type checks, tests, build, distribution checks and release-note checks. Package tests exercise the production runtime through tarball and pinned Git installations. The benchmark measures deep, wide and dependency-heavy Unit graphs; its timings are observations, not a universal performance claim. See [distribution testing](docs/testing/distribution.md) for scope and limitations.

The main implementation lives in `src/`, the committed runtime in `dist/`, the canonical Skill in `skills/suo/`, and runtime schemas in `schemas/`. TypeScript and esbuild support validated source loading; hashes and schema checks support consistency, not publisher authentication.

## Releases and upgrades

[CHANGELOG.md](CHANGELOG.md) records behavior, breaking changes and migration requirements. The [release process](docs/releases.md) explains version consistency, validation and publishing; the [distribution guide](docs/distribution.md) explains installation, update and rollback. Read the [schema migration guide](docs/validation-upgrade.md) before moving older project definitions to schema 5.

## License

[MIT](LICENSE)

## Snapshot definitions and work discovery

Current product definitions include adopted behavior that is not implemented yet. `approved` is a product decision; implementation and its applicability remain separate. Missing coverage is unknown, not not-started. Proposed/deferred definitions describe the selected snapshot, not a global task queue. `expectedAssignee` is a versioned expectation, not live assignment, consent or activity. `next` projects this snapshot only; use the project's external work index for cross-branch tasks. Cancelling a task or implementation approach does not revoke an adopted definition. Product decisions may be reviewed/promoted independently of code; do not fabricate implementation or acceptance to publish a definition.
