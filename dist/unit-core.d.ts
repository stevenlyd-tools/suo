import { type UnitSnapshot, type CheckoutContext, type UnitProjection } from './unit-model.js';
export declare function repositoryPath(path: string): void;
export declare function validateUnits(value: unknown): asserts value is UnitSnapshot;
export declare function phaseOrder(s: UnitSnapshot): string[];
type BoundEntry = Omit<CheckoutContext['entries'][number], 'symbols'>;
/** Whole-repository fingerprint: every bound file under this snapshot's exclusions. Under `repository` scope it is also every Unit's input fingerprint. */
export declare function inputIdentity(s: UnitSnapshot, context: CheckoutContext): string;
/** The sorted entries a whole-repository binding fingerprints under this snapshot's input policy. */
export declare function boundInputs(s: UnitSnapshot, context: CheckoutContext): BoundEntry[];
/**
 * Per-Unit input scopes. `repository`: every bound file. `declared`: the Unit's own coverage paths and documents plus
 * every file under `sharedPaths`, minus exclusions. Imports of mapped files are deliberately not followed; map them or share them.
 * Cost: one pass over entries, then each Unit's own paths plus the shared entries.
 */
export declare function unitInputScopes(s: UnitSnapshot, context: CheckoutContext): {
    inputs(unitId: string): BoundEntry[];
    identity(unitId: string): string;
};
/** Pure projection: no clock, network, provider status or mutation. */
export declare function inspectUnits(s: UnitSnapshot, context: CheckoutContext): {
    schemaVersion: 5;
    target: CheckoutContext['target'];
    identity: string;
    inputDigest: string;
    units: UnitProjection[];
    verification: string;
};
export {};
