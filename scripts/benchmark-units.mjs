import { performance } from 'node:perf_hooks'
import { inspectUnits } from '../dist/unit-core.js'
const count=Number(process.argv[2]??10000)
if(!Number.isSafeInteger(count)||count<4||count>100000)throw new Error('count must be 4..100000')
const make=(id)=>({id,title:id,labels:[],expectedAssignee:null,definition:{objective:'Benchmark',included:[],behavior:['Behavior'],exclusions:[],scope:'bounded',decision:'approved',criteria:[{id:'criterion',text:'Criterion'}],ownObligations:[],ownRationale:'No extra obligations',checks:null,checkRationale:null,constraints:[]},implementation:{state:'unknown',definitionDigest:null,inputDigest:null,coverage:[],gaps:[]},documents:[]})
for(const shape of ['deep','wide','diamonds']){
 const s={schemaVersion:5,product:{id:'benchmark',title:'Benchmark'},units:Array.from({length:count},(_,i)=>make(String(i))),decisions:[],containment:[],dependencies:[],inputPolicy:{nonRuntimePaths:[],rationale:'All inputs', scope: 'repository', sharedPaths: []}}
 for(let i=1;i<count;i++)if(shape!=='diamonds')s.containment.push({parent:String(shape==='deep'?i-1:0),child:String(i)});else{ s.dependencies.push({consumer:String(i),prerequisite:String(Math.max(0,i-2)),require:'contract',at:'start'});if(i>1)s.dependencies.push({consumer:String(i),prerequisite:String(i-1),require:'contract',at:'start'}) }
 const start=performance.now();const result=inspectUnits(s,{target:'commit',identity:'a'.repeat(40),entries:[],unavailable:[]});console.log(JSON.stringify({shape,units:count,edges:s.containment.length+s.dependencies.length,ms:Math.round(performance.now()-start),rssMiB:Math.round(process.memoryUsage().rss/1048576),projected:result.units.length}))
}
