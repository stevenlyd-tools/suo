import { type Value } from './unit-shape.js';
export declare const unitShape: import("./unit-shape.js").Shape<{
    id: string;
    title: string;
    labels: string[];
    expectedAssignee: string | null;
    definition: {
        objective: string;
        included: string[];
        behavior: string[];
        exclusions: string[];
        scope: "open" | "bounded";
        decision: "proposed" | "experimental" | "approved" | "deferred";
        criteria: {
            id: string;
            text: string;
        }[];
        ownObligations: {
            id: string;
            text: string;
        }[] | null;
        ownRationale: string | null;
        checks: {
            id: string;
            text: string;
        }[] | null;
        checkRationale: string | null;
        constraints: {
            id: string;
            text: string;
            scope: "self" | "subtree";
            rule: {
                key: string;
                allowed: string[];
            } | null;
        }[];
    };
    implementation: {
        state: "unknown" | "not_started" | "in_progress" | "implemented";
        definitionDigest: string | null;
        inputDigest: string | null;
        coverage: {
            criterionId: string;
            path: string;
            symbol: string | null;
            kind: "source" | "test";
        }[];
        gaps: string[];
    };
    documents: string[];
}>;
export declare const decisionShape: import("./unit-shape.js").Shape<{
    id: string;
    unitId: string;
    question: string;
    alternatives: {
        id: string;
        label: string;
        tradeoffs: string | null;
    }[];
    recommendation: string | null;
    status: "open" | "proposed" | "approved" | "deferred" | "superseded";
    choice: string | null;
    rationale: string | null;
    prerequisites: string[];
}>;
export declare const containmentShape: import("./unit-shape.js").Shape<{
    parent: string;
    child: string;
}>;
export declare const dependencyShape: import("./unit-shape.js").Shape<{
    consumer: string;
    prerequisite: string;
    require: "implementation" | "contract" | "verification";
    at: "start" | "verify" | "accept";
}>;
/** `repository`: every non-excluded file binds every Unit. `declared`: a Unit binds only its own coverage paths, documents and `sharedPaths`. */
export declare const inputPolicyShape: import("./unit-shape.js").Shape<{
    nonRuntimePaths: string[];
    rationale: string;
    scope: "repository" | "declared";
    sharedPaths: string[];
}>;
export declare const unitSnapshotShape: import("./unit-shape.js").Shape<{
    schemaVersion: 5;
    product: {
        id: string;
        title: string;
    };
    units: {
        id: string;
        title: string;
        labels: string[];
        expectedAssignee: string | null;
        definition: {
            objective: string;
            included: string[];
            behavior: string[];
            exclusions: string[];
            scope: "open" | "bounded";
            decision: "proposed" | "experimental" | "approved" | "deferred";
            criteria: {
                id: string;
                text: string;
            }[];
            ownObligations: {
                id: string;
                text: string;
            }[] | null;
            ownRationale: string | null;
            checks: {
                id: string;
                text: string;
            }[] | null;
            checkRationale: string | null;
            constraints: {
                id: string;
                text: string;
                scope: "self" | "subtree";
                rule: {
                    key: string;
                    allowed: string[];
                } | null;
            }[];
        };
        implementation: {
            state: "unknown" | "not_started" | "in_progress" | "implemented";
            definitionDigest: string | null;
            inputDigest: string | null;
            coverage: {
                criterionId: string;
                path: string;
                symbol: string | null;
                kind: "source" | "test";
            }[];
            gaps: string[];
        };
        documents: string[];
    }[];
    decisions: {
        id: string;
        unitId: string;
        question: string;
        alternatives: {
            id: string;
            label: string;
            tradeoffs: string | null;
        }[];
        recommendation: string | null;
        status: "open" | "proposed" | "approved" | "deferred" | "superseded";
        choice: string | null;
        rationale: string | null;
        prerequisites: string[];
    }[];
    containment: {
        parent: string;
        child: string;
    }[];
    dependencies: {
        consumer: string;
        prerequisite: string;
        require: "implementation" | "contract" | "verification";
        at: "start" | "verify" | "accept";
    }[];
    inputPolicy: {
        nonRuntimePaths: string[];
        rationale: string;
        scope: "repository" | "declared";
        sharedPaths: string[];
    };
}>;
export type Unit = Value<typeof unitShape>;
export type UnitDecision = Value<typeof decisionShape>;
export type UnitSnapshot = Value<typeof unitSnapshotShape>;
export type InputPolicy = Value<typeof inputPolicyShape>;
export type Dependency = Value<typeof dependencyShape>;
export declare const checkoutShape: import("./unit-shape.js").Shape<{
    target: "commit" | "index" | "working-tree";
    identity: string;
    entries: {
        path: string;
        mode: "100644" | "100755" | "120000" | "160000";
        digest: string;
        symbols: string[] | null;
    }[];
    unavailable: string[];
}>;
export interface CodeEntry {
    path: string;
    mode: '100644' | '100755' | '120000' | '160000';
    digest: string;
    symbols: string[] | null;
}
export interface CheckoutContext {
    target: 'commit' | 'index' | 'working-tree';
    identity: string;
    entries: CodeEntry[];
    unavailable: string[];
}
export interface UnitProjection {
    id: string;
    title: string;
    definitionDigest: string;
    compositeDigest: string;
    coverageDigest: string; /** This Unit's input fingerprint under the snapshot's input policy; `record` binds it. */
    inputDigest: string;
    declaredState: Unit['implementation']['state'];
    applicability: 'current' | 'unknown' | 'stale';
    implemented: boolean;
    startReady: boolean;
    blockers: string[];
    verificationBlockers: string[];
    acceptanceBlockers: string[];
    semanticReviewRequired: boolean;
}
