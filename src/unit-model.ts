import { array as a, boolean, literals as e, nullable as n, object as o, string as s, type Value } from './unit-shape.js'
const criterion = o({ id: s(), text: s() })
const coverage = o({ criterionId: s(), path: s(), symbol: n(s()), kind: e('source', 'test') })
export const unitShape = o({
  id: s(), title: s(), labels: a(s()), expectedAssignee: n(s()),
  definition: o({
    objective: s(), included: a(s()), behavior: a(s()), exclusions: a(s()), scope: e('open', 'bounded'),
    decision: e('proposed', 'experimental', 'approved', 'deferred'),
    criteria: a(criterion), ownObligations: n(a(criterion)), ownRationale: n(s()),
    checks: n(a(criterion)), checkRationale: n(s()),
    constraints: a(o({ id: s(), text: s(), scope: e('self', 'subtree'), rule: n(o({ key: s(), allowed: a(s()) })) })),
  }),
  implementation: o({ state: e('unknown', 'not_started', 'in_progress', 'implemented'), definitionDigest: n(s()), inputDigest: n(s()), coverage: a(coverage), gaps: a(s()) }),
  documents: a(s()),
})
export const decisionShape = o({ id: s(), unitId: s(), question: s(), alternatives: a(o({id:s(),label:s(),tradeoffs:n(s())})), recommendation:n(s()), status: e('open', 'proposed', 'approved', 'deferred', 'superseded'), choice: n(s()), rationale: n(s()), prerequisites: a(s()) })
export const containmentShape = o({ parent: s(), child: s() })
export const dependencyShape = o({ consumer: s(), prerequisite: s(), require: e('contract', 'implementation', 'verification'), at: e('start', 'verify', 'accept') })
/** `repository`: every non-excluded file binds every Unit. `declared`: a Unit binds only its own coverage paths, documents and `sharedPaths`. */
export const inputPolicyShape = o({ nonRuntimePaths: a(s()), rationale: s(), scope: e('repository', 'declared'), sharedPaths: a(s()) })
export const unitSnapshotShape = o({ schemaVersion: e(5), product: o({ id: s(), title: s() }), units: a(unitShape), decisions: a(decisionShape), containment: a(containmentShape), dependencies: a(dependencyShape), inputPolicy: inputPolicyShape })
export type Unit = Value<typeof unitShape>
export type UnitDecision = Value<typeof decisionShape>
export type UnitSnapshot = Value<typeof unitSnapshotShape>
export type InputPolicy = Value<typeof inputPolicyShape>
export type Dependency = Value<typeof dependencyShape>
export const checkoutShape = o({ target: e('commit', 'index', 'working-tree'), identity: s(), entries: a(o({ path: s(), mode: e('100644','100755','120000','160000'), digest: s(), symbols: n(a(s())) })), unavailable: a(s()) })
export interface CodeEntry { path: string; mode: '100644' | '100755' | '120000' | '160000'; digest: string; symbols: string[] | null }
export interface CheckoutContext { target: 'commit' | 'index' | 'working-tree'; identity: string; entries: CodeEntry[]; unavailable: string[] }
export interface UnitProjection { id: string; title: string; definitionDigest: string; compositeDigest: string; coverageDigest: string; /** This Unit's input fingerprint under the snapshot's input policy; `record` binds it. */ inputDigest: string; declaredState: Unit['implementation']['state']; applicability: 'current' | 'unknown' | 'stale'; implemented: boolean; startReady: boolean; blockers: string[]; verificationBlockers: string[]; acceptanceBlockers: string[]; semanticReviewRequired: boolean }
