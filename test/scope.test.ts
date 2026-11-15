import { it, expect, beforeEach, afterEach, describe, vi } from 'vitest'
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createUnitTemplate, saveUnits } from '../src/unit-store.js'
import { readRepository, loadRepositoryUnits } from '../src/unit-checkout.js'
import { inspectUnits, boundInputs, validateUnits, unitInputScopes } from '../src/unit-core.js'
import { explainUnit } from '../src/unit-explain.js'
import { rescopeUnits } from '../src/unit-rescope.js'
import { unitOntology, legacyUnitOntology } from '../src/unit-source.js'
import { digest } from '../src/unit-identity.js'
import type { InputPolicy, Unit, UnitSnapshot } from '../src/unit-model.js'

// Each load compiles the TS authority; Git fixtures with several loads exceed the default timeout on busy runners.
vi.setConfig({ testTimeout: 60_000 })
let root: string
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
const commit = (message: string) => { git('add', '-A'); git('commit', '-q', '-m', message); return git('rev-parse', 'HEAD').trim() }
const write = (path: string, text: string) => writeFile(join(root, path), text)
const unit = (id: string, path: string): Unit => ({ id, title: id, labels: [], expectedAssignee: null, definition: { objective: 'App', included: [], behavior: ['Works'], exclusions: [], scope: 'bounded', decision: 'approved', criteria: [{ id: 'c', text: 'C' }], ownObligations: [], ownRationale: 'None', checks: null, checkRationale: null, constraints: [] }, implementation: { state: 'implemented', definitionDigest: null, inputDigest: null, coverage: [{ criterionId: 'c', path, symbol: null, kind: 'source' }], gaps: [] }, documents: [] })
const repositoryPolicy: InputPolicy = { nonRuntimePaths: ['docs'], rationale: 'Docs are not runtime inputs', scope: 'repository', sharedPaths: [] }
const declaredPolicy: InputPolicy = { nonRuntimePaths: ['docs'], rationale: 'Docs are not runtime inputs; each Unit binds its own mapping', scope: 'declared', sharedPaths: ['shared'] }
const unbound = (u: Unit): Unit => ({ ...u, implementation: { ...u.implementation, state: 'unknown', coverage: [] } })
async function load() { const repo = await readRepository(root, 'working-tree'); return { repo, snapshot: await loadRepositoryUnits(repo) } }
const applicability = async (target: 'commit' | 'working-tree' = 'working-tree') => { const repo = await readRepository(root, target), s = await loadRepositoryUnits(repo); return Object.fromEntries(inspectUnits(s, repo.context).units.map(u => [u.id, u.applicability])) }
/** Same binding as the CLI `record` command, for every listed Unit. */
async function record(ids: string[], paths: Record<string, string>) {
  const { repo, snapshot } = await load(), p = inspectUnits(snapshot, repo.context)
  for (const id of ids) { const u = snapshot.units.find(x => x.id === id)!, b = p.units.find(x => x.id === id)!; u.implementation = { ...unit(id, paths[id]!).implementation, definitionDigest: b.coverageDigest, inputDigest: null } }
  const scopes = unitInputScopes(snapshot, repo.context)
  for (const id of ids) snapshot.units.find(x => x.id === id)!.implementation.inputDigest = scopes.identity(id)
  await saveUnits(root, snapshot, repo.token)
}
async function setPolicy(policy: InputPolicy) { const { repo, snapshot } = await load(); snapshot.inputPolicy = policy; await saveUnits(root, snapshot, repo.token) }
const paths = { a: 'src/a.ts', b: 'src/b.ts', c: 'src/c.ts' }

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'suo-scope-'))
  git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test')
  await createUnitTemplate(root, { schemaVersion: 5, product: { id: 'p', title: 'P' }, units: [unbound(unit('a', paths.a)), unbound(unit('b', paths.b)), unbound(unit('c', paths.c))], decisions: [], containment: [], dependencies: [], inputPolicy: repositoryPolicy })
  await mkdir(join(root, 'src')); await mkdir(join(root, 'shared')); await mkdir(join(root, 'docs'))
  await write('.gitignore', '.suo/\n'); for (const path of Object.values(paths)) await write(path, `export const v = '${path}'\n`)
  await write('src/helper.ts', 'export const h = 1\n'); await write('shared/config.json', '{}\n'); await write('docs/a.md', 'A\n'); commit('Initial')
})
afterEach(() => rm(root, { recursive: true, force: true }))

