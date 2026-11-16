import type { RepositorySnapshot } from './unit-checkout.js';
import type { UnitSnapshot } from './unit-model.js';
/** A repository file imported directly by one of a Unit's mapped source files but not among the Unit's bound inputs. */
export interface UnboundImport {
    from: string;
    path: string;
}
/**
 * Advisory only: the one-hop static imports (`import`, `export … from`, `import()`, `require`) of a Unit's mapped source
 * files that resolve to repository files outside its bound inputs. Relative specifiers and workspace packages (by
 * `package.json` name and string `exports`/`main` targets) are resolved; tsconfig paths, bundler aliases and external
 * packages are not. Nothing here is bound or affects applicability; a reviewer maps a listed file that carries the
 * Unit's behavior, or adds it to `sharedPaths`.
 */
export declare function unboundImports(snapshot: UnitSnapshot, repository: RepositorySnapshot, unitId: string): UnboundImport[];
