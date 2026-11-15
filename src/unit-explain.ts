import { execFileSync } from 'node:child_process'
import { readRepository, readCommitAuthority, loadRepositoryUnits } from './unit-checkout.js'
import { inspectUnits, unitInputScopes } from './unit-core.js'
import { canonical } from './unit-identity.js'
import { unboundImports, type UnboundImport } from './unit-imports.js'
import type { CheckoutContext, Unit, UnitSnapshot } from './unit-model.js'

type Target = CheckoutContext['target']
/** `excluded`/`included`: the file exists on both sides but the input policy changed whether it is bound. */
export interface InputChange { path: string; change: 'added' | 'removed' | 'modified' | 'excluded' | 'included' }
export interface UnitExplanation {
  unitId: string; applicability: 'current' | 'unknown' | 'stale'; unavailable: string[]
  /** First-parent commit that introduced the recorded binding; null when it is uncommitted, unrecorded or beyond the search depth. */
  bindingCommit: string | null
  definition: { changed: boolean; fields: string[]; decisionsChanged: boolean; comparedWith: string | null } | null
  inputs: { changed: boolean; base: { commit: string; exact: boolean } | null; policyChanged: boolean; changes: InputChange[] } | null
  /** Advisory: one-hop imports of mapped source files that are not bound inputs. Never affects applicability. */
  unboundImports: UnboundImport[]
  notice: string
}
const git = (root: string, args: string[]) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
const commit = (root: string, ref: string) => { try { return git(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]).trim() || null } catch { return null } }
const binding = (u: Unit | undefined) => u ? canonical([u.implementation.definitionDigest, u.implementation.inputDigest]) : null

/** Authority snapshots by commit, shared across walks; loading one compiles its TS authority. */
export type AuthorityCache = Map<string, Promise<UnitSnapshot | null>>
const authorityAt = (root: string, sha: string, cache: AuthorityCache) => {
  let loaded = cache.get(sha)
  // Authority this client cannot read (an older schema, or none) cannot hold the current binding.
  if (!loaded) { loaded = readCommitAuthority(root, sha).then(loadRepositoryUnits).catch(() => null); cache.set(sha, loaded) }
  return loaded
}
/** Newest-first walk over authority-changing first-parent commits (optionally not reachable from `exclude`); returns the oldest commit of the contiguous run still holding this binding. */
export async function findBindingCommit(root: string, start: string, unit: Unit, depth: number, cache: AuthorityCache = new Map(), exclude?: string): Promise<{ commit: string; snapshot: UnitSnapshot } | null> {
  const wanted = binding(unit)
  let found: { commit: string; snapshot: UnitSnapshot } | null = null
  for (const sha of git(root, ['rev-list', '--first-parent', `--max-count=${depth}`, start, ...(exclude ? [`^${exclude}`] : []), '--', 'suo']).split('\n').filter(Boolean)) {
    const snapshot = await authorityAt(root, sha, cache)
    if (!snapshot || binding(snapshot.units.find(u => u.id === unit.id)) !== wanted) break
    found = { commit: sha, snapshot }
  }
  return found
}
/** A tree that may hold a binding's exact inputs, and the snapshot (policy and mapping) its recorded fingerprint used there. */
export interface BindingBase { commit: string; snapshot: UnitSnapshot }
/**
 * Trees that may hold the exact inputs of a committed binding, best first: the binding commit and its parent; when the
 * binding commit is a merge, the same search along the merged branch (where the binding was actually recorded); and when it
 * changed the input policy (a `rescope` translation), the bases of the binding it translated, fingerprinted with that
 * binding's own mapping under the translating policy. Lazy, so callers stop at the first exact base. At most `depth` searches.
 */
export async function* bindingBaseCandidates(root: string, found: { commit: string; snapshot: UnitSnapshot }, unitId: string, depth: number, cache: AuthorityCache = new Map()): AsyncGenerator<BindingBase> {
  // `holder` holds the binding being followed through history; `policy` overrides its policy for a translated binding.
  const queue: Array<{ commit: string; holder: UnitSnapshot; policy: UnitSnapshot['inputPolicy'] | null }> = [{ commit: found.commit, holder: found.snapshot, policy: null }]
  const seen = new Set<string>(), yielded = new Set<string>()
  const fresh = (c: BindingBase) => { const key = canonical([c.commit, c.snapshot.inputPolicy, c.snapshot.units.find(u => u.id === unitId) ?? null]); if (yielded.has(key)) return false; yielded.add(key); return true }
  for (let searches = 0; queue.length && searches < depth; searches++) {
    const f = queue.shift()!, test = f.policy ? { ...f.holder, inputPolicy: f.policy } : f.holder
    if (seen.has(canonical([f.commit, f.policy]))) continue
    seen.add(canonical([f.commit, f.policy]))
    const parent = commit(root, `${f.commit}^`), merged = commit(root, `${f.commit}^2`)
    const here = { commit: f.commit, snapshot: test }
    if (fresh(here)) yield here
    if (parent) { const p = { commit: parent, snapshot: test }; if (fresh(p)) yield p }
    const unit = f.holder.units.find(u => u.id === unitId)
    if (merged && parent && unit) { const inner = await findBindingCommit(root, merged, unit, depth, cache, parent); if (inner) queue.push({ commit: inner.commit, holder: inner.snapshot, policy: f.policy }) }
    const prior = parent ? await authorityAt(root, parent, cache) : null, priorUnit = prior?.units.find(u => u.id === unitId)
    if (parent && prior && priorUnit?.implementation.inputDigest && canonical(prior.inputPolicy) !== canonical(f.holder.inputPolicy)) {
      const translated = await findBindingCommit(root, parent, priorUnit, depth, cache)
      if (translated) queue.push({ commit: translated.commit, holder: translated.snapshot, policy: f.policy ?? f.holder.inputPolicy })
    }
  }
}
/** The Unit's scoped inputs under `s`; a snapshot that predates the Unit is read with the Unit's current mapping. */
export function scopedInputs(s: UnitSnapshot, context: CheckoutContext, unit: Unit) {
  const scopes = unitInputScopes(s.units.some(u => u.id === unit.id) ? s : { ...s, units: [...s.units, unit] }, context)
  return { inputs: scopes.inputs(unit.id), identity: scopes.identity(unit.id) }
}
function compareInputs(before: { bound: ReturnType<typeof scopedInputs>['inputs']; context: CheckoutContext }, after: { bound: ReturnType<typeof scopedInputs>['inputs']; context: CheckoutContext }): InputChange[] {
  const old = new Map(before.bound.map(e => [e.path, e])), changes: InputChange[] = []
  const exists = (context: CheckoutContext) => new Set(context.entries.map(e => e.path)), existedBefore = exists(before.context), existsAfter = exists(after.context)
  for (const e of after.bound) { const prior = old.get(e.path); old.delete(e.path); if (!prior) changes.push({ path: e.path, change: existedBefore.has(e.path) ? 'included' : 'added' }); else if (prior.digest !== e.digest || prior.mode !== e.mode) changes.push({ path: e.path, change: 'modified' }) }
  for (const path of old.keys()) changes.push({ path, change: existsAfter.has(path) ? 'excluded' : 'removed' })
  return changes.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}