describe('declared input scope', () => {
  beforeEach(async () => { await setPolicy(declaredPolicy); await record(['a', 'b', 'c'], paths); commit('Declared bindings') })
  it('keeps a Unit current when an unrelated file changes', async () => {
    await write('src/b.ts', 'export const v = 2\n'); await write('src/new.ts', '1\n'); await write('src/helper.ts', 'export const h = 2\n'); commit('Unrelated to a')
    expect(await applicability('commit')).toEqual({ a: 'current', b: 'stale', c: 'current' })
  })
  it('makes a Unit stale when its mapped file or a shared input changes', async () => {
    await write('src/a.ts', 'export const v = 3\n'); expect((await applicability()).a).toBe('stale')
    git('checkout', '--', 'src/a.ts'); await write('shared/config.json', '{"x":1}\n'); expect(await applicability()).toEqual({ a: 'stale', b: 'stale', c: 'stale' })
  })
  it('still fails inspection when a mapped file is deleted or renamed', async () => {
    git('mv', 'src/a.ts', 'src/renamed.ts'); commit('Rename mapped file')
    const repo = await readRepository(root, 'commit'), s = await loadRepositoryUnits(repo)
    expect(() => inspectUnits(s, repo.context)).toThrow(/dangling source reference: a\/src\/a.ts/)
  })
  it('explains only the Unit\'s own inputs and labels scope changes', async () => {
    const bound = git('rev-parse', 'HEAD').trim()
    await write('src/a.ts', 'export const v = 4\n'); await write('src/b.ts', 'export const v = 4\n'); commit('Code')
    expect((await explainUnit(root, 'commit', 'HEAD', 'a')).inputs).toEqual({ changed: true, base: { commit: bound, exact: true }, policyChanged: false, changes: [{ path: 'src/a.ts', change: 'modified' }] })
    const { repo, snapshot } = await load(); snapshot.units[0]!.implementation.coverage.push({ criterionId: 'c', path: 'src/helper.ts', symbol: null, kind: 'test' }); await saveUnits(root, snapshot, repo.token); commit('Map helper without rebinding')
    expect((await explainUnit(root, 'commit', 'HEAD', 'a')).inputs?.changes).toEqual([{ path: 'src/a.ts', change: 'modified' }, { path: 'src/helper.ts', change: 'included' }])
  })
  it('rejects shared inputs outside declared scope or inside exclusions', async () => {
    const { snapshot } = await load()
    expect(() => validateUnits({ ...snapshot, inputPolicy: { ...repositoryPolicy, sharedPaths: ['shared'] } })).toThrow(/declared input scope/)
    expect(() => validateUnits({ ...snapshot, inputPolicy: { ...declaredPolicy, sharedPaths: ['docs/x'] } })).toThrow(/shared input excluded/)
  })
})

it('keeps 0.10 bindings and ontology readable, then upgrades the ontology on write without changing applicability', async () => {
  await record(['a'], paths); commit('Repository binding')
  const { repo, snapshot } = await load(), legacyDigest = digest({ policy: { nonRuntimePaths: ['docs'], rationale: repositoryPolicy.rationale }, entries: boundInputs(snapshot, repo.context) })
  expect(snapshot.units[0]!.implementation.inputDigest).toBe(legacyDigest)
  // Rewrite the authority exactly as 0.10 wrote it.
  const product = await readFile(join(root, 'suo/product.suo.ts'), 'utf8')
  await write('suo/ontology.d.ts', legacyUnitOntology); await write('suo/product.suo.ts', product.replace(',"scope":"repository","sharedPaths":[]', '')); commit('As 0.10 wrote it')
  expect((await load()).snapshot.inputPolicy).toEqual(repositoryPolicy)
  expect(await applicability('commit')).toEqual({ a: 'current', b: 'unknown', c: 'unknown' })
  await write('src/b.ts', 'changed\n'); expect((await applicability()).a).toBe('stale')
  git('checkout', '--', 'src/b.ts'); await setPolicy(repositoryPolicy)
  expect(await readFile(join(root, 'suo/ontology.d.ts'), 'utf8')).toBe(unitOntology)
  expect((await applicability()).a).toBe('current')
})

