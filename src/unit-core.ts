import { assertShape } from './unit-shape.js'
import { unitSnapshotShape, checkoutShape, type UnitSnapshot, type CheckoutContext, type UnitProjection } from './unit-model.js'
import { topological } from './unit-graph.js'
import { digest } from './unit-identity.js'
const hex = /^[a-f0-9]{64}$/
export function repositoryPath(path: string): void {
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.split('/').some(p => !p || p === '.' || p === '..') || /^[a-z]+:/i.test(path)) throw new Error(`invalid repository path: ${path}`)
}
const unique = (values: readonly string[], label: string) => { if (new Set(values).size !== values.length) throw new Error(`duplicate ${label}`) }
export function validateUnits(value: unknown): asserts value is UnitSnapshot {
  assertShape(unitSnapshotShape, value)
  const s = value, units = new Map(s.units.map(u => [u.id, u])), decisions = new Map(s.decisions.map(d => [d.id, d]))
  unique(s.units.map(u => u.id), 'unit ID'); unique(s.decisions.map(d => d.id), 'decision ID')
  unique([...s.units.map(u => u.id), ...s.decisions.map(d => d.id)], 'global record ID')
  const parent = new Map<string, string>(), containers = new Set(s.containment.map(e=>e.parent))
  for (const edge of s.containment) { if (parent.has(edge.child)) throw new Error(`multiple parents: ${edge.child}`); parent.set(edge.child, edge.parent) }
  topological([...units.keys()], s.containment.map(e => [e.parent, e.child]))
  unique(s.dependencies.map(e => JSON.stringify([e.consumer,e.prerequisite,e.require,e.at])), 'dependency')
  topological([...units.keys()], [...new Map(s.dependencies.map(e => [JSON.stringify([e.prerequisite, e.consumer]), [e.prerequisite, e.consumer] as const])).values()])
  for (const d of s.decisions) {
    if (!units.has(d.unitId)) throw new Error(`unknown decision unit: ${d.id}`)
    if (d.status === 'approved' && (!d.choice || !d.rationale)) throw new Error(`approved decision lacks choice/rationale: ${d.id}`)
    unique(d.alternatives.map(a=>a.id), `${d.id} alternatives`)
    unique(d.prerequisites, `${d.id} prerequisites`)
    for (const id of d.prerequisites) if (!decisions.has(id)) throw new Error(`unknown decision prerequisite: ${id}`)
  }
  topological([...decisions.keys()], s.decisions.flatMap(d => d.prerequisites.map(p => [p, d.id] as const)))
  for (const u of s.units) {
    const definition = u.definition, implementation = u.implementation
    unique(u.labels, `${u.id} labels`); unique(u.documents, `${u.id} documents`)
    unique([...definition.criteria, ...(definition.ownObligations ?? [])].map(c => c.id), `${u.id} criteria`)
    unique((definition.checks ?? []).map(c => c.id), `${u.id} checks`)
    unique(definition.constraints.map(c => c.id), `${u.id} constraints`)
    if (definition.checks !== null && !definition.checkRationale) throw new Error(`declared checks require rationale: ${u.id}`)
    if (definition.ownObligations?.length === 0 && !definition.ownRationale) throw new Error(`empty own obligations require rationale: ${u.id}`)
    for (const constraint of definition.constraints) if (constraint.rule) { unique(constraint.rule.allowed, `${u.id} allowed values`); if (!constraint.rule.allowed.length) throw new Error(`empty constraint domain: ${u.id}`) }
    for (const d of [implementation.definitionDigest, implementation.inputDigest]) if (d !== null && !hex.test(d)) throw new Error(`invalid implementation digest: ${u.id}`)
    if ((implementation.definitionDigest === null) !== (implementation.inputDigest === null)) throw new Error(`partial implementation binding: ${u.id}`)
    if (implementation.state !== 'unknown' && implementation.definitionDigest === null) throw new Error(`implementation declaration must bind inputs: ${u.id}`)
    const criteria = new Set([...definition.criteria, ...(definition.ownObligations ?? [])].map(c => c.id))
    unique(implementation.coverage.map(c => JSON.stringify([c.criterionId,c.path,c.symbol,c.kind])), `${u.id} coverage entry`)
    for (const ref of implementation.coverage) { repositoryPath(ref.path); if (!criteria.has(ref.criterionId)) throw new Error(`unknown coverage criterion: ${u.id}/${ref.criterionId}`) }
    for (const path of u.documents) repositoryPath(path)
    const covered = new Set(implementation.coverage.filter(c => c.kind === 'source').map(c => c.criterionId))
    if (implementation.state === 'implemented' && ((!criteria.size && !containers.has(u.id)) || definition.ownObligations === null || implementation.gaps.length || [...criteria].some(id => !covered.has(id)))) throw new Error(`implemented declaration lacks complete own source coverage: ${u.id}`)
  }
  unique(s.inputPolicy.nonRuntimePaths, 'input exclusion')
  for (const path of s.inputPolicy.nonRuntimePaths) repositoryPath(path)
  phaseOrder(s)
}
/** Contract is a local boundary, not the parent's aggregate completion. */
function phaseGraph(s: UnitSnapshot): {nodes:string[];edges:Array<readonly [string,string]>} {
  const phases = ['contract', 'start', 'own', 'implementation', 'verify', 'accept'] as const
  const key = (id: string, phase: string) => JSON.stringify([id, phase]), edges = new Map<string, readonly [string, string]>()
  const add = (from: string, to: string) => edges.set(JSON.stringify([from, to]), [from, to])
  for (const u of s.units) for (let i = 1; i < phases.length; i++) add(key(u.id, phases[i - 1]!), key(u.id, phases[i]!))
  for (const e of s.containment) { add(key(e.child, 'implementation'), key(e.parent, 'implementation')); add(key(e.child, 'verify'), key(e.parent, 'verify')); add(key(e.child, 'accept'), key(e.parent, 'accept')) }
  for (const e of s.dependencies) add(key(e.prerequisite, e.require === 'verification' ? 'verify' : e.require), key(e.consumer, e.at))
  return {nodes:s.units.flatMap(u => phases.map(p => key(u.id, p))),edges:[...edges.values()]} 
}
export function phaseOrder(s: UnitSnapshot): string[] { assertShape(unitSnapshotShape,s); const graph=phaseGraph(s); return topological(graph.nodes,graph.edges) }
export function inputIdentity(s: UnitSnapshot, context: CheckoutContext): string {
  assertShape(unitSnapshotShape,s)
  assertShape(checkoutShape, context)
  if (!(context.target === 'commit' ? /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/ : /^[a-f0-9]{64}$/).test(context.identity)) throw new Error('invalid checkout identity')
  const seen = new Set<string>()
  for (const entry of context.entries) { repositoryPath(entry.path); if (seen.has(entry.path) || !hex.test(entry.digest)) throw new Error('invalid or duplicate input entry'); seen.add(entry.path) }
  const excluded = excludedInput(s)
  for (const unit of s.units) for (const ref of unit.implementation.coverage) if (excluded(ref.path)) throw new Error(`coverage input excluded or self-referential: ${ref.path}`)
  return digest({ policy: s.inputPolicy, entries: boundInputs(s, context) })
}
const excludedInput = (s: UnitSnapshot) => (path: string) => path.startsWith('suo/') || path.startsWith('docs/suo/') || s.inputPolicy.nonRuntimePaths.some(p => path === p || path.startsWith(`${p}/`))
/** The sorted entries an implementation binding fingerprints under this snapshot's input policy. */
export function boundInputs(s: UnitSnapshot, context: CheckoutContext): Array<Omit<CheckoutContext['entries'][number], 'symbols'>> {
  const excluded = excludedInput(s)
  return context.entries.filter(e => !excluded(e.path)).map(({symbols: _, ...entry}) => entry).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}
