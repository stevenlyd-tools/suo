import { describe, it, expect } from 'vitest'
import { inspectUnits, validateUnits, phaseOrder } from '../src/unit-core.js'
import { canonical, digest } from '../src/unit-identity.js'
import { topological, affected } from '../src/unit-graph.js'
import type { Unit, UnitSnapshot, CheckoutContext } from '../src/unit-model.js'
const unit = (id: string): Unit => ({ id, title: id, labels: [], expectedAssignee: null, definition: { objective: 'Bounded behavior', included: [], behavior: ['Do the thing'], exclusions: [], scope: 'bounded', decision: 'approved', criteria: [{ id: 'behavior', text: 'Works' }], ownObligations: [], ownRationale: 'No additional integration obligations', checks: null, checkRationale: null, constraints: [] }, implementation: { state: 'unknown', definitionDigest: null, inputDigest: null, coverage: [], gaps: [] }, documents: [] })
const snapshot = (...units: Unit[]): UnitSnapshot => ({ schemaVersion: 5, product: { id: 'product', title: 'Product' }, units, decisions: [], containment: [], dependencies: [], inputPolicy: { nonRuntimePaths: [], rationale: 'All repository inputs except authority and generated views', scope: 'repository', sharedPaths: [] } })
const context: CheckoutContext = { target: 'commit', identity: 'a'.repeat(40), entries: [{ path: 'src/app.ts', mode: '100644' as const, symbols: null, digest: 'a'.repeat(64) }], unavailable: [] }
function implement(s: UnitSnapshot, id: string) { const p = inspectUnits(s, context), result = p.units.find(u => u.id === id)!, u = s.units.find(u => u.id === id)!; u.implementation = { state: 'implemented', definitionDigest: result.coverageDigest, inputDigest: p.inputDigest, coverage: [{ criterionId: 'behavior', path: 'src/app.ts', symbol: null, kind: 'source' }], gaps: [] } }
describe('repository Unit boundary', () => {
  it('keeps parent-local contract usable while parent scope is open', () => {
    const s = snapshot(unit('parent'), unit('child')); s.units[0]!.definition.scope = 'open'; s.containment.push({ parent: 'parent', child: 'child' }); s.dependencies.push({ consumer: 'child', prerequisite: 'parent', require: 'contract', at: 'start' })
    expect(inspectUnits(s, context).units[1]!.startReady).toBe(true)
    s.dependencies[0]!.require = 'implementation'; expect(() => phaseOrder(s)).toThrow(/cycle/)
  })
  it('never satisfies external verification from repository implementation', () => {
    const s = snapshot(unit('a'), unit('b')); implement(s, 'a'); s.dependencies.push({ consumer: 'b', prerequisite: 'a', require: 'verification', at: 'start' })
    expect(inspectUnits(s, context).units[1]!.blockers).toContain('a: external verification unknown')
  })
  it('preserves declared implemented but invalidates changed code, definitions and new files', () => {
    const s = snapshot(unit('a')); implement(s, 'a'); expect(inspectUnits(s, context).units[0]!.implemented).toBe(true)
    const changed = { ...context, entries: [...context.entries, { path: 'config/new.json', mode: '100644' as const, symbols: null, digest: 'b'.repeat(64) }] }
    expect(inspectUnits(s, changed).units[0]).toMatchObject({ declaredState: 'implemented', applicability: 'stale', implemented: false })
    s.units[0]!.definition.behavior.push('new'); expect(inspectUnits(s, context).units[0]!.applicability).toBe('stale')
  })
  it('distinguishes unknown from not started and refuses false implemented coverage', () => {
    const s = snapshot(unit('a')); expect(inspectUnits(s, context).units[0]!.declaredState).toBe('unknown')
    s.units[0]!.implementation.state = 'implemented'; expect(() => validateUnits(s)).toThrow(/bind inputs/)
    s.units[0]!.implementation.state = 'unknown'; implement(s, 'a'); s.units[0]!.implementation.coverage = []; expect(() => validateUnits(s)).toThrow(/coverage/)
  })
  it('parent completion requires own coverage, bounded scope and all children', () => {
    const s = snapshot(unit('p'), unit('c')); s.containment.push({ parent: 'p', child: 'c' }); implement(s, 'p')
    expect(inspectUnits(s, context).units[0]!.implemented).toBe(false); implement(s, 'c'); expect(inspectUnits(s, context).units[0]!.implemented).toBe(true)
    s.units[1]!.definition.behavior.push('changed child'); expect(inspectUnits(s, context).units[0]!.applicability).toBe('stale')
  })
  it('rejects malformed envelopes, external state, wrong references, duplicate parents and cycles', () => {
    const s = snapshot(unit('a'), unit('b')); expect(() => validateUnits({ ...s, deployed: true })).toThrow(/unknown field/)
    s.containment.push({ parent: 'missing', child: 'b' }); expect(() => validateUnits(s)).toThrow(/missing/)
    s.containment = [{ parent: 'a', child: 'b' }, { parent: 'b', child: 'a' }]; expect(() => validateUnits(s)).toThrow(/cycle/)
    s.containment = [{ parent: 'a', child: 'b' }, { parent: 'a', child: 'b' }]; expect(() => validateUnits(s)).toThrow(/multiple parents/)
  })
  it('rejects dangling coverage and treats missing locked inputs as unknown', () => {
    const s = snapshot(unit('a')); implement(s, 'a'); expect(() => inspectUnits(s, { ...context, entries: [] })).toThrow(/dangling/)
    expect(inspectUnits(s, { ...context, unavailable: ['submodule'] }).units[0]!.applicability).toBe('unknown')
  })
  it('enforces inherited constraint intersections without contaminating siblings', () => {
    const s = snapshot(unit('p'), unit('c'), unit('sibling')); s.containment = [{ parent: 'p', child: 'c' }, { parent: 'p', child: 'sibling' }]
    s.units[0]!.definition.constraints = [{ id: 'privacy', text: 'friends', scope: 'subtree', rule: { key: 'audience', allowed: ['friends'] } }]
    s.units[1]!.definition.constraints = [{ id: 'privacy', text: 'public', scope: 'self', rule: { key: 'audience', allowed: ['public'] } }]
    const result = inspectUnits(s, context); expect(result.units[1]!.startReady).toBe(false); expect(result.units[2]!.startReady).toBe(true)
  })
})
describe('iterative graph and serialization', () => {
  it('processes a 100000-deep chain without recursion', () => {
    const ids = Array.from({ length: 100_000 }, (_, i) => String(i)), edges = ids.slice(1).map((id, i) => [String(i), id] as const)
    expect(topological(ids, edges)).toEqual(ids); expect(() => topological(ids, [...edges, ['99999', '99998']])).toThrow(/cycle/)
  })
  it('uses old and new edges for invalidation and deduplicates diamonds', () => {
    expect([...affected(['a'], [['a', 'b'], ['b', 'd']], [['a', 'c'], ['c', 'd']])].sort()).toEqual(['a', 'b', 'c', 'd'])
  })
  it('canonicalizes deep JSON deterministically and rejects object cycles', () => {
    expect(canonical({ b: [true, null], a: 1 })).toBe('{"a":1,"b":[true,null]}')
    let deep: unknown = 1; for (let i = 0; i < 20_000; i++) deep = [deep]
    expect(digest(deep)).toMatch(/^[a-f0-9]{64}$/)
    const cycle: unknown[] = []; cycle.push(cycle); expect(() => canonical(cycle)).toThrow(/cyclic/)
  })
})

