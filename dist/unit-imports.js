import { posix } from 'node:path';
import ts from 'typescript';
import { boundInputs, unitInputScopes } from './unit-core.js';
const code = /\.[cm]?[jt]sx?$/;
const leaves = (value) => {
    // Explicit stack: `exports` condition objects may nest.
    const stack = [value], out = [];
    while (stack.length) {
        const v = stack.pop();
        if (typeof v === 'string')
            out.push(v);
        else if (v && typeof v === 'object')
            stack.push(...Object.values(v));
    }
    return out.sort();
};
/**
 * Advisory only: the one-hop static imports (`import`, `export … from`, `import()`, `require`) of a Unit's mapped source
 * files that resolve to repository files outside its bound inputs. Relative specifiers and workspace packages (by
 * `package.json` name and string `exports`/`main` targets) are resolved; tsconfig paths, bundler aliases and external
 * packages are not. Nothing here is bound or affects applicability; a reviewer maps a listed file that carries the
 * Unit's behavior, or adds it to `sharedPaths`.
 */
export function unboundImports(snapshot, repository, unitId) {
    const context = repository.context, unit = snapshot.units.find(u => u.id === unitId);
    if (!unit)
        throw new Error('unknown Unit');
    const candidates = new Set(boundInputs(snapshot, context).map(e => e.path)), bound = new Set(unitInputScopes(snapshot, context).inputs(unitId).map(e => e.path));
    const files = new Set(context.entries.map(e => e.path)), packages = new Map();
    for (const path of candidates)
        if (posix.basename(path) === 'package.json') {
            try {
                const manifest = JSON.parse(repository.contents.get(path).toString('utf8'));
                if (typeof manifest.name === 'string' && !packages.has(manifest.name))
                    packages.set(manifest.name, { dir: posix.dirname(path), manifest });
            }
            catch { /* not a manifest this advisory can read */ }
        }
    const resolveFile = (base) => {
        const stem = code.test(base) && !/\.tsx?$/.test(base) ? base.replace(/\.[cm]?jsx?$/, '') : null;
        const tried = [base, ...(stem ? ['.ts', '.tsx', '.mts', '.cts', '.d.ts'].map(e => stem + e) : []), ...['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.d.ts'].flatMap(e => [base + e, `${base}/index${e}`])];
        return tried.find(path => files.has(path)) ?? null;
    };
    const resolve = (from, specifier) => {
        const join = (dir, rel) => { const path = posix.normalize(posix.join(dir, rel)); return path.startsWith('../') || path === '..' ? null : path; };
        if (specifier.startsWith('.')) {
            const path = join(posix.dirname(from), specifier), file = path && resolveFile(path);
            return file ? [file] : [];
        }
        const parts = specifier.split('/'), name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0], sub = specifier.slice(name.length), pkg = packages.get(name);
        if (!pkg)
            return [];
        const exports = pkg.manifest.exports;
        let targets;
        if (exports !== undefined) {
            const keyed = exports && typeof exports === 'object' && !Array.isArray(exports) && Object.keys(exports).some(k => k.startsWith('.'));
            targets = keyed ? leaves(exports[`.${sub}`]) : sub ? [] : leaves(exports);
        }
        else
            targets = sub ? [`.${sub}`] : leaves(pkg.manifest.main ?? './index.js');
        return targets.flatMap(t => { const path = join(pkg.dir, t), file = path && resolveFile(path); return file ? [file] : []; });
    };
    const found = new Map();
    for (const from of [...new Set(unit.implementation.coverage.filter(c => c.kind === 'source').map(c => c.path))].sort()) {
        if (!code.test(from) || !repository.contents.has(from))
            continue;
        for (const { fileName } of ts.preProcessFile(repository.contents.get(from).toString('utf8'), true, true).importedFiles)
            for (const path of resolve(from, fileName))
                if (candidates.has(path) && !bound.has(path))
                    found.set(`${from}\0${path}`, { from, path });
    }
    return [...found.values()].sort((a, b) => a.from < b.from ? -1 : a.from > b.from ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
//# sourceMappingURL=unit-imports.js.map