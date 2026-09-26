const run=require('./harness');const path=require('path');const out=(n)=>path.join(__dirname,n);
run(async(pg)=>{
 await pg.evaluate(()=>window.ready);
 await pg.evaluate(()=>mount('star-board',{groupBy:{property:'note.status',direction:'ASC'},boardColumns:['Backlog','Blocked by me','Product in progress','Handover to design','UAT'],order:['file.name','note.task_id','note.priority','note.blocked_by','note.points','note.area']},fm=>['Backlog','Blocked by me','Product in progress','Handover to design','UAT'].includes(fm.status)));
 await pg.waitForTimeout(400);
 await pg.screenshot({path:out('kanban.png')});
 console.log('cols',await pg.$$eval('.base-board-column',e=>e.map(c=>c.dataset.columnName+':'+(c.querySelector('.base-board-column-count')||{}).textContent).join(' | ')));
 console.log('chips',await pg.$$eval('.base-board-card',e=>e.filter(c=>c.dataset.filePath).map(c=>c.dataset.filePath.slice(0,5)+'['+[...c.querySelectorAll('.base-board-card-chip')].map(x=>x.className.replace('base-board-card-chip','').trim()+'='+x.textContent).join('; ')+']').join('\n')));
 console.log('col colors',await pg.$$eval('.base-board-column',e=>e.map(c=>c.getAttribute('style')||'').join(' | ')));
});