/** Read-only review guidance for one binding. Git is the only history source; nothing is stored or rebound. */
export async function explainUnit(root: string, target: Target, ref: string, unitId: string, depth = 200): Promise<UnitExplanation> {
  if (!Number.isSafeInteger(depth) || depth < 1) throw new Error('depth must be a positive integer')
  const repository = await readRepository(root, target, ref), snapshot = await loadRepositoryUnits(repository), projection = inspectUnits(snapshot, repository.context)
  const unit = snapshot.units.find(u => u.id === unitId), bound = projection.units.find(u => u.id === unitId)
  if (!unit || !bound) throw new Error('unknown Unit')
  const result: UnitExplanation = { unitId, applicability: bound.applicability, unavailable: repository.context.unavailable, bindingCommit: null, definition: null, inputs: null, unboundImports: unboundImports(snapshot, repository, unitId), notice: 'Review guidance from Git history; not semantic proof, acceptance or permission to rebind.' }
  if (unit.implementation.definitionDigest === null) return result
  const definitionChanged = unit.implementation.definitionDigest !== bound.compositeDigest, inputsChanged = unit.implementation.inputDigest !== bound.inputDigest
  if (!definitionChanged && !inputsChanged) { result.definition = { changed: false, fields: [], decisionsChanged: false, comparedWith: null }; result.inputs = { changed: false, base: null, policyChanged: false, changes: [] }; return result }
  const start = target === 'commit' ? repository.context.identity : commit(root, 'HEAD')
  const cache: AuthorityCache = new Map(), found = start ? await findBindingCommit(root, start, unit, depth, cache) : null
  result.bindingCommit = found?.commit ?? null
  // An uncommitted binding was recorded against a working state derived from HEAD; compare with it, marked inexact unless reproduced.
  const reference = found ?? (start && target !== 'commit' ? await loadRepositoryUnits(await readCommitAuthority(root, start)).then(snapshot => ({ commit: start, snapshot }), () => null) : null)
  const definitionOf = (s: UnitSnapshot) => s.units.find(u => u.id === unitId)?.definition
  if (definitionChanged && reference) {
    const prior = definitionOf(reference.snapshot), current = unit.definition
    const fields = prior ? (Object.keys(current) as Array<keyof typeof current>).filter(key => canonical(prior[key]) !== canonical(current[key])) : Object.keys(current)
    const decisions = (s: UnitSnapshot) => canonical(s.decisions.filter(d => d.unitId === unitId).sort((a, b) => a.id < b.id ? -1 : 1))
    result.definition = { changed: true, fields, decisionsChanged: decisions(reference.snapshot) !== decisions(snapshot), comparedWith: reference.commit }
  } else result.definition = { changed: definitionChanged, fields: [], decisionsChanged: false, comparedWith: null }
  if (!inputsChanged || !reference) { result.inputs = { changed: inputsChanged, base: null, policyChanged: false, changes: [] }; return result }
  const candidates: Array<{ commit: string; context: CheckoutContext; exact: boolean; snapshot: UnitSnapshot }> = []
  for await (const candidate of found ? bindingBaseCandidates(root, found, unitId, depth, cache) : [{ commit: reference.commit, snapshot: reference.snapshot }]) {
    const context = (await readRepository(root, 'commit', candidate.commit)).context
    let exact = false
    try { exact = scopedInputs(candidate.snapshot, context, unit).identity === unit.implementation.inputDigest } catch { /* coverage no longer resolves there: not reproducible */ }
    candidates.push({ ...candidate, context, exact })
    if (exact) break
  }
  // Without an exact base, the binding commit's parent precedes every change made alongside the record, so it is the safer approximate base.
  const base = candidates.find(c => c.exact) ?? candidates[Math.min(1, candidates.length - 1)]!
  result.inputs = { changed: true, base: { commit: base.commit, exact: base.exact }, policyChanged: canonical(reference.snapshot.inputPolicy) !== canonical(snapshot.inputPolicy), changes: compareInputs({ bound: scopedInputs(base.snapshot, base.context, unit).inputs, context: base.context }, { bound: scopedInputs(snapshot, repository.context, unit).inputs, context: repository.context }) }
  return result
}
