import { it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadUnits, unitSourceContents } from '../src/unit-source.js'
import { readRepository, loadRepositoryUnits } from '../src/unit-checkout.js'
import type { UnitSnapshot } from '../src/unit-model.js'
const fixture = (): UnitSnapshot => ({schemaVersion:5,product:{id:'product',title:'Product'},units:[{id:'one',title:'One',labels:[],expectedAssignee:null,definition:{objective:'Do it',included:[],behavior:['Behave'],exclusions:[],scope:'bounded',decision:'approved',criteria:[{id:'c',text:'Behavior'}],ownObligations:[],ownRationale:'Grouping',checks:null,checkRationale:null,constraints:[]},implementation:{state:'unknown',definitionDigest:null,inputDigest:null,coverage:[],gaps:[]},documents:[]}],decisions:[],containment:[],dependencies:[],inputPolicy:{nonRuntimePaths:[],rationale:'All inputs', scope: 'repository', sharedPaths: []}})
async function prepare() { const root=await mkdtemp(join(tmpdir(),'suo-unit-source-')); for(const [path,content] of unitSourceContents(fixture())) {await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),content)} return root }
it('strict typed source roundtrips and rejects executable declarations',async()=>{
 const root=await prepare();try {expect(await loadUnits(root)).toEqual(fixture());const path=join(root,'suo/product.suo.ts');await writeFile(path,(await readFile(path,'utf8')).replace('title":"Product"','title":String("Product")'));await expect(loadUnits(root)).rejects.toThrow(/executable/)} finally {await rm(root,{recursive:true,force:true})}
})
it('reads committed Git bytes independently from dirty worktree and index',async()=>{
 const root=await prepare();const git=(...args:string[])=>execFileSync('git',['-C',root,...args],{env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'},encoding:'utf8'});try {
 git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');await writeFile(join(root,'code.ts'),'export const original = true\n');git('add','.');git('commit','-m','Fixture');
 const committed=await readRepository(root);expect(await loadRepositoryUnits(committed)).toEqual(fixture());await writeFile(join(root,'code.ts'),'export const changed = true\n');await writeFile(join(root,'new.ts'),'new input');
 const dirty=await readRepository(root,'working-tree'), index=await readRepository(root,'index');expect(dirty.token).not.toBe(committed.token);expect(index.token).toBe(committed.token);expect((await readRepository(root)).token).toBe(committed.token);expect(dirty.context.target).toBe('working-tree')
 } finally {await rm(root,{recursive:true,force:true})}
})
it('atomically saves a reviewed candidate and rejects stale code observations',async()=>{
 const root=await prepare();const git=(...args:string[])=>execFileSync('git',['-C',root,...args],{env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'},encoding:'utf8'});try {
 git('init','-b','main');await writeFile(join(root,'.gitignore'),'.suo/\n');await writeFile(join(root,'app.ts'),'export const app = 1');git('add','.');
 const {saveUnits}=await import('../src/unit-store.js'),repo=await readRepository(root,'working-tree'),candidate=fixture();candidate.units[0]!.title='Reviewed title';await saveUnits(root,candidate,repo.token);expect((await loadUnits(root)).units[0]!.title).toBe('Reviewed title');
 const before=await readFile(join(root,'suo/product.suo.ts'),'utf8');await writeFile(join(root,'app.ts'),'changed code');await expect(saveUnits(root,fixture(),repo.token)).rejects.toThrow(/stale/);expect(await readFile(join(root,'suo/product.suo.ts'),'utf8')).toBe(before)
 }finally{await rm(root,{recursive:true,force:true})}
})
it('rejects constructed snapshot traversal before materializing any file',async()=>{
 const bytes=Buffer.from('invalid'),{createHash}=await import('node:crypto'),{digest}=await import('../src/unit-identity.js');const entries=[{path:'suo/../../unit-review-marker',mode:'100644' as const,digest:createHash('sha256').update(bytes).digest('hex'),symbols:null}];
 await expect(loadRepositoryUnits({context:{target:'working-tree',identity:'0'.repeat(64),entries,unavailable:[]},contents:new Map([[entries[0]!.path,bytes]]),token:digest(entries.map(({symbols,...rest})=>rest))})).rejects.toThrow(/path/)
})
it('blocks unfinished working-tree transactions but leaves immutable snapshots readable',async()=>{
 const root=await prepare();const git=(...args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8'});try {
 git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');git('add','.');git('commit','-m','Fixture');await mkdir(join(root,'.suo'));await writeFile(join(root,'.suo/unit-write.json'),'{}');
 await expect(loadUnits(root)).rejects.toThrow(/pending Unit transaction/);await expect(readRepository(root,'working-tree')).rejects.toThrow(/pending Unit transaction/);expect(await loadRepositoryUnits(await readRepository(root))).toEqual(fixture());expect(await loadRepositoryUnits(await readRepository(root,'index'))).toEqual(fixture())
 }finally{await rm(root,{recursive:true,force:true})}
})
it('leaves a corrupt transaction backup untouched on failed recovery',async()=>{
 const root=await prepare();try {const {rename,lstat}=await import('node:fs/promises'),{recoverUnits}=await import('../src/unit-store.js');const stage='.suo/unit-stage-00000000-0000-0000-0000-000000000000';await mkdir(join(root,stage),{recursive:true});await rename(join(root,'suo'),join(root,stage,'before'));await writeFile(join(root,'.suo/unit-write.json'),JSON.stringify({stage,before:'1'.repeat(64),after:'2'.repeat(64)}));await expect(recoverUnits(root)).rejects.toThrow(/backup recovery identity mismatch/);await expect(lstat(join(root,'suo'))).rejects.toMatchObject({code:'ENOENT'});expect((await lstat(join(root,stage,'before'))).isDirectory()).toBe(true)
 }finally{await rm(root,{recursive:true,force:true})}
})
it('rejects working-tree paths through symlink ancestors without reading external bytes',async()=>{
 const root=await prepare(),outside=await mkdtemp(join(tmpdir(),'suo-outside-'));try {const {symlink}=await import('node:fs/promises');execFileSync('git',['-C',root,'init']);await mkdir(join(root,'src'));await writeFile(join(root,'src/app.ts'),'inside');execFileSync('git',['-C',root,'add','.']);await rm(join(root,'src'),{recursive:true});await writeFile(join(outside,'app.ts'),'outside');await symlink(outside,join(root,'src'));await expect(readRepository(root,'working-tree')).rejects.toThrow(/symlink/)
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true})}
})
it('refuses to overwrite ignored authority absent from the observed candidate',async()=>{
 const root=await prepare();try{execFileSync('git',['-C',root,'init']);await writeFile(join(root,'.gitignore'),'suo/\n.suo/\n');const observed=await readRepository(root,'working-tree'),path=join(root,'suo/product.suo.ts'),before=await readFile(path,'utf8');await writeFile(path,before.replace('Product','Concurrent'));const {saveUnits}=await import('../src/unit-store.js');await expect(saveUnits(root,fixture(),observed.token)).rejects.toThrow(/unobserved/);expect(await readFile(path,'utf8')).toContain('Concurrent')
 }finally{await rm(root,{recursive:true,force:true})}
})
it('does not expose cached module objects to mutation by API callers',async()=>{
 const root=await prepare();try{const loaded=await loadUnits(root);loaded.product.title='Unsaved mutation';loaded.units[0]!.title='Unsaved Unit';expect(await loadUnits(root)).toEqual(fixture())}finally{await rm(root,{recursive:true,force:true})}
})
it('detaches mutation inputs before asynchronous staging',async()=>{
 const root=await prepare();try{execFileSync('git',['-C',root,'init']);await writeFile(join(root,'.gitignore'),'.suo/\n');const repo=await readRepository(root,'working-tree'),candidate=fixture();candidate.units[0]!.title='Reviewed';const {saveUnits}=await import('../src/unit-store.js');const pending=saveUnits(root,candidate,repo.token);candidate.units[0]!.title='Unreviewed mutation';await pending;expect((await loadUnits(root)).units[0]!.title).toBe('Reviewed')}finally{await rm(root,{recursive:true,force:true})}
})
it('detaches repository bytes before awaiting temporary materialization',async()=>{
 const root=await prepare();try{execFileSync('git',['-C',root,'init']);const repo=await readRepository(root,'working-tree');const pending=loadRepositoryUnits(repo);repo.contents.set('suo/../../outside-unit-snapshot',Buffer.from('unvalidated'));await expect(pending).rejects.toThrow(/path|unlisted/)}finally{await rm(root,{recursive:true,force:true})}
})
it('initialization cannot bypass an interrupted authority transaction',async()=>{
 const root=await mkdtemp(join(tmpdir(),'suo-pending-template-'));try{await mkdir(join(root,'.suo'));await writeFile(join(root,'.suo/unit-write.json'),'{}');const {createUnitTemplate}=await import('../src/unit-store.js');await expect(createUnitTemplate(root,fixture())).rejects.toThrow(/pending Unit transaction/);const {lstat}=await import('node:fs/promises');await expect(lstat(join(root,'suo'))).rejects.toMatchObject({code:'ENOENT'})}finally{await rm(root,{recursive:true,force:true})}
})
