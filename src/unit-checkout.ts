import { safePath } from './project-files.js'
import { assertNoPendingUnitWrite } from './unit-transaction.js'
import { assertShape } from './unit-shape.js'
import { checkoutShape } from './unit-model.js'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, lstat, readlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import ts from 'typescript'
import { digest, canonical } from './unit-identity.js'
import { repositoryPath } from './unit-core.js'
import { loadUnits } from './unit-source.js'
import type { CheckoutContext, CodeEntry, UnitSnapshot } from './unit-model.js'
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex')
export interface RepositorySnapshot { context: CheckoutContext; contents: Map<string, Buffer>; token: string }
const git = (root: string, args: string[], input?: string) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 256 * 1024 * 1024, ...(input === undefined ? {} : { input }) })
/** Read one explicit Git tree/index or a labelled working-tree candidate. No fetch. */
export async function readRepository(root: string, target: 'commit' | 'index' | 'working-tree' = 'commit', ref = 'HEAD'): Promise<RepositorySnapshot> { return readCheckout(root, target, ref, false) }
/** Only `suo/` of one commit: enough to load its authority, never a binding input context. */
export async function readCommitAuthority(root: string, ref: string): Promise<RepositorySnapshot> { return readCheckout(root, 'commit', ref, true) }
async function readCheckout(root: string, target: 'commit' | 'index' | 'working-tree', ref: string, authorityOnly: boolean): Promise<RepositorySnapshot> {
  if (target === 'working-tree') await assertNoPendingUnitWrite(root)
  let rows: Array<{ path: string; mode: CodeEntry['mode']; oid?: string }> = [], identity: string
  if (target === 'commit') {
    identity = git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).toString().trim()
    rows = git(root, ['ls-tree', '-rz', '--full-tree', identity, ...(authorityOnly ? ['--', 'suo'] : [])]).toString().split('\0').filter(Boolean).map(line => { const tab = line.indexOf('\t'), [mode, , oid] = line.slice(0,tab).split(' '); return { path: line.slice(tab+1), mode: mode as CodeEntry['mode'], oid: oid! } })
  } else if (target === 'index') {
    rows = git(root, ['ls-files', '--stage', '-z']).toString().split('\0').filter(Boolean).map(line => { const tab = line.indexOf('\t'), [mode, oid, stage] = line.slice(0,tab).split(' '); if (stage !== '0') throw new Error('unmerged index'); return { path: line.slice(tab+1), mode: mode as CodeEntry['mode'], oid: oid! } }); identity = ''
  } else {
    const paths = [...new Set(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).toString().split('\0').filter(Boolean))].filter(path=>!path.startsWith('.suo/'))
    for (const path of paths) {
      repositoryPath(path)
      if (dirname(path) !== '.') await safePath(root,dirname(path))
      try { const stat = await lstat(join(root,path)); if (stat.isDirectory()) rows.push({ path, mode:'160000' }); else rows.push({ path, mode:stat.isSymbolicLink() ? '120000' : stat.mode & 0o111 ? '100755' : '100644' }) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
    identity = ''
  }
  if (rows.length > 200_000) throw new Error('repository input budget exceeded')
  const contents = new Map<string, Buffer>(), unavailable: string[] = [], entries: CodeEntry[] = []
  const blobs = rows.filter(row => row.oid && row.mode !== '160000')
  let batch: Buffer = Buffer.alloc(0), offset = 0
  if (blobs.length) batch = git(root, ['cat-file', '--batch'], blobs.map(row=>row.oid).join('\n')+'\n')
  for (const row of rows) {
    repositoryPath(row.path)
    let bytes: Buffer
    if (row.mode === '160000') { bytes = Buffer.from(row.oid ?? 'unavailable working-tree gitlink'); unavailable.push(`${row.path}: gitlink content is outside this snapshot`) }
    else if (row.oid) {
      const end = batch.indexOf(10, offset), header = batch.subarray(offset,end).toString(), [oid, type, size] = header.split(' ')
      if (oid !== row.oid || type !== 'blob' || !/^\d+$/.test(size ?? '')) throw new Error('unexpected Git blob batch')
      const length = Number(size); bytes = batch.subarray(end+1,end+1+length); if (bytes.length !== length || batch[end+1+length] !== 10) throw new Error('truncated Git blob batch'); offset = end+length+2
    } else { if (dirname(row.path) !== '.') await safePath(root,dirname(row.path)); bytes = row.mode === '120000' ? Buffer.from(await readlink(join(root,row.path))) : await readFile(join(root,row.path)) }
    if (bytes.length > 32 * 1024 * 1024) throw new Error(`input file too large: ${row.path}`)
    if (bytes.subarray(0,80).toString().startsWith('version https://git-lfs.github.com/spec/v1')) unavailable.push(`${row.path}: LFS content is outside this snapshot`)
    contents.set(row.path,bytes); entries.push({ path:row.path,mode:row.mode,digest:hash(bytes),symbols:null })
  }
  entries.sort((a,b)=>a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  const token = repositoryToken(entries)
  return { context:{ target,identity:identity || token,entries,unavailable }, contents, token }
}
export async function loadRepositoryUnits(repository: RepositorySnapshot): Promise<UnitSnapshot> {
  if (!(repository.contents instanceof Map) || Object.getPrototypeOf(repository.contents)!==Map.prototype) throw new Error('repository contents must be a plain Map')
  const captured: RepositorySnapshot = {context:JSON.parse(canonical(repository.context)) as CheckoutContext,contents:new Map([...repository.contents].map(([path,bytes])=>[path,Buffer.from(bytes)])),token:repository.token}
  validateRepositorySnapshot(captured)
  const temporary = await mkdtemp(join(tmpdir(),'suo-commit-'))
  try {
    const modes = new Map(captured.context.entries.map(e=>[e.path,e.mode]))
    for (const [path,bytes] of captured.contents) if (path.startsWith('suo/')) {
      if (!['100644','100755'].includes(modes.get(path)!)) throw new Error('authority must contain regular files')
      await mkdir(dirname(join(temporary,path)),{recursive:true}); await writeFile(join(temporary,path),bytes)
    }
    const snapshot = await loadUnits(temporary)
    if (repository.token!==captured.token) throw new Error('repository snapshot changed while loading')
    resolveCoverageSymbols(snapshot,repository)
    return snapshot
  } finally { await rm(temporary,{recursive:true,force:true}) }
}

export function resolveCoverageSymbols(snapshot: UnitSnapshot, repository: RepositorySnapshot): void {
  validateRepositorySnapshot(repository)
  const referenced = new Set(snapshot.units.flatMap(u=>u.implementation.coverage.filter(c=>c.symbol !== null).map(c=>c.path)))
  for (const entry of repository.context.entries) if (referenced.has(entry.path)) {
      if (!/\.[cm]?[jt]sx?$/.test(entry.path)) throw new Error(`symbol resolution unsupported: ${entry.path}`)
      const source = ts.createSourceFile(entry.path, repository.contents.get(entry.path)!.toString('utf8'), ts.ScriptTarget.ES2023, true), stack: ts.Node[] = [source], symbols = new Set<string>()
      while (stack.length) { const node = stack.pop()!; if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name && ts.isIdentifier(node.name)) symbols.add(node.name.text); ts.forEachChild(node,child=>{stack.push(child)}) }
      entry.symbols = [...symbols].sort()
    }
}

function repositoryToken(entries: CodeEntry[]): string { return digest(entries.map(({path,mode,digest})=>({path,mode,digest}))) }
export function validateRepositorySnapshot(repository: RepositorySnapshot): void {
  assertShape(checkoutShape, repository.context)
  if (!(repository.contents instanceof Map)) throw new Error('repository contents must be a Map')
  const paths = new Set<string>()
  for (const entry of repository.context.entries) {
    repositoryPath(entry.path)
    if (paths.has(entry.path)) throw new Error('duplicate repository path')
    paths.add(entry.path)
    const bytes = repository.contents.get(entry.path)
    if (!Buffer.isBuffer(bytes) || hash(bytes) !== entry.digest) throw new Error(`repository content identity mismatch: ${entry.path}`)
  }
  for (const path of repository.contents.keys()) { repositoryPath(path); if (!paths.has(path)) throw new Error('unlisted repository content') }
  if (repository.token !== repositoryToken(repository.context.entries)) throw new Error('repository token mismatch')
}
