import { execFileSync } from 'node:child_process';
import { readRepository, loadRepositoryUnits } from './unit-checkout.js';
import { inspectUnits, validateUnits } from './unit-core.js';
import { findBindingCommit, bindingBaseCandidates, recordedMapping, scopedInputs } from './unit-explain.js';
import { saveUnits } from './unit-store.js';
import { canonical } from './unit-identity.js';
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
const head = (root) => { try {
    return git(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']).trim() || null;
}
catch {
    return null;
} };
/**
 * Replace the input policy and translate each implementation binding instead of invalidating it.
 * A binding is translated only at a tree where its recorded fingerprint is exactly reproduced, and only when every input
 * the new policy binds for that Unit was also bound by the old one there: the old binding vouched for those bytes.
 * Definition fingerprints, coverage and states are untouched. Nothing is translated from an inexact or missing base.
 */
export async function rescopeUnits(root, expectedToken, inputPolicy, depth = 200, save = true) {
    if (!Number.isSafeInteger(depth) || depth < 1)
        throw new Error('depth must be a positive integer');
    const repository = await readRepository(root, 'working-tree');
    if (repository.token !== expectedToken)
        throw new Error('stale repository inputs: reload before saving');
    const before = await loadRepositoryUnits(repository), after = JSON.parse(canonical({ ...before, inputPolicy }));
    validateUnits(after);
    inspectUnits(before, repository.context);
    inspectUnits(after, repository.context);
    const start = head(root), cache = new Map(), contexts = new Map();
    const contextAt = (sha) => { let c = contexts.get(sha); if (!c) {
        c = readRepository(root, 'commit', sha).then(r => r.context);
        contexts.set(sha, c);
    } return c; };
    const units = [];
    for (const unit of after.units) {
        const recorded = unit.implementation.inputDigest;
        if (recorded === null)
            continue;
        const old = before.units.find(u => u.id === unit.id);
        // The binding's own snapshot (its policy and mapping) and the trees that may reproduce it.
        // `snapshot` reproduces the recorded fingerprint; `mapping` is the coverage/documents the binding was recorded with.
        // `mapping` null: the binding entered through a merge whose recorded mapping is unconfirmed; nothing is translated from it.
        let bases;
        if (scopedInputs(before, repository.context, old).identity === recorded) {
            // Current in the working tree; a committed binding's mapping is the one from the commit that recorded it.
            const introduced = start ? await findBindingCommit(root, start, old, depth, cache) : null;
            const recordedIn = introduced ? await recordedMapping(root, introduced, unit.id, depth, cache) : before;
            bases = (async function* () { yield { label: 'working-tree', snapshot: before, mapping: recordedIn, context: async () => repository.context }; })();
        }
        else {
            const found = start ? await findBindingCommit(root, start, old, depth, cache) : null;
            if (!found) {
                units.push({ unitId: unit.id, result: 'kept', reason: start ? `binding not found in committed history within depth ${depth}` : 'no committed history' });
                continue;
            }
            bases = (async function* () { for await (const base of bindingBaseCandidates(root, found, unit.id, depth, cache))
                yield { label: base.commit, snapshot: base.snapshot, mapping: base.mappingKnown ? base.snapshot : null, context: () => contextAt(base.commit) }; })();
        }
        let outcome = { unitId: unit.id, result: 'kept', reason: 'recorded input fingerprint is not exactly reproduced by any candidate base (binding commit, its parent, the merged branch or a translated binding)' };
        for await (const base of bases) {
            const context = await base.context();
            let prior;
            try {
                prior = scopedInputs(base.snapshot, context, old);
            }
            catch {
                continue;
            }
            if (prior.identity !== recorded)
                continue;
            // Translate the mapping the binding was recorded with, never a later unreviewed remap: that must keep reading stale.
            if (!base.mapping) {
                outcome = { unitId: unit.id, result: 'kept', reason: 'binding entered through a merge whose recorded mapping cannot be confirmed on the merged branch' };
                break;
            }
            const recordedUnit = base.mapping.units.find(u => u.id === unit.id) ?? old;
            let next;
            try {
                next = scopedInputs({ ...base.mapping, inputPolicy }, context, recordedUnit);
            }
            catch {
                continue;
            }
            const vouched = new Set(prior.inputs.map(e => e.path)), unvouched = next.inputs.filter(e => !vouched.has(e.path)).map(e => e.path);
            if (unvouched.length) {
                outcome = { unitId: unit.id, result: 'kept', reason: `new policy binds inputs the old binding did not: ${unvouched.slice(0, 5).join(', ')}${unvouched.length > 5 ? ', ...' : ''}` };
                break;
            }
            unit.implementation.inputDigest = next.identity;
            outcome = { unitId: unit.id, result: 'translated', base: base.label, inputs: next.identity === scopedInputs(after, repository.context, unit).identity ? 'current' : 'stale' };
            break;
        }
        units.push(outcome);
    }
    if (save)
        await saveUnits(root, after, expectedToken);
    return { saved: save, target: 'working-tree', committed: false, policyChanged: canonical(before.inputPolicy) !== canonical(after.inputPolicy), units, notice: 'Translated fingerprints restate recorded bindings under the new input scope; no declaration was reviewed, rebound or accepted.' };
}
//# sourceMappingURL=unit-rescope.js.map