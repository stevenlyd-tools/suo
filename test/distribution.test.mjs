import { afterEach, describe, expect, it } from 'vitest'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { ROOT, checkDistribution, checkRelease, newerVersion, packageFiles, writeDistribution } from '../scripts/distribution.mjs'

const roots = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const read = (root, path) => readFileSync(join(root, path), 'utf8')
const object = (root, path) => JSON.parse(read(root, path))
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'suo-distribution-')); roots.push(root)
  for (const path of ['package.json', ...packageFiles]) cpSync(join(ROOT, path), join(root, path), { recursive: true })
  return root
}
function changePackage(root, update) {
  const pkg = object(root, 'package.json'); update(pkg)
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
}

describe('native distribution', () => {
  it('validates portable schema and resolves every native channel to one skill', () => {
    checkDistribution()
    const pkg = object(ROOT, 'package.json')
    const plugin = object(ROOT, 'plugin.json')
    const validate = new Ajv2020({ strict: true }).compile(object(ROOT, 'schemas/vendor/agent-plugin-1.0.0.schema.json'))
    expect(validate(plugin), JSON.stringify(validate.errors)).toBe(true)
    const skill = parse(read(ROOT, 'skills/suo/SKILL.md').split('---\n')[1])
    expect(skill.name).toBe('suo'); expect(skill.version).toBe(pkg.version)
    expect(read(ROOT, 'skills/suo/SKILL.md')).toContain('suo --version')
    expect(object(ROOT, '.claude-plugin/plugin.json')).toMatchObject({ name: 'suo', version: pkg.version, skills: './skills/' })
    // Host catalogs live in stevenlyd-tools/plugins; the package ships none of its own.
    for (const path of ['.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json']) expect(existsSync(join(ROOT, path)), path).toBe(false)
    expect(plugin.repository).toBe('https://github.com/stevenlyd-tools/suo')
    expect(object(ROOT, 'gemini-extension.json')).toEqual({ name: 'suo', version: pkg.version, description: pkg.description })
    expect(pkg.pi).toEqual({ skills: ['./skills'] })
    expect(pkg.bin.suo).toBe('./dist/cli.js')
  })

  it('detects skill, compiled runtime, dependency and manifest drift without writing files', () => {
    for (const path of ['skills/suo/SKILL.md', 'dist/cli.js', 'plugin.json']) {
      const root = fixture()
      const changed = read(root, path) + '\nchanged\n'; writeFileSync(join(root, path), changed)
      expect(() => checkDistribution(root)).toThrow('Stale distribution')
      expect(read(root, path)).toBe(changed)
    }
    const root = fixture(); changePackage(root, pkg => { pkg.dependencies.yaml = '2.8.0' })
    expect(() => checkDistribution(root)).toThrow('Stale distribution')
  })

  it('synchronizes versions deterministically and rejects malformed versions', () => {
    const root = fixture(); changePackage(root, pkg => { pkg.version = nextVersion(pkg.version) })
    expect(() => checkDistribution(root)).toThrow()
    writeDistribution(root); checkDistribution(root)
    const before = read(root, 'distribution-lock.json'); writeDistribution(root)
    expect(read(root, 'distribution-lock.json')).toBe(before)
    expect(read(root, 'skills/suo/SKILL.md')).toContain(`version: ${JSON.parse(read(root, 'package.json')).version}\n`)
    changePackage(root, pkg => { pkg.version = '01.2.3' })
    expect(() => writeDistribution(root)).toThrow('stable MAJOR.MINOR.PATCH')
  })

  it('rejects missing payload, duplicate skills, unsafe paths and extra executable surfaces', () => {
    const missing = fixture(); rmSync(join(missing, 'dist/cli.js'))
    expect(() => checkDistribution(missing)).toThrow()
    const duplicate = fixture(); mkdirSync(join(duplicate, 'skills/copy'))
    writeFileSync(join(duplicate, 'skills/copy/SKILL.md'), read(duplicate, 'skills/suo/SKILL.md'))
    expect(() => checkDistribution(duplicate)).toThrow('one canonical')
    const linked = fixture(); rmSync(join(linked, 'plugin.json'))
    symlinkSync(join(linked, 'does-not-exist'), join(linked, 'plugin.json'))
    expect(() => writeDistribution(linked)).toThrow('symlink')
    const executable = fixture(); mkdirSync(join(executable, 'hooks'))
    expect(() => checkDistribution(executable)).toThrow('execution/configuration')
    const layout = fixture(); changePackage(layout, pkg => { pkg.files.push('../outside') })
    expect(() => checkDistribution(layout)).toThrow('layout')
  })

  it('requires a version increase for changed release payload, including after regenerating hashes', () => {
    const root = fixture()
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    git('init'); git('add', '.')
    git('-c', 'user.name=Suo Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture')
    const base = git('rev-parse', 'HEAD').trim()
    checkRelease(base, root)
    writeFileSync(join(root, 'skills/suo/SKILL.md'), read(root, 'skills/suo/SKILL.md') + '\nReviewed change.\n')
    writeDistribution(root)
    expect(() => checkRelease(base, root)).toThrow('version increase')
    changePackage(root, pkg => { pkg.version = nextVersion(pkg.version) }); writeDistribution(root)
    expect(() => checkRelease(base, root)).not.toThrow()
    expect(() => checkRelease('main', root)).toThrow('full commit SHA')
    expect(newerVersion('0.4.0', '0.3.1')).toBe(true)
    expect(newerVersion('0.4.0', '0.4.0')).toBe(false)
  })
})

function nextVersion(version) { const [major, minor, patch] = version.split('.'); return `${major}.${minor}.${Number(patch) + 1}` }
