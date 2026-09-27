(function(){
const {TFile}=window.OBS;
const d=(n)=>{const x=new Date(Date.now()+n*864e5);return x.toISOString().slice(0,10)};
window.SAVED={taskTag:'task',internalSources:['alex']};
const fms={
 'E-001 Mobile app launch.md':{tags:['task'],task_id:'E-001',type:'Epic',status:'Product in progress',start:d(-30),end:d(10),owner:'alex'},
 'E-002 Billing revamp.md':{tags:['task'],task_id:'E-002',type:'Epic',status:'Design in progress',start:d(-5),end:d(40),owner:'alex'},
 'T-101 Push notifications.md':{sprint:'[[Sprint 2]]',points:5,tags:['task'],task_id:'T-101',type:'Story',status:'Dev in progress',priority:'High',parent:'[[E-001 Mobile app launch]]',start:d(-10),end:d(3),owner:'alex',dev_owner:'sam',deals:['[[Globex]]'],opened:d(-12),status_log:[`${d(-3)} | Handover to dev → Dev in progress`]},
 'T-102 Onboarding flow.md':{tags:['task'],task_id:'T-102',type:'Story',status:'Handover to design',priority:'Urgent',parent:'[[E-001 Mobile app launch]]',owner:'alex',design_owner:'jordan',opened:d(-2),bucket:'next-week',status_log:[`${d(-1)} | Product in progress → Handover to design`]},
 'T-103 Welcome screen copy.md':{tags:['task'],task_id:'T-103',type:'Sub-task',status:'Backlog',priority:'Low',parent:'[[T-102 Onboarding flow]]',owner:'alex',opened:d(-1),source:'support'},
 'T-104 Login button misaligned.md':{sprint:'[[Sprint 2]]',points:3,tags:['task'],task_id:'T-104',type:'Bug',status:'Shipped',priority:'Medium',owner:'taylor',closed:d(-1),opened:d(-20),status_log:[`${d(-4)} | In testing → Shipped`]},
 'T-105 Offline mode.md':{points:3,tags:['task'],task_id:'T-105',type:'Feature',status:'Blocked by me',priority:'High',blocked_by:['[[T-101 Push notifications]]'],owner:'alex',area:'Integrations',opened:d(-8)},
 'T-106 Invoice PDF export.md':{sprint:'[[Sprint 2]]',points:8,tags:['task'],task_id:'T-106',type:'Feature',status:'UAT',priority:null,parent:'[[E-002 Billing revamp]]',owner:'alex',dev_owner:'casey',area:'Views',due:d(-2),deals:['[[Globex]]','[[Initech]]']},
 'T-107 Tax settings page.md':{sprint:'[[Sprint 2]]',points:2,status_log:[`${d(-4)} | Design in progress → Design review`],tags:['task'],task_id:'T-107',type:'Task',status:'Design review',priority:'Medium',owner:'alex',design_owner:'jordan',parent:'[[E-002 Billing revamp]]'},
 'T-108 Search returns no results.md':{sprint:'[[Sprint 1]]',tags:['task'],task_id:'T-108',type:'Bug',status:'Backlog',owner:'alex',opened:d(-3),bucket:'channel'},
 'Meeting notes.md':{tags:['meeting']},
 'Sprints/Sprint 1.md':{tags:['sprint'],state:'closed',start:d(-20),end:d(-7),capacity:20,committed_points:18,completed_points:13,committed_tasks:6,completed_tasks:4,completed_on:d(-7)},
 'Sprints/Sprint 2.md':{tags:['sprint'],state:'active',start:d(-6),end:d(7),capacity:20,goal:'Ship push notifications and invoice export',committed_points:16,committed_tasks:4},
 'Sprints/Sprint 3.md':{tags:['sprint'],state:'planned',start:d(8),end:d(21),capacity:20},
 'T-109 Crash on startup.md':{tags:['task'],task_id:'T-109',type:'Task',status:'Shipped',points:5,sprint:'[[Sprint 1]]',closed:d(-9)},
};
const files={};for(const p in fms)files[p]=new TFile(p);
const BASES={'Work/Work.base':'views:\n  - type: star-dashboard\n    name: Dashboard\n  - type: star-board\n    name: Global board\n','Home/Home tracker.base':'views:\n  - type: star-board\n    name: "Chores board"\n','Other/plain.base':'views:\n  - type: table\n    name: All\n'};
for(const p in BASES){files[p]=new TFile(p);files[p].extension='base';files[p].basename=p.split('/').pop().replace('.base','');files[p].parent={path:p.split('/')[0]};}
const byName=(n)=>{n=String(n).replace(/\.md$/,'');return Object.values(files).find(f=>f.basename===n)||null};
const listeners={};
const app={
 vault:{getAbstractFileByPath:p=>files[p]||null,getMarkdownFiles:()=>Object.values(files).filter(f=>f.extension==='md'),getFiles:()=>Object.values(files),cachedRead:async(f)=>BASES[f.path]||'',on:(e,cb)=>{(listeners[e]=listeners[e]||[]).push(cb)},create:async(p,c)=>{files[p]=new TFile(p);fms[p]={};window.VAULT_CREATE=(window.VAULT_CREATE||[]).concat([{p,c}]);return files[p]},createFolder:async()=>{}},
 metadataCache:{getFileCache:f=>fms[f.path]?{frontmatter:fms[f.path]}:null,getFirstLinkpathDest:(n)=>byName(n),on:(e,cb)=>{(listeners['mc-'+e]=listeners['mc-'+e]||[]).push(cb)}},
 workspace:{onLayoutReady:cb=>cb(),getLeaf:()=>({openFile:(f)=>{window.OPENED=f.path}}),trigger(){},openLinkText(){},on(){return {}}},renderContext:{},
 fileManager:{processFrontMatter:async(f,fn)=>{fn(fms[f.path]);f.stat.mtime=Date.now();(listeners['mc-changed']||[]).forEach(cb=>cb(f));window.refresh&&window.refresh();}},
};
window.FMS=fms;window.FILES=files;
const plugin=new window.PluginClass();plugin.app=app;
window.PLUGIN=plugin;
window.ready=plugin.onload().then(()=>{
 window.mount=(type,cfg,filter)=>{
  const host=document.getElementById('host');host.innerHTML='';
  const store=Object.assign({},cfg);
  const config={name:'v',get:k=>store[k],set:(k,v)=>{store[k]=v},getOrder:()=>store.order||[],getAsPropertyId:k=>store[k]||null,getSort:()=>[],getDisplayName:p=>p.split('.').pop()};
  const v=plugin.views[type].factory({},host);v.app=app;v.config=config;
  const O=window.OBS;
  const mkVal=(val)=>val==null?new O.NullValue():Array.isArray(val)?new O.ListValue(val):typeof val==='number'?new O.NumberValue(val):new O.StringValue(val);
  if(store.groupBy)config.groupBy=store.groupBy;
  const load=()=>{const entries=Object.values(files).filter(f=>fms[f.path]&&(fms[f.path].tags||[]).includes('task')).filter(f=>!filter||filter(fms[f.path])).map(f=>({file:f,getValue:(p)=>{const k=p.split('.').pop();const val=p==='file.name'?f.basename:fms[f.path][k];return mkVal(val)}}));
    let groups=[{key:new O.NullValue(),entries,hasKey:()=>false}];
    if(store.groupBy){const k=store.groupBy.property.replace(/^note\./,'');const m=new Map();for(const e of entries){const raw=fms[e.file.path][k];const kk=raw==null?'__null':String(raw);if(!m.has(kk))m.set(kk,{key:raw==null?new O.NullValue():new O.StringValue(raw),entries:[],hasKey:()=>raw!=null});m.get(kk).entries.push(e);}groups=[...m.values()];}
    v.data={data:entries,groupedData:groups};v.onDataUpdated();};
  window.refresh=load;load();window.VIEW=v;window.STORE=store;return v;};
});
})();
