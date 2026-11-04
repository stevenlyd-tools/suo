import type { CheckoutContext } from './unit-model.js';
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
/** Read-only review guidance for one binding. Git is the only history source; nothing is stored or rebound. */
export declare function explainUnit(root: string, target: Target, ref: string, unitId: string, depth?: number): Promise<UnitExplanation>;
export {};
