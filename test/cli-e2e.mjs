import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
const root=await mkdtemp(join(tmpdir(),'suo-unit-cli-')),cli=process.env.SUO_TEST_CLI??resolve('dist/cli.js')
const run=(...args)=>execFileSync(process.execPath,[cli,...args,'--root',root],{encoding:'utf8'})
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'})
try {
 run('template',root,'--title','Roundtrip');git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');await writeFile(join(root,'.gitignore'),'.suo/\n');await writeFile(join(root,'app.ts'),'export const app = true\n');git('add','.');git('commit','-m','Initial')
 const initial=JSON.parse(run('export','--target','working-tree'));const unit={id:'bounded',title:'Bounded',labels:[],expectedAssignee:null,definition:{objective:'Show behavior',included:[],behavior:['App is present'],exclusions:[],scope:'bounded',decision:'approved',criteria:[{id:'app',text:'App mapping'}],ownObligations:[],ownRationale:'No extra integration',checks:null,checkRationale:null,constraints:[]},implementation:{state:'unknown',definitionDigest:null,inputDigest:null,coverage:[],gaps:[]},documents:[]};initial.snapshot.units.push(unit)
 // Mutation inputs live outside the observed repository; writing them must not silently alter the candidate token.
 const envelope=join(root,'..',`${root.split('/').at(-1)}-request.json`)
 try {
 await writeFile(envelope,JSON.stringify({expectedToken:initial.expectedToken,snapshot:initial.snapshot}));run('apply',envelope,'--yes');let current=JSON.parse(run('inspect','--target','working-tree'));assert.equal(current.units[0].declaredState,'unknown');assert.equal(JSON.parse(run('inspect')).units.length,0)
 await writeFile(envelope,JSON.stringify({expectedToken:current.expectedToken,unitId:'bounded',state:'implemented',coverage:[{criterionId:'app',path:'app.ts',symbol:'app',kind:'source'}],gaps:[]}));run('record',envelope,'--yes');current=JSON.parse(run('inspect','--target','working-tree'));assert.equal(current.units[0].implemented,true);assert.ok(current.units[0].verificationBlockers.includes('required check policy unresolved'));assert.ok(current.units[0].acceptanceBlockers.length)
 const before=await readFile(join(root,'suo/product.suo.ts'),'utf8');await writeFile(join(root,'app.ts'),'export const app = false\n');assert.throws(()=>run('record',envelope,'--yes'));assert.equal(await readFile(join(root,'suo/product.suo.ts'),'utf8'),before);assert.equal(JSON.parse(run('inspect','--target','working-tree')).units[0].applicability,'stale')
 git('add','.');git('commit','-m','Unit and code');assert.equal(JSON.parse(run('check')).units[0].applicability,'stale')
 const explained=JSON.parse(run('explain','bounded'));assert.equal(explained.bindingCommit,git('rev-parse','HEAD').trim());assert.deepEqual(explained.inputs,{changed:true,base:{commit:git('rev-parse','HEAD^').trim(),exact:true},policyChanged:false,changes:[{path:'app.ts',change:'modified'}]})
 assert.equal(JSON.parse(run('writer','check','--skill',resolve(cli,'../../skills/suo'))).skill.matches,true)
 }finally{await rm(envelope,{force:true})}
 console.log('Unit CLI E2E passed: isolated commit/worktree, typed roundtrip, coverage binding, null policy, atomic stale rejection, stale explanation and Skill parity')
}finally{await rm(root,{recursive:true,force:true})}
