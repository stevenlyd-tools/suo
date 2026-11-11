import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('../', import.meta.url))
const json = value => `${JSON.stringify(value, null, 2)}\n`
const hash = value => createHash('sha256').update(value).digest('hex')
const skillPath = 'skills/suo/SKILL.md'
export const packageFiles = ['dist', 'schemas', 'skills', 'scripts/distribution.mjs', 'docs/distribution.md', 'docs/testing/distribution.md', 'plugin.json', '.claude-plugin', 'gemini-extension.json', 'distribution-lock.json', 'README.md', 'LICENSE', 'docs/validation-upgrade.md', 'docs/unit-runtime.md', 'CHANGELOG.md', 'docs/releases.md']
const manifestPaths = ['plugin.json', '.claude-plugin/plugin.json', 'gemini-extension.json']
export const validVersion = value => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
export function newerVersion(next, previous) {
  if (!validVersion(next) || !validVersion(previous)) return false
  const a = next.split('.').map(BigInt), b = previous.split('.').map(BigInt)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

function safePath(root, path) {
  if (!path || path.startsWith('/') || path.split('/').some(part => !part || part === '..' || part === '.')) throw new Error(`Invalid package path: ${path}`)
  let current = root
  for (const part of path.split('/')) {
    current = join(current, part)
    try { if (lstatSync(current).isSymbolicLink()) throw new Error(`Distribution symlink is unsupported: ${path}`) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return current
}
function walk(root, path) {
  const stack = [path], files = []
  while (stack.length) {
    const current = stack.pop(), full = safePath(root, current), stat = lstatSync(full)
    if (stat.isFile()) files.push(current)
    else if (stat.isDirectory()) for (const name of readdirSync(full).sort().reverse()) stack.push(`${current}/${name}`)
    else throw new Error(`Not a regular package file: ${current}`)
  }
  return files
}

function metadata(pkg) {
  const common = { name: 'suo', version: pkg.version, description: pkg.description }
  const identity = { author: pkg.author, repository: pkg.repository.url, license: pkg.license }
  return {
    'plugin.json': json({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', ...common, ...identity }),
    '.claude-plugin/plugin.json': json({ ...common, ...identity, skills: './skills/' }),
    // Host catalogs live in stevenlyd-tools/plugins, which pins this package by release tag.
    'gemini-extension.json': json(common),
  }
}

export function expectedDistribution(root = ROOT) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (!validVersion(pkg.version)) throw new Error('Use stable MAJOR.MINOR.PATCH version metadata')
  if (pkg.name !== '@stevenlyd/suo' || pkg.private !== true || pkg.bin?.suo !== './dist/cli.js' || pkg.engines?.node !== '>=22.18.0') throw new Error('Unexpected runtime package contract')
  if (JSON.stringify(pkg.files) !== JSON.stringify(packageFiles) || JSON.stringify(pkg.pi) !== JSON.stringify({ skills: ['./skills'] })) throw new Error('Package layout or Pi discovery drift')
  for (const path of ['mcp.json', '.mcp.json', 'hooks', 'commands', 'agents', 'bin', 'monitors', 'workflows', 'policies', 'settings.json', 'GEMINI.md', '.lsp.json', '.cursor-plugin', '.codex/config.toml']) {
    if (existsSync(join(root, path))) throw new Error(`Unexpected plugin execution/configuration surface: ${path}`)
  }
  const skill = readFileSync(safePath(root, skillPath), 'utf8')
  if (!skill.startsWith('---\n') || !/^version: [^\n]+$/m.test(skill)) throw new Error('Canonical skill needs version frontmatter')
  const files = { ...metadata(pkg), [skillPath]: skill.replace(/^version: [^\n]+$/m, `version: ${pkg.version}`) }
  // Hash everything shipped, including dependency declarations, compiled code,
  // schemas and installation guidance. The lock itself cannot hash itself.
  const paths = new Set(['package.json'])
  for (const path of packageFiles.filter(path => path !== 'distribution-lock.json')) {
    if (manifestPaths.includes(path)) paths.add(path)
    else if (path === '.claude-plugin') {
      for (const file of manifestPaths.filter(file => file.startsWith(`${path}/`))) paths.add(file)
      if (existsSync(join(root, path))) for (const file of walk(root, path)) paths.add(file)
    } else for (const file of walk(root, path)) paths.add(file)
  }
  if ([...paths].filter(path => path.endsWith('/SKILL.md')).join() !== skillPath) throw new Error('Keep exactly one canonical shipped skill')
  const hashes = Object.fromEntries([...paths].sort().map(path => [path, hash(files[path] ?? readFileSync(safePath(root, path)))]))
  files['distribution-lock.json'] = json({ format: 1, version: pkg.version, files: hashes })
  return files
}

export function checkDistribution(root = ROOT) {
  for (const [path, expected] of Object.entries(expectedDistribution(root))) {
    if (!existsSync(safePath(root, path)) || readFileSync(join(root, path), 'utf8') !== expected) throw new Error(`Stale distribution: ${path}; run npm run distribution:generate`)
  }
}
export function writeDistribution(root = ROOT) {
  for (const [path, content] of Object.entries(expectedDistribution(root))) {
    const full = safePath(root, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
}
export function checkRelease(base, root = ROOT) {
  if (!/^[0-9a-f]{40}$/.test(base)) throw new Error('Release base must be a full commit SHA')
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git('cat-file', '-e', `${base}^{commit}`)
  const previous = JSON.parse(git('show', `${base}:package.json`))
  let oldLock
  try { oldLock = git('show', `${base}:distribution-lock.json`) } catch { /* First distribution release. */ }
  const next = JSON.parse(readFileSync(join(root, 'distribution-lock.json'), 'utf8'))
  if (oldLock !== json(next) && !newerVersion(next.version, previous.version)) throw new Error(`Shipped content changed without a version increase: ${previous.version} -> ${next.version}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length === 1 && args[0] === '--write') writeDistribution()
    else if (args[0] === '--check' && (args.length === 1 || (args.length === 3 && args[1] === '--base'))) {
      checkDistribution()
      if (args[2]) checkRelease(args[2])
    } else throw new Error('Usage: distribution.mjs --write | --check [--base FULL_COMMIT_SHA]')
    console.error('Distribution verified. No host installations or update settings changed.')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
