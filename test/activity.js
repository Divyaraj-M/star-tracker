const run=require('./harness');const path=require('path');const out=(n)=>path.join(__dirname,n);
run(async(pg)=>{
 await pg.evaluate(()=>window.ready);
 const res=await pg.evaluate(async()=>{
  const {TFile}=window.OBS; const L=window.LISTENERS; const log=PLUGIN.activity;
  PLUGIN.settings.activity.captureFolders=[{folder:'Raindrop',label:'Raindrop'},{folder:'Transcripts',label:'MacWhisper'}];
  const fire=async(e,...a)=>{for(const cb of L[e]||[])await cb(...a)};
  const mk=(p,c)=>{const f=new TFile(p);FILES[p]=f;CONTENT[p]=c;FMS[p]=FMS[p]||{};return f};
  const shift=(ev,days,h,m)=>{const d=new Date();d.setDate(d.getDate()-days);d.setHours(h,m,0,0);const map=log.own.get(Object.keys(Object.fromEntries(log.own))[0]);ev.t=d.getTime();if(ev.e)ev.e=ev.t+20*60000;};
  const last=()=>{const all=log.events(0,Infinity);return all[all.length-1]};
  // capture
  const r=mk('Raindrop/How to take smart notes.md','---\nurl: x\n---\n> The Zettelkasten is not a notebook, it is a thinking partner.\nKeep each note small enough to link.');
  await fire('create',r); shift(last(),0,9,12);
  // checkbox done
  const daily=mk('Daily/2026-10-08.md','# Today\n- [ ] Call the design team about onboarding\n- [ ] Write release notes\n- [ ] Draft Q4 OKRs');
  await log.onOpen(daily);
  CONTENT[daily.path]='# Today\n- [x] Call the design team about onboarding ✅ 2026-10-08\n- [ ] Write release notes\n- [-] Draft Q4 OKRs';
  await fire('modify',daily);
  const evs=log.events(0,Infinity); evs.slice(-3).forEach((e,i)=>shift(e,0,8,40-i*5));
  // status change: T-106 to Won't do with reason
  const t106=FILES['T-106 Invoice PDF export.md']; FMS[t106.path].reason='Finance moved to the new billing provider';
  FMS[t106.path].status="Won't do"; for(const cb of L['mc-changed'])cb(t106); shift(last(),1,17,5);
  // transcript capture
  const tr=mk('Transcripts/Standup 7 Oct.md','Sam: push notifications are in UAT. Jordan: onboarding copy review Thursday.');
  await fire('create',tr); shift(last(),1,14,20);
  // note edit with diff
  const w=mk('Wiki/Pricing tiers.md','# Pricing\nStarter is free.\nPro costs $12.\nTeam costs $30.');
  await log.onOpen(w); CONTENT[w.path]='# Pricing\nStarter is free for 3 users.\nPro costs $15 per seat.\nTeam costs $30.'; await fire('modify',w); shift(last(),1,11,2);
  // T-101 status move + edit
  const t101=FILES['T-101 Push notifications.md']; FMS[t101.path].status='UAT'; for(const cb of L['mc-changed'])cb(t101); shift(last(),0,16,30);
  CONTENT[t101.path]='Ship push for iOS first.'; await log.onOpen(t101); CONTENT[t101.path]='Ship push for iOS first.\nAndroid needs FCM key from Sam.'; await fire('modify',t101); shift(last(),2,15,10);
  // rename
  const old='Wiki/Pricing tiers.md'; const nf=mk('Wiki/Pricing.md',CONTENT[old]); delete FILES[old]; await fire('rename',nf,old); shift(last(),2,10,0);
  // background noise for heatmap
  for(let d=3;d<68;d++){const n=Math.floor(Math.abs(Math.sin(d*1.7))*7);for(let i=0;i<n;i++){const f=mk(`Notes/n${d}-${i}.md`,'Some text '+d);await fire('create',f);shift(last(),d,9+i,0);}}
  await log.flush();
  return {events:log.events(0,Infinity).length, files:Object.keys(ADAPTER), sampleLine:Object.values(ADAPTER)[0].split('\n')[0]};
 });
 console.log(JSON.stringify(res,null,1));
 // pane view
 await pg.setViewportSize({width:1300,height:1500});
 await pg.evaluate(async()=>{const host=document.getElementById('host');host.innerHTML='';host.style.height='1500px';const leaf={};const v=PLUGIN.paneTypes['star-activity-pane'](leaf);v.app=APP;await v.onOpen();host.appendChild(v.contentEl);v.contentEl.style.height='100%';window.PANE=v;await new Promise(r=>setTimeout(r,300));});
 await pg.screenshot({path:out('activity.png')});
 const txt=await pg.$$eval('.sta-kind',e=>e.map(x=>x.textContent));console.log('kinds',txt.join(' | '));
 console.log('bars',await pg.$$eval('.sta-bar-top',e=>e.map(x=>x.textContent).join(', ')));
 // tasks chip, month mode
 await pg.evaluate(async()=>{const t=PANE.timeline;t.mode='month';t.chip='tasks';t.render();});
 console.log('tasks in month',await pg.$$eval('.sta-row',e=>e.length));
 // per-task modal
 await pg.setViewportSize({width:800,height:900});
 await pg.evaluate(async()=>{const host=document.getElementById('host');host.innerHTML='';const {TaskActivity}=window;const f=FILES['T-101 Push notifications.md'];
   PLUGIN.cmds.find(c=>c.id==='task-activity');
   APP.workspace.getActiveFile=()=>f; PLUGIN.cmds.find(c=>c.id==='task-activity').checkCallback(false);
   const m=LAST_MODAL; host.appendChild(m.modalEl); m.modalEl.style.padding='20px'; await new Promise(r=>setTimeout(r,200));});
 await pg.screenshot({path:out('task-activity.png'),clip:{x:0,y:0,width:800,height:400}});
 console.log('task rows',await pg.$$eval('.sta-task .sta-kind',e=>e.map(x=>x.textContent).join(' | ')));
 // settings render
 console.log('settings rows',await pg.evaluate(()=>{PLUGIN.tab.display();return PLUGIN.tab.containerEl.querySelectorAll('.setting-item').length}));
 // reload from disk: new log instance parses files
 console.log('reparsed',await pg.evaluate(async()=>{const L2=new PLUGIN.activity.constructor(PLUGIN);await L2.loadMonths(Object.keys(Object.fromEntries(PLUGIN.activity.own)));return L2.events(0,Infinity).length}));
});
