import { it, expect } from 'vitest'
import { mkdtemp, readFile, writeFile, mkdir, rm, symlink, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { checkSkill, checkWriter, currentWriter, requireCompatibleWriter, compareWriterVersions, recordWriter, writerContents } from '../src/writer.js'
import { createUnitTemplate, saveUnits } from '../src/unit-store.js'
import { readRepository, loadRepositoryUnits } from '../src/unit-checkout.js'
import type { UnitSnapshot } from '../src/unit-model.js'
const snapshot = (): UnitSnapshot => ({ schemaVersion:5,product:{id:'p',title:'Test'},units:[],decisions:[],containment:[],dependencies:[],inputPolicy:{nonRuntimePaths:[],rationale:'All inputs'} })
async function fixture() { const root = await mkdtemp(join(tmpdir(),'suo-writer-')); execFileSync('git',['-C',root,'init'],{stdio:'pipe'}); await writeFile(join(root,'.gitignore'),'.suo/\n'); return root }
it('compares recorded versions without a latest policy and rejects same-version drift',async()=>{
 const current=await currentWriter();expect(compareWriterVersions('0.10.0','0.9.0')).toBe(1)
 expect(()=>compareWriterVersions('1.0.0-beta','1.0.0')).toThrow()
 expect(requireCompatibleWriter(current,null)).toBe('unrecorded')
 expect(requireCompatibleWriter(current,{...current,version:'0.0.1'})).toBe('newer')
 expect(()=>requireCompatibleWriter(current,{...current,version:'99.0.0'})).toThrow(/upgrade/)
 expect(()=>requireCompatibleWriter(current,{...current,skillDigest:'a'.repeat(64)})).toThrow(/identity differs/)
})
it('template and reviewed save atomically include own writer; stale/invalid attempts preserve it',async()=>{
 const root=await fixture();try{
  await createUnitTemplate(root,snapshot());expect((await checkWriter(root)).compatibility).toBe('same')
  const original=await readFile(join(root,'suo/writer.json'),'utf8');const repo=await readRepository(root,'working-tree')
  const changed=snapshot();changed.product.title='Updated';await saveUnits(root,changed,repo.token)
  expect((await loadRepositoryUnits(await readRepository(root,'working-tree'))).product.title).toBe('Updated')
  await expect(saveUnits(root,snapshot(),repo.token)).rejects.toThrow(/stale/)
  expect(await readFile(join(root,'suo/writer.json'),'utf8')).toBe(original)
  await recordWriter(root);expect(await readFile(join(root,'suo/writer.json'),'utf8')).toBe(original)
 }finally{await rm(root,{recursive:true,force:true})}
})
it('a future writer blocks replacement and malformed/symlink metadata is never overwritten',async()=>{
 const root=await fixture(),outside=await fixture();try{
  await createUnitTemplate(root,snapshot());const path=join(root,'suo/writer.json'),future=writerContents({...await currentWriter(),version:'99.0.0'})
  await writeFile(path,future);const repo=await readRepository(root,'working-tree')
  await expect(saveUnits(root,snapshot(),repo.token)).rejects.toThrow(/upgrade/);expect(await readFile(path,'utf8')).toBe(future)
  await writeFile(path,'{"schemaVersion":99}');await expect(recordWriter(root)).rejects.toThrow(/unsupported/)
  await rm(path);await writeFile(join(outside,'outside.json'),'preserved');await symlink(join(outside,'outside.json'),path)
  await expect(checkWriter(root)).rejects.toThrow(/symlink/);expect(await readFile(join(outside,'outside.json'),'utf8')).toBe('preserved')
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true})}
})
it('checking unrecorded history does not create a writer or introduce another tool dependency',async()=>{
 const root=await fixture();try{expect((await checkWriter(root)).recorded).toBe(null);await expect(readFile(join(root,'suo/writer.json'))).rejects.toMatchObject({code:'ENOENT'});await mkdir(join(root,'suo'));await writeFile(join(root,'suo/product.suo.ts'),'invalid');await expect(recordWriter(root)).rejects.toThrow();await expect(readFile(join(root,'suo/writer.json'))).rejects.toMatchObject({code:'ENOENT'})}finally{await rm(root,{recursive:true,force:true})}
})
it('checks a Skill package or directory as data, including dependency-free plugin caches',async()=>{
 const plugin=await mkdtemp(join(tmpdir(),'suo-plugin-'));try{
  expect((await checkSkill('.')).matches).toBe(true);expect((await checkSkill('skills/suo')).matches).toBe(true)
  // A plugin cache: package identity and Skill, no node_modules, and a runtime that must never run.
  await cp('skills',join(plugin,'skills'),{recursive:true});await writeFile(join(plugin,'package.json'),JSON.stringify({name:'@stevenlyd/suo',version:'0.0.0'}))
  await mkdir(join(plugin,'dist'));await writeFile(join(plugin,'dist/cli.js'),`require('node:fs').writeFileSync(${JSON.stringify(join(plugin,'executed'))},'')`)
  expect(await checkSkill(plugin)).toMatchObject({matches:true,version:(await currentWriter()).version,skillDigest:(await currentWriter()).skillDigest})
  await expect(readFile(join(plugin,'executed'))).rejects.toMatchObject({code:'ENOENT'})
  await writeFile(join(plugin,'skills/suo/SKILL.md'),(await readFile(join(plugin,'skills/suo/SKILL.md'),'utf8'))+'\nLocal edit\n')
  expect((await checkSkill(plugin)).matches).toBe(false)
  const root=await fixture();try{expect((await checkWriter(root,plugin)).skill?.matches).toBe(false);expect((await checkWriter(root)).skill).toBeUndefined()}finally{await rm(root,{recursive:true,force:true})}
  await writeFile(join(plugin,'package.json'),JSON.stringify({name:'other'}));await expect(checkSkill(plugin)).rejects.toThrow(/package identity/)
  await expect(checkSkill(join(plugin,'dist'))).rejects.toMatchObject({code:'ENOENT'})
  await writeFile(join(plugin,'dist/SKILL.md'),'---\nname: other\nversion: 1.0.0\n---\n');await expect(checkSkill(join(plugin,'dist'))).rejects.toThrow(/not a Suo Skill/)
 }finally{await rm(plugin,{recursive:true,force:true})}
})
