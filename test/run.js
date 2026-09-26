const run=require('./harness');const path=require('path');const out=(n)=>path.join(__dirname,n);
run(async(pg)=>{
 await pg.evaluate(()=>window.ready);
 // Global board
 await pg.evaluate(()=>mount('star-board',{groupBy:{property:'note.status'},order:['file.name','note.task_id','note.priority','note.blocked_by','note.design_owner','note.dev_owner','note.area','note.due'],collapsedColumns:{Shipped:true}}));
 await pg.waitForTimeout(150);await pg.screenshot({path:out('board.png')});
 const cols=await pg.$$eval('.base-board-column',e=>e.map(c=>c.querySelector('.base-board-column-title').textContent+':'+c.querySelector('.base-board-column-count').textContent));console.log('columns',cols.join(' | '));
 // stage board with columns
 await pg.evaluate(()=>mount('star-board',{groupBy:{property:'note.status'},boardColumns:['Backlog','Blocked by me','Product in progress','Handover to design','UAT'],columnColors:{UAT:'#F59E0B'},order:['file.name','note.task_id','note.priority','note.blocked_by']},fm=>['Backlog','Blocked by me','Product in progress','Handover to design','UAT'].includes(fm.status)));
 await pg.waitForTimeout(150);await pg.screenshot({path:out('product-board.png')});
 // priority board
 await pg.evaluate(()=>mount('star-board',{groupBy:{property:'note.priority'},boardColumns:['Urgent','High','Medium','Low'],order:['file.name','note.status']},fm=>fm.status!=='Shipped'));
 await pg.waitForTimeout(150);console.log('priority cols',await pg.$$eval('.base-board-column-title',e=>e.map(x=>x.textContent).join(', ')));await pg.screenshot({path:out('priority-board.png')});
 // dashboard
 await pg.setViewportSize({width:1300,height:2600});
 await pg.evaluate(()=>mount('star-dashboard',{}));await pg.waitForTimeout(200);await pg.evaluate(()=>document.getElementById('host').style.height='auto');await pg.screenshot({path:out('dashboard.png'),clip:{x:0,y:0,width:1300,height:2140}});
 await pg.evaluate(()=>mount('star-weekly',{}));await pg.waitForTimeout(200);await pg.screenshot({path:out('weekly.png'),clip:{x:0,y:0,width:1300,height:780}});
 console.log('weekly kpis',await pg.$$eval('.std-kpi',e=>e.map(x=>x.querySelector('.std-kpi-label').textContent+'='+x.querySelector('.std-kpi-value').textContent).join(', ')));
 await pg.setViewportSize({width:1500,height:700});await pg.evaluate(()=>document.getElementById('host').style.height='700px');
 await pg.evaluate(()=>mount('star-timeline',{}));await pg.waitForTimeout(300);await pg.screenshot({path:out('timeline.png')});
 // settings tab + setup yaml
 const r=await pg.evaluate(async()=>{PLUGIN.tab.display();const n=PLUGIN.tab.containerEl.querySelectorAll('.setting-item').length;
   return n});
 console.log('settings rows',r);
 const vc=await pg.evaluate(async()=>{PLUGIN.cmds.find(c=>c.id==='create-tracker').callback();await LAST_MODAL.create();await new Promise(r=>setTimeout(r,50));return VAULT_CREATE});
 require('fs').writeFileSync(out('Tracker.base'),vc[0].c);console.log('created files',vc.map(x=>x.p).join(', '));
});
