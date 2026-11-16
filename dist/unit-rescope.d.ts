import type { InputPolicy } from './unit-model.js';
/**
 * `translated`: the binding's exact base was found and the Unit's inputs under the new policy were fingerprinted there.
 * `kept`: no translation is justified; the old fingerprint stays, and since it was computed under another policy it reads stale.
 */
export type RescopeOutcome = {
    unitId: string;
    result: 'translated';
    base: string;
    inputs: 'current' | 'stale';
} | {
    unitId: string;
    result: 'kept';
    reason: string;
};
export interface RescopeReport {
    saved: boolean;
    target: 'working-tree';
    committed: false;
    policyChanged: boolean;
    units: RescopeOutcome[];
    notice: string;
}
/**
 * Replace the input policy and translate each implementation binding instead of invalidating it.
 * A binding is translated only at a tree where its recorded fingerprint is exactly reproduced, and only when every input
 * the new policy binds for that Unit was also bound by the old one there: the old binding vouched for those bytes.
 * Definition fingerprints, coverage and states are untouched. Nothing is translated from an inexact or missing base.
 */
export declare function rescopeUnits(root: string, expectedToken: string, inputPolicy: InputPolicy, depth?: number, save?: boolean): Promise<RescopeReport>;