it('rejects excluded code bindings, malformed contexts and nonregular coverage', () => {
  const s = snapshot(unit('a')); implement(s,'a'); s.units[0]!.implementation.coverage[0]!.path = 'suo/runtime.ts'
  expect(() => inspectUnits(s,{...context,entries:[{...context.entries[0]!,path:'suo/runtime.ts'}]})).toThrow(/excluded/)
  s.units[0]!.implementation.coverage[0]!.path = 'src/app.ts'
  expect(() => inspectUnits(s,{...context,entries:[{...context.entries[0]!,mode:'120000'}]})).toThrow(/regular file/)
  expect(() => inspectUnits(s,{...context,deployed:true} as CheckoutContext)).toThrow(/unknown field/)
})
it('contradictory prerequisite constraints do not satisfy another unit contract', () => {
  const s = snapshot(unit('a'),unit('b'))
  s.units[0]!.definition.constraints = ['friends','public'].map((v,i)=>({id:String(i),text:v,scope:'self',rule:{key:'audience',allowed:[v]}}))
  s.dependencies.push({consumer:'b',prerequisite:'a',require:'contract',at:'start'})
  expect(inspectUnits(s,context).units[1]!.startReady).toBe(false)
})
it('does not invent whole-unit cycles from a valid cross-unit decision DAG', () => {
  const s = snapshot(unit('a'),unit('b'))
  s.decisions = [['a1','a',[]],['b1','b',['a1']],['a2','a',['b1']]].map(([id,unitId,prerequisites])=>({id:id as string,unitId:unitId as string,prerequisites:prerequisites as string[],question:'Choice',alternatives:[],recommendation:null,status:'approved',choice:'yes',rationale:'Selected'}))
  expect(inspectUnits(s,context).units.every(u=>u.startReady)).toBe(true)
})
it('rejects sparse API input before filling the validation work queue', () => {
  const s = snapshot(); s.units = new Array(5_000_001) as Unit[]
  expect(()=>validateUnits(s)).toThrow(/budget/)
})
it('propagates unresolved decision prerequisites transitively into contract readiness',()=>{
 const s=snapshot(unit('a'),unit('b'),unit('c'));s.decisions=[{id:'deferred',unitId:'b',question:'Choose',alternatives:[],recommendation:null,status:'deferred',choice:null,rationale:null,prerequisites:[]},{id:'middle',unitId:'b',question:'Choose',alternatives:[],recommendation:null,status:'approved',choice:'yes',rationale:'Needed',prerequisites:['deferred']},{id:'local',unitId:'a',question:'Choose',alternatives:[],recommendation:null,status:'approved',choice:'yes',rationale:'Needed',prerequisites:['middle']}];s.dependencies=[{consumer:'c',prerequisite:'a',require:'contract',at:'start'}];expect(inspectUnits(s,context).units[2]!.startReady).toBe(false)
})
it('invalidates a consumer when a composite implementation prerequisite changes its child definition',()=>{
 const s=snapshot(unit('parent'),unit('child'),unit('consumer'));s.containment=[{parent:'parent',child:'child'}];s.dependencies=[{consumer:'consumer',prerequisite:'parent',require:'implementation',at:'start'}];implement(s,'consumer');s.units[1]!.definition.behavior.push('Different composition');expect(inspectUnits(s,context).units[2]!.applicability).toBe('stale')
})
it('propagates inherited prose review requirements without leaking self-only constraints',()=>{
 const s=snapshot(unit('p'),unit('c'),unit('other'));s.containment=[{parent:'p',child:'c'}];s.units[0]!.definition.constraints=[{id:'prose',text:'Human judgment',scope:'subtree',rule:null}];expect(inspectUnits(s,context).units.map(u=>u.semanticReviewRequired)).toEqual([true,true,false]);s.units[0]!.definition.constraints[0]!.scope='self';expect(inspectUnits(s,context).units.map(u=>u.semanticReviewRequired)).toEqual([true,false,false])
})
it('keeps exported JSON schema generated from the same runtime shape',async()=>{
 const {unitJsonSchema}=await import('../src/unit-schema.js'),{readFile}=await import('node:fs/promises');expect(JSON.parse(await readFile(new URL('../schemas/compiled-snapshot.schema.json',import.meta.url),'utf8'))).toEqual(unitJsonSchema())
})

it('rejects shared Unit and Decision identities at the core boundary',()=>{const s=snapshot(unit('a'));s.decisions.push({id:'a',unitId:'a',question:'Choice',alternatives:[{id:'yes',label:'Yes',tradeoffs:null}],recommendation:null,status:'open',choice:null,rationale:null,prerequisites:[]});expect(()=>validateUnits(s)).toThrow(/global record ID/)});

it('duplicate edges cannot hide behind JSON property order',()=>{const s=snapshot(unit('a'),unit('b'));s.dependencies=[{consumer:'a',prerequisite:'b',require:'contract',at:'start'},{at:'start',require:'contract',prerequisite:'b',consumer:'a'}];expect(()=>validateUnits(s)).toThrow(/duplicate dependency/)});
