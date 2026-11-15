import type { CheckoutContext, Unit, UnitSnapshot } from './unit-model.js';
type Target = CheckoutContext['target'];
/** `excluded`/`included`: the file exists on both sides but the input policy changed whether it is bound. */
export interface InputChange {
    path: string;
    change: 'added' | 'removed' | 'modified' | 'excluded' | 'included';
}
export interface UnitExplanation {
    unitId: string;
    applicability: 'current' | 'unknown' | 'stale';
    unavailable: string[];
    /** First-parent commit that introduced the recorded binding; null when it is uncommitted, unrecorded or beyond the search depth. */
    bindingCommit: string | null;
    definition: {
        changed: boolean;
        fields: string[];
        decisionsChanged: boolean;
        comparedWith: string | null;
    } | null;
    inputs: {
        changed: boolean;
        base: {
            commit: string;
            exact: boolean;
        } | null;
        policyChanged: boolean;
        changes: InputChange[];
    } | null;
    notice: string;
}
/** Authority snapshots by commit, shared across walks; loading one compiles its TS authority. */
export type AuthorityCache = Map<string, Promise<UnitSnapshot | null>>;
/** Newest-first walk over authority-changing first-parent commits (optionally not reachable from `exclude`); returns the oldest commit of the contiguous run still holding this binding. */
export declare function findBindingCommit(root: string, start: string, unit: Unit, depth: number, cache?: AuthorityCache, exclude?: string): Promise<{
    commit: string;
    snapshot: UnitSnapshot;
} | null>;
/** A tree that may hold a binding's exact inputs, and the snapshot whose policy and mapping the recorded fingerprint used. */
export interface BindingBase {
    commit: string;
    snapshot: UnitSnapshot;
}
/**
 * Trees that may hold the exact inputs of a committed binding, best first: the binding commit and its parent; when the
 * binding commit is a merge, the same search along the merged branch (where the binding was actually recorded); and when it
 * changed the input policy (a `rescope` translation), the bases of the binding it translated. At most `depth` searches.
 */
export declare function bindingBaseCandidates(root: string, found: {
    commit: string;
    snapshot: UnitSnapshot;
}, unitId: string, depth: number, cache?: AuthorityCache): AsyncGenerator<BindingBase>;
/** The Unit's scoped inputs under `s`; a snapshot that predates the Unit is read with the Unit's current mapping. */
export declare function scopedInputs(s: UnitSnapshot, context: CheckoutContext, unit: Unit): {
    inputs: {
        path: string;
        mode: "100644" | "100755" | "120000" | "160000";
        digest: string;
    }[];
    identity: string;
};
/** Read-only review guidance for one binding. Git is the only history source; nothing is stored or rebound. */
export declare function explainUnit(root: string, target: Target, ref: string, unitId: string, depth?: number): Promise<UnitExplanation>;
export {};
