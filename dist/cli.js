#!/usr/bin/env node
import { checkWriter, recordWriter } from './writer.js';
import { renderUnits } from './unit-render.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readRepository, loadRepositoryUnits } from './unit-checkout.js';
import { inspectUnits, validateUnits } from './unit-core.js';
import { explainUnit } from './unit-explain.js';
import { saveUnits, recoverUnits, createUnitTemplate } from './unit-store.js';
import { assertShape, object, string, literals, array, nullable } from './unit-shape.js';
const emit = (value) => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const args = process.argv.slice(2);
function option(name, fallback) { const i = args.indexOf(name); if (i < 0)
    return fallback; const value = args[i + 1]; if (!value || value.startsWith('--'))
    throw new Error(`missing ${name}`); args.splice(i, 2); return value; }
async function main() {
    if (args.includes('--version')) {
        console.log(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version);
        return;
    }
    const root = resolve(option('--root', process.cwd())), target = option('--target', 'commit'), ref = option('--ref', 'HEAD');
    if (!['commit', 'index', 'working-tree'].includes(target))
        throw new Error('target must be commit, index or working-tree');
    const command = args.shift() ?? 'help';
    if (command === 'help' || command === '--help') {
        console.log('suo --version\nsuo --root PROJECT [--target commit|index|working-tree] [--ref REF] inspect|check|export|next|render\nsuo --root PROJECT [--target commit|index|working-tree] [--ref REF] explain UNIT_ID [--depth N]\nsuo --root PROJECT apply ENVELOPE.json --yes\nsuo --root PROJECT record ENVELOPE.json --yes\nsuo --root PROJECT recover\nsuo --root PROJECT writer check [--skill SKILL_PACKAGE_OR_DIRECTORY]\nsuo --root PROJECT writer record --yes\nsuo template DIRECTORY --title TITLE\nCommit inspection is read-only. Working-tree is an explicit candidate, never HEAD. External CI/deployment state is not persisted.');
        return;
    }
    if (command === 'writer') {
        const action = args.shift();
        if (action === 'check') {
            const skill = option('--skill');
            if (args.length)
                throw new Error('unexpected writer check arguments');
            const result = await checkWriter(root, skill);
            emit(result);
            if (result.skill && !result.skill.matches)
                process.exitCode = 1;
            return;
        }
        if (action === 'record' && args.length === 1 && args[0] === '--yes') {
            await recordWriter(root);
            emit({ recorded: true, path: 'suo/writer.json' });
            return;
        }
        throw new Error('writer check or writer record --yes required');
    }
    if (command === 'explain') {
        const depth = option('--depth', '200'), unitId = args.shift();
        if (!unitId || args.length || !/^[1-9]\d*$/.test(depth))
            throw new Error('explain requires UNIT_ID and an optional positive --depth');
        emit(await explainUnit(root, target, ref, unitId, Number(depth)));
        return;
    }
    if (command === 'recover') {
        if (args.length)
            throw new Error('unexpected recover arguments');
        await recoverUnits(root);
        emit({ recovered: true });
        return;
    }
    if (command === 'template') {
        const destination = resolve(args.shift() ?? ''), title = option('--title');
        if (!title || args.length)
            throw new Error('template requires destination and --title');
        const s = { schemaVersion: 5, product: { id: 'product', title }, units: [], decisions: [], containment: [], dependencies: [], inputPolicy: { nonRuntimePaths: [], rationale: 'All repository inputs except Suo authority and generated views; these must not be runtime inputs.' } };
        await createUnitTemplate(destination, s);
        emit({ template: destination });
        return;
    }
    if (['apply', 'record'].includes(command)) {
        const path = args.shift();
        if (!path || args.length !== 1 || args[0] !== '--yes')
            throw new Error('mutation requires envelope path and --yes; inspect/review candidate first');
        const input = JSON.parse(await readFile(path, 'utf8'));
        const repo = await readRepository(root, 'working-tree');
        let snapshot, expectedToken;
        if (command === 'apply') {
            if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join(',') !== 'expectedToken,snapshot')
                throw new Error('apply requires exactly expectedToken and snapshot');
            const envelope = input;
            validateUnits(envelope.snapshot);
            snapshot = envelope.snapshot;
            expectedToken = envelope.expectedToken;
        }
        else {
            const shape = object({ expectedToken: string(), unitId: string(), state: literals('unknown', 'not_started', 'in_progress', 'implemented'), coverage: array(object({ criterionId: string(), path: string(), symbol: nullable(string()), kind: literals('source', 'test') })), gaps: array(string()) });
            assertShape(shape, input);
            snapshot = await loadRepositoryUnits(repo);
            expectedToken = input.expectedToken;
            const projection = inspectUnits(snapshot, repo.context), unit = snapshot.units.find(u => u.id === input.unitId), bound = projection.units.find(u => u.id === input.unitId);
            if (!unit || !bound)
                throw new Error('unknown Unit');
            unit.implementation = { state: input.state, coverage: input.coverage, gaps: input.gaps, definitionDigest: input.state === 'unknown' ? null : bound.coverageDigest, inputDigest: input.state === 'unknown' ? null : projection.inputDigest };
        }
        await saveUnits(root, snapshot, expectedToken);
        emit({ saved: true, target: 'working-tree', committed: false });
        return;
    }
    if (!['inspect', 'check', 'export', 'next', 'render'].includes(command) || args.length)
        throw new Error('unknown command/arguments; run --help');
    const repo = await readRepository(root, target, ref), snapshot = await loadRepositoryUnits(repo), projection = inspectUnits(snapshot, repo.context);
    if (command === 'render') {
        process.stdout.write(renderUnits(snapshot, repo.context));
        return;
    }
    if (command === 'export')
        emit({ snapshot, expectedToken: repo.token, context: repo.context });
    else if (command === 'check')
        emit({ ok: true, expectedToken: repo.token, ...projection });
    else if (command === 'next')
        emit({ target: projection.target, units: projection.units.filter(u => !u.implemented).map(u => ({ id: u.id, title: u.title, startReady: u.startReady, blockers: u.blockers, applicability: u.applicability })), notice: 'No implicit approval, external verification or deployment permission.' });
    else
        emit({ expectedToken: repo.token, ...projection });
}
main().catch(error => { process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n'); process.exitCode = 1; });
//# sourceMappingURL=cli.js.map