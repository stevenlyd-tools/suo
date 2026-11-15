import { execFileSync } from 'node:child_process';
import { readRepository, readCommitAuthority, loadRepositoryUnits } from './unit-checkout.js';
import { inspectUnits, unitInputScopes } from './unit-core.js';
import { canonical } from './unit-identity.js';
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
const commit = (root, ref) => { try {
    return git(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]).trim() || null;
}
catch {
    return null;
} };
const binding = (u) => u ? canonical([u.implementation.definitionDigest, u.implementation.inputDigest]) : null;
const authorityAt = (root, sha, cache) => {
    let loaded = cache.get(sha);
    // Authority this client cannot read (an older schema, or none) cannot hold the current binding.
    if (!loaded) {
        loaded = readCommitAuthority(root, sha).then(loadRepositoryUnits).catch(() => null);
        cache.set(sha, loaded);
    }
    return loaded;
};
/** Newest-first walk over authority-changing first-parent commits (optionally not reachable from `exclude`); returns the oldest commit of the contiguous run still holding this binding. */
export async function findBindingCommit(root, start, unit, depth, cache = new Map(), exclude) {
    const wanted = binding(unit);
    let found = null;
    for (const sha of git(root, ['rev-list', '--first-parent', `--max-count=${depth}`, start, ...(exclude ? [`^${exclude}`] : []), '--', 'suo']).split('\n').filter(Boolean)) {
        const snapshot = await authorityAt(root, sha, cache);
        if (!snapshot || binding(snapshot.units.find(u => u.id === unit.id)) !== wanted)
            break;
        found = { commit: sha, snapshot };
    }
    return found;
}
/**
 * Trees that may hold the exact inputs of a committed binding, best first: the binding commit and its parent; when the
 * binding commit is a merge, the same search along the merged branch (where the binding was actually recorded); and when it
 * changed the input policy (a `rescope` translation), the bases of the binding it translated. At most `depth` searches.
 */