/** Pure projection: no clock, network, provider status or mutation. */
export function inspectUnits(s: UnitSnapshot, context: CheckoutContext): { schemaVersion: 5; target: CheckoutContext['target']; identity: string; inputDigest: string; units: UnitProjection[]; verification: string } {
  validateUnits(s)
  const units = new Map(s.units.map(u => [u.id, u])), ids = [...units.keys()], children = new Map(ids.map(id => [id, [] as string[]])), parents = new Map<string, string>()
  const decisions = new Map(s.decisions.map(d => [d.id, d])), byUnit = new Map(ids.map(id => [id, [] as UnitSnapshot['decisions']]))
  for (const d of s.decisions) byUnit.get(d.unitId)!.push(d)
  const decisionDigests = new Map<string,string>(), decisionReady = new Map<string,boolean>()
  for (const id of topological([...decisions.keys()], s.decisions.flatMap(d => d.prerequisites.map(p => [p,d.id] as const)))) {
    const d = decisions.get(id)!; decisionReady.set(id, d.status === 'approved' && d.prerequisites.every(p=>decisionReady.get(p))); decisionDigests.set(id, digest({ ...d, prerequisites: [...d.prerequisites].sort().map(p => ({ id:p, digest:decisionDigests.get(p) })) }))
  }
  for (const e of s.containment) { children.get(e.parent)!.push(e.child); parents.set(e.child, e.parent) }
  const containmentOrder = topological(ids, s.containment.map(e => [e.parent, e.child])), contexts = new Map<string, string>(), local = new Map<string, string>(), semanticInherited = new Map<string,boolean>(), semanticRequired = new Map<string,boolean>()
  for (const id of containmentOrder) {
    const u = units.get(id)!, inherited = parents.has(id) ? contexts.get(parents.get(id)!) : null
    const inheritedReview = parents.has(id) ? semanticInherited.get(parents.get(id)!)! : false
    semanticRequired.set(id,inheritedReview || u.definition.constraints.some(c=>c.rule===null))
    semanticInherited.set(id,inheritedReview || u.definition.constraints.some(c=>c.rule===null && c.scope==='subtree'))
    const constraints = [...u.definition.constraints].sort((a,b) => a.id < b.id ? -1 : 1)
    contexts.set(id, digest({ inherited, constraints: constraints.filter(c => c.scope === 'subtree') }))
    local.set(id, digest({ id, definition: u.definition, inherited, decisions: [...byUnit.get(id)!].sort((a,b) => a.id < b.id ? -1 : 1).map(d => decisionDigests.get(d.id)) }))
  }
  const dependencies = new Map(ids.map(id => [id, [] as Array<{ prerequisite: string; require: string; at: string }>]))
  for (const e of s.dependencies) dependencies.get(e.consumer)!.push(e)

  const dependencyOrder = topological(ids, [...new Map([...dependencies].flatMap(([id, deps]) => deps.map(d => [JSON.stringify([d.prerequisite, id]), [d.prerequisite, id] as const] as const))).values()]), definitions = new Map<string, string>()
  // Phase fingerprints include composite prerequisites without a transitive-closure table.
  // All inputs are definitions, never implementation declarations or receipts.
  const graph=phaseGraph(s), phaseInputs=new Map(graph.nodes.map(n=>[n,[] as string[]])), phaseDigests=new Map<string,string>()
  for (const [from,to] of graph.edges) phaseInputs.get(to)!.push(from)
  for (const node of topological(graph.nodes,graph.edges)) {
    const [id,phase]=JSON.parse(node) as [string,string]
    phaseDigests.set(node,digest({id,phase,local:local.get(id),prerequisites:phaseInputs.get(node)!.sort().map(key=>({key,digest:phaseDigests.get(key)}))}))
  }
  const composites = new Map<string,string>()
  for (const id of ids) { definitions.set(id,phaseDigests.get(JSON.stringify([id,'own']))!);composites.set(id,phaseDigests.get(JSON.stringify([id,'implementation']))!) }
  const inputDigest = inputIdentity(s, context), entryIndex = new Map(context.entries.map(e => [e.path,e])), paths = new Set(context.entries.map(e => e.path)), result = new Map<string, UnitProjection>()
  for (const id of ids) {
    const u = units.get(id)!, blockers: string[] = [], definitionDigest = definitions.get(id)!
    for (const ref of u.implementation.coverage) {
      if (!paths.has(ref.path)) throw new Error(`dangling source reference: ${id}/${ref.path}`)
      if (!['100644','100755'].includes(entryIndex.get(ref.path)!.mode)) throw new Error(`coverage must reference a regular file: ${ref.path}`)
      if (ref.symbol !== null && !entryIndex.get(ref.path)!.symbols?.includes(ref.symbol)) throw new Error(`unresolved source symbol: ${id}/${ref.path}/${ref.symbol}`)
    }
    for (const path of u.documents) { if (!paths.has(path)) throw new Error(`dangling document reference: ${id}/${path}`); if (!['100644','100755'].includes(entryIndex.get(path)!.mode)) throw new Error(`document must reference a regular file: ${path}`) }
    const current = !context.unavailable.length && u.implementation.definitionDigest === composites.get(id) && u.implementation.inputDigest === inputDigest
    const applicability = u.implementation.definitionDigest === null || context.unavailable.length ? 'unknown' : current ? 'current' : 'stale'
    if (u.definition.scope !== 'bounded') blockers.push('scope is open')
    if (!u.definition.behavior.length || !u.definition.criteria.length) blockers.push('behavior/criteria incomplete')
    if (!['approved', 'experimental'].includes(u.definition.decision)) blockers.push('scope not selected for execution')
    if (byUnit.get(id)!.some(d => ['open', 'proposed'].includes(d.status) || d.prerequisites.some(p => !decisionReady.get(p)))) blockers.push('unresolved product decision')
    if (context.unavailable.length) blockers.push('code inputs unavailable')
    result.set(id, { id, title: u.title, definitionDigest, compositeDigest: composites.get(id)!, coverageDigest: composites.get(id)!, declaredState: u.implementation.state, applicability, implemented: current && u.implementation.state === 'implemented', startReady: blockers.length === 0, blockers, verificationBlockers: [], acceptanceBlockers: [], semanticReviewRequired: semanticRequired.get(id)! })
  }
  // Inherited finite-domain constraints use enter/exit restoration, not ancestor copies.
  const domains = new Map<string, Set<string>>(), stack: Array<{ id: string; exit: boolean; restore?: Array<[string, Set<string> | undefined]> }> = []
  for (const id of ids) if (!parents.has(id)) stack.push({ id, exit: false })
  let emptyDomains = 0
  const restore = (items: Array<[string, Set<string> | undefined]>) => { for (let i = items.length - 1; i >= 0; i--) { const [key, prior] = items[i]!; if (domains.get(key)?.size === 0) emptyDomains--; if (prior?.size === 0) emptyDomains++; if (prior) domains.set(key, prior); else domains.delete(key) } }
  const apply = (rules: UnitSnapshot['units'][number]['definition']['constraints']) => { const undo: Array<[string, Set<string> | undefined]> = []; for (const c of rules) if (c.rule) { const old = domains.get(c.rule.key); undo.push([c.rule.key, old]); if (old?.size === 0) emptyDomains--; const next = new Set(c.rule.allowed.filter(v => !old || old.has(v))); if (!next.size) emptyDomains++; domains.set(c.rule.key, next) } return undo }
  while (stack.length) {
    const frame = stack.pop()!; if (frame.exit) { restore(frame.restore!); continue }
    const constraints = units.get(frame.id)!.definition.constraints, inherited = apply(constraints.filter(c => c.scope === 'subtree')), own = apply(constraints.filter(c => c.scope === 'self'))
    if (emptyDomains) { result.get(frame.id)!.blockers.push('incompatible inherited constraint domain'); result.get(frame.id)!.startReady = false; result.get(frame.id)!.implemented = false }
    restore(own); stack.push({ id: frame.id, exit: true, restore: inherited })
    for (const child of children.get(frame.id)!) stack.push({ id: child, exit: false })
  }
  for (let i = containmentOrder.length - 1; i >= 0; i--) {
    const id = containmentOrder[i]!, r = result.get(id)!, u = units.get(id)!, childIds = children.get(id)!
    r.implemented &&= u.definition.scope === 'bounded' && u.definition.ownObligations !== null && childIds.every(child => result.get(child)!.implemented)
  }
  for (const id of dependencyOrder) for (const dep of dependencies.get(id)!) if (dep.at === 'start') {
    const prerequisite = units.get(dep.prerequisite)!, p = result.get(dep.prerequisite)!, r = result.get(id)!
    // Parent-local contract can be used while its composite scope remains open.
    const contractReady = !p.blockers.includes('incompatible inherited constraint domain') && prerequisite.definition.behavior.length > 0 && prerequisite.definition.criteria.length > 0 && ['approved', 'experimental'].includes(prerequisite.definition.decision) && !byUnit.get(prerequisite.id)!.some(d => ['open', 'proposed'].includes(d.status) || d.prerequisites.some(p=>!decisionReady.get(p)))
    if (dep.require === 'verification' || (dep.require === 'contract' ? !contractReady : !p.implemented)) { r.startReady = false; r.blockers.push(`${dep.prerequisite}: ${dep.require === 'verification' ? 'external verification unknown' : dep.require + ' prerequisite unavailable'}`) }
  }
  for (const id of ids) {
    const u=units.get(id)!, r=result.get(id)!
    if (!r.implemented) r.verificationBlockers.push('current complete implementation coverage unavailable')
    if (u.definition.checks===null) r.verificationBlockers.push('required check policy unresolved')
    r.acceptanceBlockers.push('behavioral verification and acceptance require fresh review; repository mapping is not proof')
    for (const dep of dependencies.get(id)!) if (dep.at!=='start') {
      const p=result.get(dep.prerequisite)!, prerequisite=units.get(dep.prerequisite)!
      const available=dep.require==='implementation'?p.implemented:dep.require==='contract' && prerequisite.definition.behavior.length>0 && prerequisite.definition.criteria.length>0 && ['approved','experimental'].includes(prerequisite.definition.decision) && !p.blockers.includes('unresolved product decision') && !p.blockers.includes('incompatible inherited constraint domain')
      if (!available) (dep.at==='verify'?r.verificationBlockers:r.acceptanceBlockers).push(`${dep.prerequisite}: ${dep.require} prerequisite requires resolution${dep.require==='verification'?' outside repository state':''}`)
    }
  }
  return { schemaVersion: 5, target: context.target, identity: context.identity, inputDigest, units: ids.map(id => result.get(id)!), verification: 'Repository declarations and content bindings only; not semantic proof, CI result, acceptance or deployment status.' }
}
