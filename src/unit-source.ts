import { assertNoPendingUnitWrite } from './unit-transaction.js'
import { readFile, readdir, realpath } from 'node:fs/promises'
import { join, relative, resolve, dirname, sep } from 'node:path'
import { build } from 'esbuild'
import ts from 'typescript'
import { unitShape, decisionShape, inputPolicyShape, type UnitSnapshot, type Unit, type UnitDecision } from './unit-model.js'
import type { Shape } from './unit-shape.js'
import { validateUnits, repositoryPath } from './unit-core.js'
import { digest, canonical } from './unit-identity.js'
export interface SourceDecision extends Omit<UnitDecision, 'unitId' | 'prerequisites'> { unit: Unit; prerequisites: SourceDecision[] }
export interface SourceUnits extends Omit<UnitSnapshot, 'decisions' | 'containment' | 'dependencies'> { decisions: SourceDecision[]; containment: Array<{ parent: Unit; child: Unit }>; dependencies: Array<{ consumer: Unit; prerequisite: Unit; require: 'contract' | 'implementation' | 'verification'; at: 'start' | 'verify' | 'accept' }> }
function typeExpression(shape: Shape<unknown>): string {
  const stack: Array<Shape<unknown> | string> = [shape], out: string[] = []
  while (stack.length) {
    const s = stack.pop()!; if (typeof s === 'string') { out.push(s); continue }
    if (['string','number','boolean'].includes(s.kind)) { out.push(s.kind); continue }
    if (s.kind === 'literal') { out.push(s.values!.map(v => JSON.stringify(v)).join(' | ')); continue }
    if (s.kind === 'array') { stack.push('>'); stack.push(s.item!); stack.push('Array<'); continue }
    if (s.kind === 'nullable') { stack.push(' | null)'); stack.push(s.item!); stack.push('('); continue }
    stack.push('}')
    for (const [key, field] of Object.entries(s.fields!).reverse()) { stack.push(';'); stack.push(field); stack.push(`${JSON.stringify(key)}:`) }
    stack.push('{')
  }
  return out.join('')
}
const ontology = (inputPolicy: string) => `// Generated from runtime shapes. Do not edit.\nexport type UnitNode = ${typeExpression(unitShape)};\nexport type DecisionData = ${typeExpression(decisionShape)};\nexport interface DecisionNode extends Omit<DecisionData, 'unitId' | 'prerequisites'> { unit: UnitNode; prerequisites: DecisionNode[] }\nexport interface UnitAuthority { schemaVersion: 5; product: {id:string;title:string}; units: UnitNode[]; decisions: DecisionNode[]; containment: Array<{parent:UnitNode;child:UnitNode}>; dependencies: Array<{consumer:UnitNode;prerequisite:UnitNode;require:'contract'|'implementation'|'verification';at:'start'|'verify'|'accept'}>; inputPolicy:${inputPolicy} }\n`
export const unitOntology = ontology(typeExpression(inputPolicyShape))
/** The 0.10 ontology, read as `scope: 'repository', sharedPaths: []`; the next write replaces it with the current one. */
export const legacyUnitOntology = ontology('{nonRuntimePaths:string[];rationale:string}')
export async function sourceFiles(root: string): Promise<string[]> {
  const stack = [join(root, 'suo')], files: string[] = [], actualRoot = await realpath(root)
  while (stack.length) for (const entry of await readdir(stack.pop()!, { withFileTypes: true })) {
    const path = join(entry.parentPath, entry.name), actual = await realpath(path), rel = relative(actualRoot, actual)
    if (rel.startsWith(`..${sep}`) || rel === '..' || entry.isSymbolicLink()) throw new Error(`source symlink/escape is not allowed: ${path}`)
    if (entry.isDirectory()) stack.push(path); else if (entry.name.endsWith('.ts')) files.push(path)
    if (files.length + stack.length > 200_000) throw new Error('source file budget exceeded')
  }
  return files.sort()
}
function declarative(root: string, file: ts.SourceFile): void {
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) continue
    if (ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Const && statement.declarationList.declarations.length === 1) continue
    if (ts.isExportAssignment(statement) && !statement.isExportEquals && ts.isIdentifier(statement.expression) && statement.expression.text === 'value') continue
    throw new Error(`${file.fileName}: only imports, const value and export default value are permitted`)
  }
  const stack: ts.Node[] = [file]
  while (stack.length) {
    const node = stack.pop()!
    if (ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isAwaitExpression(node) || ts.isYieldExpression(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isClassExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSpreadAssignment(node) || ts.isSpreadElement(node) || ts.isComputedPropertyName(node) || ts.isConditionalExpression(node) || ts.isBinaryExpression(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isTaggedTemplateExpression(node) || ts.isTemplateExpression(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) throw new Error(`${file.fileName}: executable expressions and type assertions are forbidden`)
    if (ts.isImportDeclaration(node)) {
      const specifier = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : '', clause = node.importClause
      if (clause?.isTypeOnly) { if (specifier !== './ontology.js' && specifier !== '../ontology.js') throw new Error('type imports must use generated ontology'); }
      else {
        if (!specifier.startsWith('.') || !specifier.endsWith('.suo.js') || !clause?.name || clause.namedBindings) throw new Error('references must be canonical default .suo.js imports')
        const target = resolve(dirname(file.fileName), specifier.replace(/\.js$/, '.ts'))
        if (!target.startsWith(join(root, 'suo') + sep)) throw new Error('source import leaves authority directory')
      }
    }
    ts.forEachChild(node, child => { stack.push(child) })
  }
}
export async function loadUnits(root: string): Promise<UnitSnapshot> {
  await assertNoPendingUnitWrite(root)
  root = await realpath(root)
  const ontologyText = await readFile(join(root, 'suo/ontology.d.ts'), 'utf8'), legacy = ontologyText === legacyUnitOntology
  if (ontologyText !== unitOntology && !legacy) throw new Error('Unsupported ontology: use explicit Unit migration; do not weaken or replace declarations by hand')
  const files = await sourceFiles(root), program = ts.createProgram(files, { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noEmit: true, skipLibCheck: true, types: [], verbatimModuleSyntax: true })
  if (program.getSourceFile(join(root,'suo/ontology.d.ts'))?.text !== ontologyText) throw new Error('ontology changed during source capture')
  const diagnostics = ts.getPreEmitDiagnostics(program)
  if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => '\n' }))
  for (const path of files) if (path.endsWith('.suo.ts')) declarative(root, program.getSourceFile(path)!)
  const captured = new Map(files.filter(p=>p.endsWith('.suo.ts')).map(p=>[p,program.getSourceFile(p)!.text]))
  const bundled = await build({ plugins: [{name:'validated-snapshot',setup(builder){builder.onLoad({filter:/.*/},args=>{const contents=captured.get(args.path);if(contents===undefined)throw new Error('bundler resolved an unvalidated source input');return {contents,loader:'ts',resolveDir:dirname(args.path)}})}}], entryPoints: [join(root, 'suo/product.suo.ts')], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent', metafile: true })
  const inputs = new Set(Object.keys(bundled.metafile!.inputs).map(p => resolve(p)))
  const allowed = new Set(files.filter(p=>p.endsWith('.suo.ts')))
  for(const input of inputs) if(!allowed.has(input)) throw new Error('bundler resolved an unvalidated source input')
  if (files.some(p => p.endsWith('.suo.ts') && !inputs.has(p))) throw new Error('orphaned authority node')
  const module = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0]!.text).toString('base64')}`) as { default: SourceUnits }
  const source = module.default
  if (!source || !Array.isArray(source.units) || !Array.isArray(source.decisions) || !Array.isArray(source.containment) || !Array.isArray(source.dependencies)) throw new Error('malformed Unit authority')
  const units = new Set(source.units), decisions = new Set(source.decisions)
  const unitRef = (value: Unit): string => { if (!units.has(value)) throw new Error('reference must import canonical rooted Unit object'); return value.id }
  const decisionRef = (value: SourceDecision): string => { if (!decisions.has(value)) throw new Error('reference must import canonical rooted Decision object'); return value.id }
  const snapshot = { ...source,
    inputPolicy: legacy && source.inputPolicy && typeof source.inputPolicy === 'object' ? { ...source.inputPolicy, scope: 'repository' as const, sharedPaths: [] } : source.inputPolicy,
    decisions: source.decisions.map(d => { const { unit, prerequisites, ...rest } = d; return { ...rest, unitId: unitRef(unit), prerequisites: prerequisites.map(decisionRef) } }),
    containment: source.containment.map(e => ({ ...e, parent: unitRef(e.parent), child: unitRef(e.child) })),
    dependencies: source.dependencies.map(e => ({ ...e, consumer: unitRef(e.consumer), prerequisite: unitRef(e.prerequisite) })),
  }
  validateUnits(snapshot); return JSON.parse(canonical(snapshot)) as UnitSnapshot
}
export function unitSourceContents(s: UnitSnapshot): Map<string, string> {
  validateUnits(s)
  const files = new Map<string, string>([['suo/ontology.d.ts', unitOntology]])
  const unitIds = new Set(s.units.map(u=>u.id))
  const paths = new Map([...s.units, ...s.decisions].map(n => [n.id, `${unitIds.has(n.id) ? 'units' : 'decisions'}/${digest(n.id).slice(0, 20)}.suo.ts`]))
  if (paths.size !== s.units.length + s.decisions.length) throw new Error('Unit and Decision IDs must be globally unique')
  const render = (value: unknown, type: string, imports = '') => `${imports}import type { ${type} } from '../ontology.js'\nconst value = ${canonical(value)} satisfies ${type}\nexport default value\n`
  for (const u of s.units) files.set(`suo/${paths.get(u.id)!}`, render(u, 'UnitNode'))
  for (const d of s.decisions) {
    const { unitId, prerequisites, ...data } = d
    const imports = [`import unit from '../${paths.get(unitId)!.replace(/\.ts$/, '.js')}'`, ...prerequisites.map((id,i) => `import prerequisite${i} from '../${paths.get(id)!.replace(/\.ts$/, '.js')}'`)].join('\n')
    files.set(`suo/${paths.get(d.id)!}`, `${imports}\nimport type { DecisionNode } from '../ontology.js'\nconst value = {${canonical(data).slice(1,-1)},unit,prerequisites:[${prerequisites.map((_,i)=>`prerequisite${i}`).join(',')}]} satisfies DecisionNode\nexport default value\n`)
  }
  const names = new Map([...s.units, ...s.decisions].map((n,i) => [n.id, `node${i}`]))
  const imports = [...names].map(([id,name]) => `import ${name} from './${paths.get(id)!.replace(/\.ts$/, '.js')}'`).join('\n')
  const ref = (id: string) => names.get(id)!
  files.set('suo/product.suo.ts', `${imports}\nimport type { UnitAuthority } from './ontology.js'\nconst value = {schemaVersion:5, product:${canonical(s.product)}, inputPolicy:${canonical(s.inputPolicy)}, units:[${s.units.map(u=>ref(u.id)).join(',')}], decisions:[${s.decisions.map(d=>ref(d.id)).join(',')}], containment:[${s.containment.map(e=>`{parent:${ref(e.parent)},child:${ref(e.child)}}`).join(',')}],dependencies:[${s.dependencies.map(e=>`{consumer:${ref(e.consumer)},prerequisite:${ref(e.prerequisite)},require:${JSON.stringify(e.require)},at:${JSON.stringify(e.at)}}`).join(',')}]} satisfies UnitAuthority\nexport default value\n`)
  for (const path of files.keys()) repositoryPath(path)
  return files
}
