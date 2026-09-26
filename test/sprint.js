const run=require('./harness');const path=require('path');const out=(n)=>path.join(__dirname,n);
run(async(pg)=>{
 await pg.evaluate(()=>window.ready);
 await pg.setViewportSize({width:1500,height:760});
 await pg.evaluate(()=>mount('star-sprint',{order:['file.name','note.task_id','note.priority','note.points','note.blocked_by','note.owner']}));
 await pg.waitForTimeout(200);await pg.screenshot({path:out('sprint-board.png')});
 console.log('board cards',await pg.$$eval('.st-card',e=>e.map(x=>x.dataset.path).join(' | ')));
 await pg.click('.st-tabs button:nth-child(2)');await pg.waitForTimeout(150);
 console.log('backlog',await pg.$$eval('.st-plan-pane:first-child .st-plan-name',e=>e.map(x=>x.textContent).join(' | ')));
 await pg.locator('.st-plan-pane:first-child .st-plan-row').first().dragTo(pg.locator('.st-plan-sprint'));await pg.waitForTimeout(150);
 console.log('after drag sprint of T-102:',await pg.evaluate(()=>FMS['T-102 Onboarding flow.md'].sprint));
 await pg.click('.st-plan-sprint .st-plan-row:first-child .st-plan-move');await pg.waitForTimeout(150);
 await pg.screenshot({path:out('sprint-planning.png')});
 await pg.click('.st-tabs button:nth-child(3)');await pg.waitForTimeout(150);
 await pg.setViewportSize({width:1300,height:1500});await pg.evaluate(()=>document.getElementById('host').style.height='1500px');
 await pg.evaluate(()=>VIEW.render());await pg.waitForTimeout(150);
 await pg.screenshot({path:out('sprint-report.png')});
 console.log('kpis',await pg.$$eval('.std-kpi',e=>e.map(x=>x.querySelector('.std-kpi-label').textContent+'='+x.querySelector('.std-kpi-value').textContent).join(', ')));
 // complete active sprint -> move unfinished to Sprint 3
 await pg.evaluate(async()=>{document.querySelectorAll('.st-sprint-actions button').forEach(b=>{if(b.textContent==='Complete sprint')b.click()});await new Promise(r=>setTimeout(r,50));
   const m=LAST_MODAL;await m.complete(...(()=>{const t=m.plugin.model;return [null,null,null]})().slice(0,0));}).catch(e=>console.log('direct complete skipped',e.message));
 const res=await pg.evaluate(async()=>{const m=LAST_MODAL;const {sprintTasks}={};return m&&m.target});
 console.log('modal target',res);
 await pg.evaluate(async()=>{const m=LAST_MODAL;m.contentEl.innerHTML='';m.onOpen();});
 await pg.evaluate(async()=>{const m=LAST_MODAL;const files=Object.values(FILES);const model=PLUGIN.model;const sp=model.sprints().find(s=>s.state==='active');
   const tasks=files.filter(f=>model.sprintPathOf(FMS[f.path]||{},f.path)===sp.file.path).map(f=>{const fm=FMS[f.path];const st=fm.status;return {file:f,fm,status:st,points:model.pointsOf(fm),done:model.isDone(st),doneOn:model.doneDate(fm)}});
   await m.complete(tasks,tasks.filter(t=>t.done),tasks.filter(t=>!t.done));});
 console.log('sprint2',JSON.stringify(await pg.evaluate(()=>FMS['Sprints/Sprint 2.md'])));
 console.log('T-101 sprint now',await pg.evaluate(()=>FMS['T-101 Push notifications.md'].sprint));
 // start sprint 3
 await pg.evaluate(async()=>{const model=PLUGIN.model;VIEW.selected='Sprints/Sprint 3.md';VIEW.render();});
 await pg.evaluate(async()=>{document.querySelectorAll('.st-sprint-actions button').forEach(b=>{if(b.textContent==='Start sprint')b.click()});await new Promise(r=>setTimeout(r,80));});
 console.log('sprint3',JSON.stringify(await pg.evaluate(()=>FMS['Sprints/Sprint 3.md'])));
 // new sprint
 await pg.evaluate(async()=>{document.querySelectorAll('.st-sprint-actions button').forEach(b=>{if(b.textContent==='+ Sprint')b.click()});await new Promise(r=>setTimeout(r,80));});
 console.log('created',JSON.stringify(await pg.evaluate(()=>(window.VAULT_CREATE||[]).map(x=>x.p))), JSON.stringify(await pg.evaluate(()=>FMS['Sprints/Sprint 4.md'])));
 await pg.evaluate(()=>{document.getElementById('host').style.height='auto';mount('star-dashboard',{})});await pg.waitForTimeout(200);
 await pg.screenshot({path:out('dash-sprint.png'),clip:{x:0,y:0,width:1300,height:800}});
});
