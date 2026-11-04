import type { CheckoutContext, UnitSnapshot } from './unit-model.js';
export interface RepositorySnapshot {
    context: CheckoutContext;
    contents: Map<string, Buffer>;
    token: string;
}
/** Read one explicit Git tree/index or a labelled working-tree candidate. No fetch. */
export declare function readRepository(root: string, target?: 'commit' | 'index' | 'working-tree', ref?: string): Promise<RepositorySnapshot>;
/** Only `suo/` of one commit: enough to load its authority, never a binding input context. */
export declare function readCommitAuthority(root: string, ref: string): Promise<RepositorySnapshot>;
export declare function loadRepositoryUnits(repository: RepositorySnapshot): Promise<UnitSnapshot>;
export declare function resolveCoverageSymbols(snapshot: UnitSnapshot, repository: RepositorySnapshot): void;
export declare function validateRepositorySnapshot(repository: RepositorySnapshot): void;
