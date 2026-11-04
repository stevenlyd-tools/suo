import { it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createUnitTemplate, saveUnits } from '../src/unit-store.js'
import { readRepository, loadRepositoryUnits } from '../src/unit-checkout.js'
import { inspectUnits } from '../src/unit-core.js'
import { explainUnit } from '../src/unit-explain.js'
import type { Unit, UnitSnapshot } from '../src/unit-model.js'

let root: string
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
const commit = (message: string) => { git('add', '-A'); git('commit', '-q', '-m', message); return git('rev-parse', 'HEAD').trim() }
const unit: Unit = { id: 'u', title: 'U', labels: [], expectedAssignee: null, definition: { objective: 'App', included: [], behavior: ['App exists'], exclusions: [], scope: 'bounded', decision: 'approved', criteria: [{ id: 'app', text: 'App' }], ownObligations: [], ownRationale: 'None', checks: null, checkRationale: null, constraints: [] }, implementation: { state: 'unknown', definitionDigest: null, inputDigest: null, coverage: [], gaps: [] }, documents: [] }
async function edit(change: (s: UnitSnapshot) => void) { const repo = await readRepository(root, 'working-tree'), s = await loadRepositoryUnits(repo); change(s); await saveUnits(root, s, repo.token) }
/** Same binding as the CLI `record` command. */
async function record() {
  const repo = await readRepository(root, 'working-tree'), s = await loadRepositoryUnits(repo), p = inspectUnits(s, repo.context)
  s.units[0]!.implementation = { state: 'in_progress', coverage: [{ criterionId: 'app', path: 'app.ts', symbol: null, kind: 'source' }], gaps: ['Fixture'], definitionDigest: p.units[0]!.coverageDigest, inputDigest: p.inputDigest }
  await saveUnits(root, s, repo.token)
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'suo-explain-'))
  git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test')
  await createUnitTemplate(root, { schemaVersion: 5, product: { id: 'p', title: 'P' }, units: [unit], decisions: [], containment: [], dependencies: [], inputPolicy: { nonRuntimePaths: [], rationale: 'All inputs' } })
  await writeFile(join(root, '.gitignore'), '.suo/\n'); await writeFile(join(root, 'app.ts'), 'export const app = 1\n'); await writeFile(join(root, 'meta.json'), '{"v":1}\n'); commit('Initial')
})
afterEach(() => rm(root, { recursive: true, force: true }))

it('names the exact binding base and every changed input since a committed record', async () => {
  await record(); const bound = commit('Record')
  expect((await explainUnit(root, 'commit', 'HEAD', 'u')).inputs).toMatchObject({ changed: false })
  await writeFile(join(root, 'app.ts'), 'export const app = 2\n'); await writeFile(join(root, 'new.ts'), '1\n'); await rm(join(root, 'meta.json')); commit('Code')
  const result = await explainUnit(root, 'commit', 'HEAD', 'u')
  expect(result).toMatchObject({ applicability: 'stale', bindingCommit: bound, definition: { changed: false } })
  expect(result.inputs).toEqual({ changed: true, base: { commit: bound, exact: true }, policyChanged: false, changes: [{ path: 'app.ts', change: 'modified' }, { path: 'meta.json', change: 'removed' }, { path: 'new.ts', change: 'added' }] })
})
it('finds the exact base in the parent when the record commit also changed inputs', async () => {
  const parent = git('rev-parse', 'HEAD').trim()
  await record(); await writeFile(join(root, 'meta.json'), '{"v":2}\n'); const bound = commit('Record with provenance change')
  const result = await explainUnit(root, 'commit', 'HEAD', 'u')
  expect(result.bindingCommit).toBe(bound)
  expect(result.inputs).toEqual({ changed: true, base: { commit: parent, exact: true }, policyChanged: false, changes: [{ path: 'meta.json', change: 'modified' }] })
})
it('marks a never-committed base inexact and compares with the parent of the binding commit', async () => {
  const parent = git('rev-parse', 'HEAD').trim()
  await writeFile(join(root, 'meta.json'), '{"v":2}\n'); await record(); await writeFile(join(root, 'meta.json'), '{"v":3}\n'); commit('Record between edits')
  expect((await explainUnit(root, 'commit', 'HEAD', 'u')).inputs).toEqual({ changed: true, base: { commit: parent, exact: false }, policyChanged: false, changes: [{ path: 'meta.json', change: 'modified' }] })
})
it('explains a working-tree binding against HEAD and reports policy changes', async () => {
  const head = git('rev-parse', 'HEAD').trim()
  await record(); await writeFile(join(root, 'app.ts'), 'export const app = 3\n')
  expect((await explainUnit(root, 'working-tree', 'HEAD', 'u')).inputs).toEqual({ changed: true, base: { commit: head, exact: true }, policyChanged: false, changes: [{ path: 'app.ts', change: 'modified' }] })
  await edit(s => { s.inputPolicy.nonRuntimePaths = ['meta.json'] })
  expect((await explainUnit(root, 'working-tree', 'HEAD', 'u')).inputs).toMatchObject({ policyChanged: true, changes: [{ path: 'app.ts', change: 'modified' }, { path: 'meta.json', change: 'excluded' }] })
})
it('lists changed own-definition fields and decisions without touching inputs', async () => {
  await record(); const bound = commit('Record')
  await edit(s => { s.units[0]!.definition.behavior.push('More'); s.decisions.push({ id: 'd', unitId: 'u', question: 'Q', alternatives: [], recommendation: null, status: 'open', choice: null, rationale: null, prerequisites: [] }) }); commit('Definition')
  const result = await explainUnit(root, 'commit', 'HEAD', 'u')
  expect(result.definition).toEqual({ changed: true, fields: ['behavior'], decisionsChanged: true, comparedWith: bound })
  expect(result.inputs).toMatchObject({ changed: false, changes: [] })
})
it('returns no history claim for an unrecorded Unit and rejects unknown Units', async () => {
  expect(await explainUnit(root, 'commit', 'HEAD', 'u')).toMatchObject({ applicability: 'unknown', bindingCommit: null, definition: null, inputs: null })
  await expect(explainUnit(root, 'commit', 'HEAD', 'missing')).rejects.toThrow(/unknown Unit/)
})
it('stops at history whose authority this client cannot read', async () => {
  git('checkout', '-q', '--orphan', 'legacy'); git('rm', '-rq', '--cached', '.')
  await rm(join(root, 'suo'), { recursive: true, force: true }); await mkdir(join(root, 'suo'))
  await writeFile(join(root, 'suo/product.suo.ts'), 'export default {schemaVersion: 4}\n'); commit('Legacy schema')
  git('checkout', '-q', 'main', '--', 'suo'); await record(); const bound = commit('Migrate and record')
  await writeFile(join(root, 'app.ts'), 'export const app = 9\n'); commit('Code')
  expect(await explainUnit(root, 'commit', 'HEAD', 'u')).toMatchObject({ bindingCommit: bound, inputs: { changed: true } })
})