export async function* bindingBaseCandidates(root, found, unitId, depth, cache = new Map()) {
    // Lazy: callers stop at the first exact base, so the common case loads no further authority.
    const queue = [found], seen = new Set(), yielded = new Set();
    const fresh = (c) => { const key = `${c.commit}\0${canonical(c.snapshot.inputPolicy)}`; if (yielded.has(key))
        return false; yielded.add(key); return true; };
    for (let searches = 0; queue.length && searches < depth; searches++) {
        const f = queue.shift();
        if (seen.has(f.commit))
            continue;
        seen.add(f.commit);
        const parent = commit(root, `${f.commit}^`), merged = commit(root, `${f.commit}^2`);
        if (fresh(f))
            yield f;
        if (parent) {
            const p = { commit: parent, snapshot: f.snapshot };
            if (fresh(p))
                yield p;
        }
        const unit = f.snapshot.units.find(u => u.id === unitId);
        if (merged && parent && unit) {
            const inner = await findBindingCommit(root, merged, unit, depth, cache, parent);
            if (inner)
                queue.push(inner);
        }
        const prior = parent ? await authorityAt(root, parent, cache) : null, priorUnit = prior?.units.find(u => u.id === unitId);
        if (parent && prior && priorUnit?.implementation.inputDigest && canonical(prior.inputPolicy) !== canonical(f.snapshot.inputPolicy)) {
            // The translated fingerprint was taken with the rescope's own policy and mapping at the earlier binding's base.
            const translated = await findBindingCommit(root, parent, priorUnit, depth, cache);
            if (translated)
                queue.push({ commit: translated.commit, snapshot: f.snapshot });
        }
    }
}
/** The Unit's scoped inputs under `s`; a snapshot that predates the Unit is read with the Unit's current mapping. */
export function scopedInputs(s, context, unit) {
    const scopes = unitInputScopes(s.units.some(u => u.id === unit.id) ? s : { ...s, units: [...s.units, unit] }, context);
    return { inputs: scopes.inputs(unit.id), identity: scopes.identity(unit.id) };
}
function compareInputs(before, after) {
    const old = new Map(before.bound.map(e => [e.path, e])), changes = [];
    const exists = (context) => new Set(context.entries.map(e => e.path)), existedBefore = exists(before.context), existsAfter = exists(after.context);
    for (const e of after.bound) {
        const prior = old.get(e.path);
        old.delete(e.path);
        if (!prior)
            changes.push({ path: e.path, change: existedBefore.has(e.path) ? 'included' : 'added' });
        else if (prior.digest !== e.digest || prior.mode !== e.mode)
            changes.push({ path: e.path, change: 'modified' });
    }
    for (const path of old.keys())
        changes.push({ path, change: existsAfter.has(path) ? 'excluded' : 'removed' });
    return changes.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
/** Read-only review guidance for one binding. Git is the only history source; nothing is stored or rebound. */
export async function explainUnit(root, target, ref, unitId, depth = 200) {
    if (!Number.isSafeInteger(depth) || depth < 1)
        throw new Error('depth must be a positive integer');
    const repository = await readRepository(root, target, ref), snapshot = await loadRepositoryUnits(repository), projection = inspectUnits(snapshot, repository.context);
    const unit = snapshot.units.find(u => u.id === unitId), bound = projection.units.find(u => u.id === unitId);
    if (!unit || !bound)
        throw new Error('unknown Unit');
    const result = { unitId, applicability: bound.applicability, unavailable: repository.context.unavailable, bindingCommit: null, definition: null, inputs: null, notice: 'Review guidance from Git history; not semantic proof, acceptance or permission to rebind.' };
    if (unit.implementation.definitionDigest === null)
        return result;
    const definitionChanged = unit.implementation.definitionDigest !== bound.compositeDigest, inputsChanged = unit.implementation.inputDigest !== bound.inputDigest;
    if (!definitionChanged && !inputsChanged) {
        result.definition = { changed: false, fields: [], decisionsChanged: false, comparedWith: null };
        result.inputs = { changed: false, base: null, policyChanged: false, changes: [] };
        return result;
    }
    const start = target === 'commit' ? repository.context.identity : commit(root, 'HEAD');
    const cache = new Map(), found = start ? await findBindingCommit(root, start, unit, depth, cache) : null;
    result.bindingCommit = found?.commit ?? null;
    // An uncommitted binding was recorded against a working state derived from HEAD; compare with it, marked inexact unless reproduced.
    const reference = found ?? (start && target !== 'commit' ? await loadRepositoryUnits(await readCommitAuthority(root, start)).then(snapshot => ({ commit: start, snapshot }), () => null) : null);
    const definitionOf = (s) => s.units.find(u => u.id === unitId)?.definition;
    if (definitionChanged && reference) {
        const prior = definitionOf(reference.snapshot), current = unit.definition;
        const fields = prior ? Object.keys(current).filter(key => canonical(prior[key]) !== canonical(current[key])) : Object.keys(current);
        const decisions = (s) => canonical(s.decisions.filter(d => d.unitId === unitId).sort((a, b) => a.id < b.id ? -1 : 1));
        result.definition = { changed: true, fields, decisionsChanged: decisions(reference.snapshot) !== decisions(snapshot), comparedWith: reference.commit };
    }
    else
        result.definition = { changed: definitionChanged, fields: [], decisionsChanged: false, comparedWith: null };
    if (!inputsChanged || !reference) {
        result.inputs = { changed: inputsChanged, base: null, policyChanged: false, changes: [] };
        return result;
    }
    const candidates = [];
    for await (const candidate of found ? bindingBaseCandidates(root, found, unitId, depth, cache) : [{ commit: reference.commit, snapshot: reference.snapshot }]) {
        const context = (await readRepository(root, 'commit', candidate.commit)).context;
        let exact = false;
        try {
            exact = scopedInputs(candidate.snapshot, context, unit).identity === unit.implementation.inputDigest;
        }
        catch { /* coverage no longer resolves there: not reproducible */ }
        candidates.push({ ...candidate, context, exact });
        if (exact)
            break;
    }
    // Without an exact base, the binding commit's parent precedes every change made alongside the record, so it is the safer approximate base.
    const base = candidates.find(c => c.exact) ?? candidates[Math.min(1, candidates.length - 1)];
    result.inputs = { changed: true, base: { commit: base.commit, exact: base.exact }, policyChanged: canonical(reference.snapshot.inputPolicy) !== canonical(snapshot.inputPolicy), changes: compareInputs({ bound: scopedInputs(base.snapshot, base.context, unit).inputs, context: base.context }, { bound: scopedInputs(snapshot, repository.context, unit).inputs, context: repository.context }) };
    return result;
}
//# sourceMappingURL=unit-explain.js.map