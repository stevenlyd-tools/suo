import { createHash } from 'node:crypto'
import { readFile, readdir, lstat, writeFile, rename, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { basename, dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { safePath, withProjectLock } from './project-files.js'
import { readRepository, loadRepositoryUnits } from './unit-checkout.js'

export const writerPath = 'suo/writer.json'
export interface WriterIdentity { schemaVersion: 1; tool: 'suo'; version: string; skillDigest: string; runtimeDigest: string }
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
export function compareWriterVersions(actual: string, recorded: string): number {
  const parse = (value: string) => { if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('writer version must be stable MAJOR.MINOR.PATCH'); return value.split('.').map(BigInt) }
  const a = parse(actual), b = parse(recorded)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]! ? 1 : -1
  return 0
}
export function validateWriter(value: unknown): asserts value is WriterIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'runtimeDigest,schemaVersion,skillDigest,tool,version') throw new Error('unsupported Suo writer record; migrate explicitly')
  const v = value as WriterIdentity
  if (v.schemaVersion !== 1 || v.tool !== 'suo' || typeof v.version !== 'string' || !/^[a-f0-9]{64}$/.test(v.skillDigest) || !/^[a-f0-9]{64}$/.test(v.runtimeDigest)) throw new Error('invalid Suo writer record')
  compareWriterVersions(v.version, v.version)
}
/** Independent of other tools and of the network. Stack traversal includes referenced Skill resources. */
async function directoryDigest(root: string, directory: string, javascriptOnly = false): Promise<string> {
  const stack = [directory], files: Array<[string, string]> = []
  while (stack.length) {
    const path = stack.pop()!
    const actual = await safePath(root, path), stat = await lstat(actual)
    if (stat.isDirectory()) for (const entry of await readdir(actual)) stack.push(`${path}/${entry}`)
    else if (stat.isFile()) { if (!javascriptOnly || path.endsWith('.js')) files.push([path.slice(directory.length + 1), hash(await readFile(actual))]) }
    else throw new Error('writer identity requires regular package files')
  }
  if (!files.length) throw new Error('empty writer identity directory')
  return hash(JSON.stringify(files.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))
}
async function packageVersion(root: string): Promise<string> {
  const pkg = JSON.parse(await readFile(await safePath(root, 'package.json'), 'utf8'))
  if (pkg.name !== '@stevenlyd/suo') throw new Error('unexpected Suo package identity')
  return pkg.version
}
async function packageWriter(root: string): Promise<WriterIdentity> {
  const writer: WriterIdentity = { schemaVersion: 1, tool: 'suo', version: await packageVersion(root), skillDigest: await directoryDigest(root, 'skills/suo'), runtimeDigest: await directoryDigest(root, 'dist', true) }
  validateWriter(writer); return writer
}
export const currentWriter = (): Promise<WriterIdentity> => packageWriter(fileURLToPath(new URL('../', import.meta.url)))
/** Skill identity of a package root or bare Skill directory, read as data: nothing under `path` is imported or executed. */
export async function skillIdentity(path: string): Promise<{ version: string; skillDigest: string }> {
  const absolute = resolve(path)
  let skill: string
  try { await packageVersion(absolute); skill = join(absolute, 'skills/suo') }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; skill = absolute }
  const text = await readFile(await safePath(dirname(skill), `${basename(skill)}/SKILL.md`), 'utf8')
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '', version = /^version: (.+)$/m.exec(frontmatter)?.[1]
  if (!/^name: suo$/m.test(frontmatter) || !version) throw new Error('not a Suo Skill: expected name and version frontmatter')
  compareWriterVersions(version, version)
  return { version, skillDigest: await directoryDigest(dirname(skill), basename(skill)) }
}
/** Parity of a loaded Skill (for example a native plugin cache without dependencies) with this executing runtime. */
export async function checkSkill(path: string) {
  const runtime = await currentWriter(), skill = await skillIdentity(path)
  return { path: resolve(path), ...skill, matches: skill.version === runtime.version && skill.skillDigest === runtime.skillDigest }
}
export async function readWriter(root: string, path = writerPath): Promise<WriterIdentity | null> {
  const actual = await safePath(root, path)
  let text: string
  try { text = await readFile(actual, 'utf8') } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  const writer: unknown = JSON.parse(text); validateWriter(writer); return writer
}
export function requireCompatibleWriter(installed: WriterIdentity, recorded: WriterIdentity | null): 'unrecorded' | 'same' | 'newer' {
  validateWriter(installed)
  if (!recorded) return 'unrecorded'
  validateWriter(recorded)
  const comparison = compareWriterVersions(installed.version, recorded.version)
  if (comparison < 0) throw new Error(`Suo ${installed.version} is older than writer ${recorded.version}; upgrade before writing`)
  if (!comparison && (installed.skillDigest !== recorded.skillDigest || installed.runtimeDigest !== recorded.runtimeDigest)) throw new Error('Suo same-version package identity differs; investigate instead of overwriting')
  return comparison ? 'newer' : 'same'
}
export async function checkWriter(root: string, skillPath?: string) {
  const installed = await currentWriter(), recorded = await readWriter(root)
  return { installed, recorded, ...(skillPath === undefined ? {} : { skill: await checkSkill(skillPath) }), compatibility: requireCompatibleWriter(installed, recorded), path: writerPath, notice: 'Last-writer provenance, not latest-version policy, host-session attestation or migration authorization.' }
}
export const writerContents = (writer: WriterIdentity) => JSON.stringify(writer, null, 2) + '\n'
/** For Skill edits or external renderers. No product replacement, Git commit or other tool record. */
export async function recordWriter(root: string): Promise<void> {
  await withProjectLock(root, async () => {
    const { installed, recorded } = await checkWriter(root)
    const repository = await readRepository(root, 'working-tree')
    await loadRepositoryUnits(repository) // a newer reader must understand the current format
    if (recorded && writerContents(recorded) === writerContents(installed)) return
    const destination = await safePath(root, writerPath), temporary = await safePath(root, `.suo/writer-${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, writerContents(installed), { flag: 'wx' })
      if ((await readRepository(root, 'working-tree')).token !== repository.token) throw new Error('repository changed while recording writer; retry after reviewing')
      await rename(temporary, destination)
    } finally { await rm(temporary, { force: true }) }
  })
}