it('rescope translates each binding from its exact base and never vouches for unbound inputs', async () => {
  await record(['a', 'b', 'c'], paths); commit('Repository bindings')
  await write('src/helper.ts', 'export const h = 2\n'); commit('Unrelated change')
  await write('src/c.ts', 'export const v = 5\n'); commit('Change c')
  await record(['a'], paths); commit('Rebind a')
  expect(await applicability('commit')).toEqual({ a: 'current', b: 'stale', c: 'stale' })
  const { repo } = await load(), dry = await rescopeUnits(root, repo.token, declaredPolicy, 200, false)
  expect(dry.saved).toBe(false); expect(await applicability()).toEqual({ a: 'current', b: 'stale', c: 'stale' })
  const report = await rescopeUnits(root, repo.token, declaredPolicy)
  expect(report.units).toMatchObject([{ unitId: 'a', result: 'translated', base: 'working-tree', inputs: 'current' }, { unitId: 'b', result: 'translated', inputs: 'current' }, { unitId: 'c', result: 'translated', inputs: 'stale' }])
  expect(await applicability()).toEqual({ a: 'current', b: 'current', c: 'stale' })
  const rescoped = commit('Rescope')
  const explained = await explainUnit(root, 'commit', 'HEAD', 'c')
  expect(explained).toMatchObject({ bindingCommit: rescoped, inputs: { changed: true, base: { exact: true }, changes: [{ path: 'src/c.ts', change: 'modified' }] } })
  // Widening back to the whole repository binds files no declared binding vouched for.
  const back = await rescopeUnits(root, (await load()).repo.token, repositoryPolicy)
  expect(back.units.map(u => u.result)).toEqual(['kept', 'kept', 'kept'])
  expect(await applicability()).toEqual({ a: 'stale', b: 'stale', c: 'stale' })
})

it('rescope keeps a binding it cannot reproduce exactly', async () => {
  await write('src/b.ts', 'uncommitted\n'); await record(['b'], paths); await write('src/b.ts', 'later\n'); commit('Record between edits')
  const report = await rescopeUnits(root, (await load()).repo.token, declaredPolicy)
  expect(report.units).toEqual([{ unitId: 'b', result: 'kept', reason: 'recorded input fingerprint is not exactly reproduced by any candidate base (binding commit, its parent, the merged branch or a translated binding)' }])
  expect((await applicability()).b).toBe('stale')
})

it('finds the exact base of a binding recorded on a merged branch', async () => {
  git('checkout', '-q', '-b', 'feature'); await record(['a'], paths); const recorded = commit('Record on branch')
  await write('src/b.ts', 'branch work\n'); commit('More branch work')
  git('checkout', '-q', 'main'); await write('src/c.ts', 'main work\n'); commit('Main moves on')
  git('merge', '-q', '--no-ff', '-m', 'Merge feature', 'feature'); const merge = git('rev-parse', 'HEAD').trim()
  expect((await explainUnit(root, 'commit', 'HEAD', 'a'))).toMatchObject({ bindingCommit: merge, inputs: { base: { commit: recorded, exact: true } } })
  const report = await rescopeUnits(root, (await load()).repo.token, declaredPolicy)
  expect(report.units).toEqual([{ unitId: 'a', result: 'translated', base: recorded, inputs: 'current' }])
})
