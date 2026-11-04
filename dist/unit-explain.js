import { execFileSync } from 'node:child_process';
import { readRepository, readCommitAuthority, loadRepositoryUnits } from './unit-checkout.js';
import { inspectUnits, inputIdentity, boundInputs } from './unit-core.js';
import { canonical } from './unit-identity.js';
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
const commit = (root, ref) => { try {
    return git(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]).trim() || null;
}
catch {
    return null;
} };
const binding = (u) => u ? canonical([u.implementation.definitionDigest, u.implementation.inputDigest]) : null;
/** Newest-first walk over authority-changing first-parent commits; returns the oldest commit of the contiguous run still holding this binding. */
async function findBindingCommit(root, start, unit, depth) {
    const wanted = binding(unit);
    let found = null;
    for (const sha of git(root, ['rev-list', '--first-parent', `--max-count=${depth}`, start, '--', 'suo']).split('\n').filter(Boolean)) {
        let snapshot;
        // Authority this client cannot read (an older schema, or none) cannot hold the current binding.
        try {
            snapshot = await loadRepositoryUnits(await readCommitAuthority(root, sha));
        }
        catch {
            break;
        }
        if (binding(snapshot.units.find(u => u.id === unit.id)) !== wanted)
            break;
        found = { commit: sha, snapshot };
    }
    return found;
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
    const definitionChanged = unit.implementation.definitionDigest !== bound.compositeDigest, inputsChanged = unit.implementation.inputDigest !== projection.inputDigest;
    if (!definitionChanged && !inputsChanged) {
        result.definition = { changed: false, fields: [], decisionsChanged: false, comparedWith: null };
        result.inputs = { changed: false, base: null, policyChanged: false, changes: [] };
        return result;
    }
    const start = target === 'commit' ? repository.context.identity : commit(root, 'HEAD');
    const found = start ? await findBindingCommit(root, start, unit, depth) : null;
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
    const parent = found ? commit(root, `${found.commit}^`) : null, candidates = [];
    for (const candidate of [reference.commit, ...(parent ? [parent] : [])]) {
        const context = (await readRepository(root, 'commit', candidate)).context;
        let exact = false;
        try {
            exact = inputIdentity(reference.snapshot, context) === unit.implementation.inputDigest;
        }
        catch { /* coverage no longer resolves there: not reproducible */ }
        candidates.push({ commit: candidate, context, exact });
        if (exact)
            break;
    }
    // Without an exact base, the oldest candidate precedes every change made alongside the record, so it is the safer approximate base.
    const base = candidates.find(c => c.exact) ?? candidates.at(-1);
    result.inputs = { changed: true, base: { commit: base.commit, exact: base.exact }, policyChanged: canonical(reference.snapshot.inputPolicy) !== canonical(snapshot.inputPolicy), changes: compareInputs({ bound: boundInputs(reference.snapshot, base.context), context: base.context }, { bound: boundInputs(snapshot, repository.context), context: repository.context }) };
    return result;
}
//# sourceMappingURL=unit-explain.js.map